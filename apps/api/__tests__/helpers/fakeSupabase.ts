// apps/api/__tests__/helpers/fakeSupabase.ts
//
// In-memory fake of the *narrow slice* of supabase-js that the dreams router
// and the auth middleware actually touch. Deliberately NOT a general Supabase
// emulator (YAGNI): it implements only `auth.getUser(token)` plus the exact
// query-builder chains the handlers call.
//
// RLS emulation: `makeFakeSupabase()` returns a factory. The single shared
// in-memory store is common to every client, but a client created for a given
// user id ("RLS-scoped") transparently filters every `dreams` read/update to
// rows owned by that user — so a cross-user fetch finds no row and the router
// returns 404, for the same reason it would in production under RLS. The
// unscoped client (`scopeUserId === null`) is used only by the auth middleware
// (which just calls `auth.getUser`) and never queries tables.
//
// `any` is avoided; where the supabase-js return shape is genuinely dynamic we
// use `unknown`/generics and narrow explicitly.
import { makeApp } from '../../src/app';
import type { Express, RequestHandler } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import type OpenAI from 'openai';
import type Anthropic from '@anthropic-ai/sdk';

// ---- Store shapes (snake_case, mirroring the SQL schema) ----

export interface ProfileRow {
  id: string;
  subscription_tier: 'free' | 'pro' | 'annual';
  dream_count: number;
}

export interface DreamRow {
  id: string;
  user_id: string;
  recorded_at: string;
  raw_transcript: string;
  edited_transcript: string | null;
  created_at: string;
  // Interpret columns (nullable until POST /interpret populates them).
  interpretation: unknown;
  emotional_tone: string | null;
  symbols: unknown;
  themes: string[] | null;
  embedding: number[] | null;
  needs_interpretation: boolean;
}

export interface UserPatternRow {
  user_id: string;
  pattern_type: 'symbol' | 'theme';
  label: string;
  occurrence_count: number;
  last_seen: string;
}

export interface UserInsightRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  payload: { key: string; symbol: string; count: number } | null;
  created_at: string;
  seen_at: string | null;
}

interface FakeStore {
  // token -> user id
  tokens: Map<string, string>;
  profiles: Map<string, ProfileRow>;
  dreams: DreamRow[];
  userPatterns: UserPatternRow[];
  userInsights: UserInsightRow[];
  nextDreamId: number;
  nextInsightId: number;
  // Account-deletion test hooks (see makeAccountFake below).
  deletedAuthUsers: Set<string>;
  /** When set to a user id, the next admin `.delete()` targeting that user's
   * rows (or the next `auth.admin.deleteUser` call for that id) fails once,
   * exercising the step-failure -> 500 envelope path. Cleared after firing. */
  failNextDeleteFor: string | null;
  /** When set to an RPC function name, the next call to that RPC fails once,
   * exercising the step-failure path. Cleared after firing. */
  failNextRpc: string | null;
}

interface QueryResult<T> {
  data: T | null;
  error: { message: string } | null;
}

// The supabase query builder is thenable; a chain resolves to a QueryResult.
// We model each supported chain explicitly rather than a generic mock.
type Filter = { column: string; value: unknown };

interface QueryState {
  filters: Filter[];
  orderCol: string | null;
  orderAsc: boolean;
  rangeFrom: number | null;
  rangeTo: number | null;
  limitCount: number | null;
  singleRow: boolean;
}

/**
 * A minimal chainable query builder covering exactly the calls the router
 * makes: select/insert/update, eq, order, range, single. It is a thenable so
 * `await`ing the chain resolves to `{ data, error }`.
 */
class FakeQuery implements PromiseLike<QueryResult<unknown>> {
  private filters: Filter[] = [];
  private orderCol: string | null = null;
  private orderAsc = true;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private limitCount: number | null = null;
  private singleRow = false;

  constructor(private readonly run: (q: QueryState) => QueryResult<unknown>) {}

  eq(column: string, value: unknown): this {
    this.filters.push({ column, value });
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }): this {
    this.orderCol = column;
    this.orderAsc = opts?.ascending ?? true;
    return this;
  }

  range(from: number, to: number): this {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  select(): this {
    // Post-insert/update `.select()` — no columns tracked (fake returns full row).
    return this;
  }

  single(): this {
    this.singleRow = true;
    return this;
  }

  then<TResult1 = QueryResult<unknown>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<unknown>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const result = this.run({
      filters: this.filters,
      orderCol: this.orderCol,
      orderAsc: this.orderAsc,
      rangeFrom: this.rangeFrom,
      rangeTo: this.rangeTo,
      limitCount: this.limitCount,
      singleRow: this.singleRow,
    });
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

// The subset of SupabaseClient the router/auth middleware use. We return this
// (cast to SupabaseClient at the boundary) so the fake stays honest about its
// surface without pulling in the full supabase-js type.
export interface FakeSupabaseClient {
  auth: {
    getUser: (token: string) => Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }>;
  };
  from: (table: string) => {
    select: (columns?: string) => FakeQuery;
    insert: (values: Record<string, unknown> | Record<string, unknown>[]) => FakeQuery;
    update: (values: Record<string, unknown>) => FakeQuery;
  };
  rpc: (fn: string, args: Record<string, unknown>) => Promise<QueryResult<unknown>>;
}

/**
 * The narrow admin-client surface `makeAccountRouter` needs: unscoped
 * `from(table).delete().eq(column, value)` (RLS-bypassing, like the real
 * service-role client) plus `auth.admin.deleteUser(id)`. Kept separate from
 * `FakeSupabaseClient` because delete/admin semantics differ from the
 * select/insert/update chains above (no RLS scoping — service_role bypasses
 * RLS in production too).
 */
export interface FakeAdminClient {
  auth: {
    admin: {
      deleteUser: (id: string) => Promise<{ data: unknown; error: { message: string } | null }>;
    };
  };
  from: (table: string) => {
    delete: () => { eq: (column: string, value: unknown) => Promise<{ error: { message: string } | null }> };
  };
}

/**
 * Build the service-role admin fake used by the account-deletion route.
 * Shares the same store as the scoped clients so deletions are visible to
 * later reads/tests. `store.failNextDeleteFor === userId` makes the very next
 * delete/deleteUser call targeting that user fail once (step-failure test).
 */
function makeAdminClient(store: FakeStore): FakeAdminClient {
  const maybeFail = (userId: string | undefined): { message: string } | null => {
    if (userId !== undefined && store.failNextDeleteFor === userId) {
      store.failNextDeleteFor = null;
      return { message: 'simulated delete failure' };
    }
    return null;
  };

  return {
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          const failure = maybeFail(id);
          if (failure) return { data: null, error: failure };
          store.deletedAuthUsers.add(id);
          store.profiles.delete(id);
          return { data: { user: { id } }, error: null };
        },
      },
    },
    from: (table: string) => ({
      delete: () => ({
        eq: async (column: string, value: unknown) => {
          const userId = column === 'user_id' || column === 'id' ? String(value) : undefined;
          const failure = maybeFail(userId);
          if (failure) return { error: failure };

          if (table === 'user_profiles') {
            store.profiles.delete(String(value));
            return { error: null };
          }
          if (table === 'dreams') {
            store.dreams = store.dreams.filter((r) => !(r[column as keyof DreamRow] === value));
            return { error: null };
          }
          if (table === 'user_patterns') {
            store.userPatterns = store.userPatterns.filter((r) => !(r[column as keyof UserPatternRow] === value));
            return { error: null };
          }
          if (table === 'user_insights') {
            store.userInsights = store.userInsights.filter((r) => !(r[column as keyof UserInsightRow] === value));
            return { error: null };
          }
          return { error: { message: `unsupported delete: ${table}` } };
        },
      }),
    }),
  };
}

function matches(row: Record<string, unknown>, filters: Filter[]): boolean {
  return filters.every((f) => row[f.column] === f.value);
}

function fieldStr(row: Record<string, unknown>, column: string): string {
  return String(row[column] ?? '');
}

/** Shape of one row in the `p_rows` jsonb array the RPC accepts. */
interface IncrementPatternRow {
  user_id: string;
  pattern_type: 'symbol' | 'theme';
  label: string;
  occurrence_count: number;
  last_seen: string;
}

/**
 * Emulates the `increment_user_patterns(p_rows jsonb)` SQL function from
 * supabase/migrations/20260705120000_pattern_engine.sql:
 *   INSERT ... ON CONFLICT (user_id, pattern_type, label) DO UPDATE
 *     SET occurrence_count = user_patterns.occurrence_count + 1,
 *         last_seen = EXCLUDED.last_seen
 * The function is SECURITY INVOKER, so RLS (WITH CHECK) on user_patterns
 * still applies to the calling (scoped) client — a row whose user_id isn't
 * the caller's own is rejected, same as a direct insert would be.
 */
function incrementUserPatterns(
  store: FakeStore,
  scopeUserId: string | null,
  pRows: unknown,
): QueryResult<unknown> {
  const rows = (pRows ?? []) as IncrementPatternRow[];
  for (const r of rows) {
    if (scopeUserId !== null && r.user_id !== scopeUserId) {
      return { data: null, error: { message: 'new row violates row-level security policy' } };
    }
  }
  for (const r of rows) {
    const existing = store.userPatterns.find(
      (p) => p.user_id === r.user_id && p.pattern_type === r.pattern_type && p.label === r.label,
    );
    if (existing) {
      existing.occurrence_count += 1;
      existing.last_seen = r.last_seen;
    } else {
      store.userPatterns.push({
        user_id: r.user_id,
        pattern_type: r.pattern_type,
        label: r.label,
        occurrence_count: r.occurrence_count,
        last_seen: r.last_seen,
      });
    }
  }
  return { data: null, error: null };
}

/**
 * Build a fake client bound to the shared store. When `scopeUserId` is a
 * string, every `dreams`/`user_patterns` read/update is additionally filtered
 * to that user's rows (RLS USING emulation), AND inserts/updates whose
 * `user_id` differs from the scope are rejected (RLS WITH CHECK emulation),
 * as a real policy would. `scopeUserId === null` is the unscoped/auth client.
 */
function makeClient(store: FakeStore, scopeUserId: string | null): FakeSupabaseClient {
  const scoped = <T extends { user_id: string }>(rows: T[]): T[] =>
    scopeUserId === null ? rows : rows.filter((r) => r.user_id === scopeUserId);

  // RLS WITH CHECK: a scoped client may only write rows it owns.
  const violatesWithCheck = (userId: unknown): boolean =>
    scopeUserId !== null && userId !== undefined && String(userId) !== scopeUserId;

  const asRec = (row: object): Record<string, unknown> => row as unknown as Record<string, unknown>;

  return {
    auth: {
      getUser: async (token: string) => {
        const userId = store.tokens.get(token);
        if (!userId) return { data: { user: null }, error: { message: 'invalid token' } };
        return { data: { user: { id: userId } }, error: null };
      },
    },
    rpc: async (fn: string, args: Record<string, unknown>): Promise<QueryResult<unknown>> => {
      // Test-hook: fail this RPC if failNextRpc is set and matches.
      if (store.failNextRpc === fn) {
        store.failNextRpc = null;
        return { data: null, error: { message: `simulated ${fn} failure` } };
      }
      // No seeded symbols in the offline fake → empty match set (a valid,
      // non-error result).
      if (fn === 'match_dream_symbols') return { data: [], error: null };
      if (fn === 'increment_user_patterns') {
        return incrementUserPatterns(store, scopeUserId, args.p_rows);
      }
      return { data: null, error: { message: `unsupported rpc: ${fn}` } };
    },
    from: (table: string) => ({
      select: (): FakeQuery =>
        new FakeQuery((q) => {
          if (table === 'user_profiles') {
            const idFilter = q.filters.find((f) => f.column === 'id');
            const row = idFilter ? store.profiles.get(String(idFilter.value)) ?? null : null;
            return { data: q.singleRow ? row : row ? [row] : [], error: null };
          }
          const source: Array<{ user_id: string }> =
            table === 'user_patterns'
              ? store.userPatterns
              : table === 'user_insights'
                ? store.userInsights
                : store.dreams;
          let rows = scoped(source).filter((r) => matches(asRec(r), q.filters));
          if (q.orderCol) {
            const col = q.orderCol;
            rows = [...rows].sort((a, b) => {
              const av = fieldStr(asRec(a), col);
              const bv = fieldStr(asRec(b), col);
              return q.orderAsc ? av.localeCompare(bv) : bv.localeCompare(av);
            });
          }
          if (q.rangeFrom !== null && q.rangeTo !== null) {
            rows = rows.slice(q.rangeFrom, q.rangeTo + 1);
          }
          if (q.limitCount !== null) {
            rows = rows.slice(0, q.limitCount);
          }
          if (q.singleRow) {
            return { data: rows[0] ?? null, error: rows[0] ? null : { message: 'no rows' } };
          }
          return { data: rows, error: null };
        }),

      insert: (values: Record<string, unknown> | Record<string, unknown>[]): FakeQuery =>
        new FakeQuery((q) => {
          // user_insights is the one table insights.ts inserts an *array* of
          // rows into (batch insert of every threshold crossed this call).
          // Every other table here still inserts a single row at a time, so
          // we branch on the input shape rather than widening every branch.
          if (table === 'user_insights') {
            const rowsIn = Array.isArray(values) ? values : [values];
            for (const v of rowsIn) {
              if (violatesWithCheck(v.user_id)) {
                return { data: null, error: { message: 'new row violates row-level security policy' } };
              }
            }
            const inserted: UserInsightRow[] = rowsIn.map((v) => ({
              id: `insight-${store.nextInsightId++}`,
              user_id: String(v.user_id),
              type: String(v.type),
              title: String(v.title),
              body: String(v.body),
              payload: (v.payload as UserInsightRow['payload']) ?? null,
              created_at: new Date().toISOString(),
              seen_at: null,
            }));
            store.userInsights.push(...inserted);
            return { data: q.singleRow ? (inserted[0] ?? null) : inserted, error: null };
          }

          const value: Record<string, unknown> = (Array.isArray(values) ? values[0] : values) ?? {};
          if (violatesWithCheck(value.user_id)) {
            return { data: null, error: { message: 'new row violates row-level security policy' } };
          }
          if (table === 'dreams') {
            const row: DreamRow = {
              id: `dream-${store.nextDreamId++}`,
              user_id: String(value.user_id),
              recorded_at: String(value.recorded_at),
              raw_transcript: String(value.raw_transcript),
              edited_transcript:
                value.edited_transcript === undefined || value.edited_transcript === null
                  ? null
                  : String(value.edited_transcript),
              created_at: new Date().toISOString(),
              interpretation: null,
              emotional_tone: null,
              symbols: null,
              themes: null,
              embedding: null,
              needs_interpretation: false,
            };
            store.dreams.push(row);
            return { data: q.singleRow ? row : [row], error: null };
          }
          if (table === 'user_patterns') {
            const row: UserPatternRow = {
              user_id: String(value.user_id),
              pattern_type: (value.pattern_type as UserPatternRow['pattern_type']) ?? 'symbol',
              label: String(value.label),
              occurrence_count: Number(value.occurrence_count ?? 1),
              last_seen: String(value.last_seen ?? new Date().toISOString()),
            };
            store.userPatterns.push(row);
            return { data: q.singleRow ? row : [row], error: null };
          }
          return { data: null, error: { message: `unsupported insert: ${table}` } };
        }),

      update: (values: Record<string, unknown>): FakeQuery =>
        new FakeQuery((q) => {
          if (table === 'user_profiles') {
            const idFilter = q.filters.find((f) => f.column === 'id');
            const row = idFilter ? store.profiles.get(String(idFilter.value)) : undefined;
            if (row) Object.assign(row, values);
            return { data: null, error: null };
          }
          if (violatesWithCheck(values.user_id)) {
            return { data: null, error: { message: 'new row violates row-level security policy' } };
          }
          // Scoped so a wrong-user update matches nothing → 404 (RLS USING).
          const source: Array<{ user_id: string }> = table === 'user_patterns' ? store.userPatterns : store.dreams;
          const target = scoped(source).find((r) => matches(asRec(r), q.filters));
          if (!target) {
            return { data: q.singleRow ? null : [], error: { message: 'no rows' } };
          }
          Object.assign(target, values);
          return { data: q.singleRow ? target : [target], error: null };
        }),
    }),
  };
}

export interface FakeSupabase {
  /** Feeds makeRequireAuth — an unscoped client used only for auth.getUser. */
  authClient: FakeSupabaseClient;
  /** Request-scoped, RLS-emulating client for a bearer token. */
  clientForToken: (token: string) => FakeSupabaseClient;
  /** Service-role admin client (RLS-bypassing) for account deletion. */
  adminClient: FakeAdminClient;
  /** Registers a fake user + profile; returns its id and bearer token. */
  seedUser: (opts?: { tier?: 'free' | 'pro' | 'annual' }) => Promise<{ id: string; token: string }>;
  /** Test-only escape hatch into the backing store (see __fakeStoreForTests). */
  store: FakeStore;
}

/** Construct a fresh fake Supabase backed by a private in-memory store. */
export function makeFakeSupabase(): FakeSupabase {
  const store: FakeStore = {
    tokens: new Map(),
    profiles: new Map(),
    dreams: [],
    userPatterns: [],
    userInsights: [],
    nextDreamId: 1,
    nextInsightId: 1,
    deletedAuthUsers: new Set(),
    failNextDeleteFor: null,
    failNextRpc: null,
  };
  let nextUser = 1;

  return {
    authClient: makeClient(store, null),
    clientForToken: (token: string) => {
      const userId = store.tokens.get(token) ?? null;
      return makeClient(store, userId);
    },
    adminClient: makeAdminClient(store),
    seedUser: async (opts) => {
      const id = `user-${nextUser++}`;
      const token = `token-${id}`;
      store.tokens.set(token, id);
      store.profiles.set(id, {
        id,
        subscription_tier: opts?.tier ?? 'free',
        dream_count: 0,
      });
      return { id, token };
    },
    store,
  };
}

// A single fake instance backs the offline seedUser/makeTestApp exports so that
// `seedUser()` and `makeTestApp()` share the same store within a test file.
const shared = makeFakeSupabase();

/** Offline seedUser used by the brief's integration tests. */
export const seedUser = shared.seedUser;

/**
 * Test-only escape hatch into the shared in-memory store, so account.test.ts
 * can seed extra rows (user_patterns) and assert post-deletion state (dreams/
 * profile/patterns gone, auth user deleted) without a live Supabase instance.
 * Not used by production code.
 */
export const __fakeStoreForTests = {
  get dreams(): DreamRow[] {
    return shared.store.dreams;
  },
  get userPatterns(): UserPatternRow[] {
    return shared.store.userPatterns;
  },
  get userInsights(): UserInsightRow[] {
    return shared.store.userInsights;
  },
  get profiles(): Map<string, ProfileRow> {
    return shared.store.profiles;
  },
  get deletedAuthUsers(): Set<string> {
    return shared.store.deletedAuthUsers;
  },
  set failNextDeleteFor(userId: string | null) {
    shared.store.failNextDeleteFor = userId;
  },
  get failNextDeleteFor(): string | null {
    return shared.store.failNextDeleteFor;
  },
  set failNextRpc(fn: string | null) {
    shared.store.failNextRpc = fn;
  },
  get failNextRpc(): string | null {
    return shared.store.failNextRpc;
  },
};

/** Bearer auth header for a token. */
export function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

// ---- Default fake AI clients (offline) ----

/** Minimal OpenAI fake: returns a deterministic 1536-dim embedding. */
function makeFakeOpenAI(): OpenAI {
  const embedding = Array.from({ length: 1536 }, () => 0.01);
  return {
    embeddings: {
      create: async () => ({ data: [{ embedding }] }),
    },
  } as unknown as OpenAI;
}

/** Minimal Anthropic fake: returns a valid interpretation JSON in a text block. */
function makeFakeAnthropic(): Anthropic {
  const payload = {
    summary: 'A holistic reflection on the dream as a complete experience.',
    themes: ['Freedom', 'The unknown', 'Transition'],
    symbols: [
      { symbol: 'ocean', interpretation: 'the vast unconscious' },
      { symbol: 'flight', interpretation: 'a desire for release' },
    ],
    emotionalTone: 'surreal',
    patternNote: null,
    questionsToReflectOn: ['What are you moving toward?', 'What does the ocean hold for you?'],
  };
  return {
    messages: {
      create: async () => ({ content: [{ type: 'text', text: JSON.stringify(payload) }] }),
    },
  } as unknown as Anthropic;
}

// A no-op limiter, used as the demo router's default in tests so repeated
// demo calls across test files don't hit the real 3/hr demoLimiter.
const noopDemoLimiter: RequestHandler = (_req, _res, next) => next();

/** Options for the offline test app: inject fakes to exercise failure/limit paths. */
export interface MakeTestAppOptions {
  openai?: OpenAI;
  anthropic?: Anthropic;
  interpretLimiter?: RequestHandler;
  demoLimiter?: RequestHandler;
}

/** A makeApp wired with the shared fake deps (plus optional AI/limiter overrides). */
export function makeTestApp(options: MakeTestAppOptions = {}): Express {
  return makeApp({
    dreamsDeps: {
      // Cast at the fake<->real boundary: the fake implements only the slice
      // the router + auth middleware use (see file header). Kept local so no
      // production code depends on the fake's shape.
      authClient: shared.authClient as unknown as SupabaseClient,
      clientForToken: (token: string) => shared.clientForToken(token) as unknown as SupabaseClient,
      openai: options.openai ?? makeFakeOpenAI(),
      anthropic: options.anthropic ?? makeFakeAnthropic(),
      ...(options.interpretLimiter ? { interpretLimiter: options.interpretLimiter } : {}),
    },
    accountDeps: {
      // Same cast rationale as dreamsDeps above: the fake admin client
      // implements only the delete/deleteUser slice makeAccountRouter uses.
      authClient: shared.authClient as unknown as SupabaseClient,
      adminClient: shared.adminClient as unknown as SupabaseClient,
    },
    demoDeps: {
      anthropic: options.anthropic ?? makeFakeAnthropic(),
      demoLimiter: options.demoLimiter ?? noopDemoLimiter,
    },
  });
}
