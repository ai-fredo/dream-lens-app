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
import type { Express } from 'express';

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
}

interface FakeStore {
  // token -> user id
  tokens: Map<string, string>;
  profiles: Map<string, ProfileRow>;
  dreams: DreamRow[];
  nextDreamId: number;
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
    insert: (values: Record<string, unknown>) => FakeQuery;
    update: (values: Record<string, unknown>) => FakeQuery;
  };
}

function matches(row: DreamRow, filters: Filter[]): boolean {
  const rec = row as unknown as Record<string, unknown>;
  return filters.every((f) => rec[f.column] === f.value);
}

function fieldStr(row: DreamRow, column: string): string {
  return String((row as unknown as Record<string, unknown>)[column] ?? '');
}

/**
 * Build a fake client bound to the shared store. When `scopeUserId` is a
 * string, every `dreams` read/update is additionally filtered to that user's
 * rows (RLS emulation). `scopeUserId === null` is the unscoped/auth client.
 */
function makeClient(store: FakeStore, scopeUserId: string | null): FakeSupabaseClient {
  const scopedDreams = (): DreamRow[] =>
    scopeUserId === null ? store.dreams : store.dreams.filter((d) => d.user_id === scopeUserId);

  return {
    auth: {
      getUser: async (token: string) => {
        const userId = store.tokens.get(token);
        if (!userId) return { data: { user: null }, error: { message: 'invalid token' } };
        return { data: { user: { id: userId } }, error: null };
      },
    },
    from: (table: string) => ({
      select: (): FakeQuery =>
        new FakeQuery((q) => {
          if (table === 'user_profiles') {
            const idFilter = q.filters.find((f) => f.column === 'id');
            const row = idFilter ? store.profiles.get(String(idFilter.value)) ?? null : null;
            return { data: q.singleRow ? row : row ? [row] : [], error: null };
          }
          // dreams
          let rows = scopedDreams().filter((d) => matches(d, q.filters));
          if (q.orderCol) {
            const col = q.orderCol;
            rows = [...rows].sort((a, b) => {
              const av = fieldStr(a, col);
              const bv = fieldStr(b, col);
              return q.orderAsc ? av.localeCompare(bv) : bv.localeCompare(av);
            });
          }
          if (q.rangeFrom !== null && q.rangeTo !== null) {
            rows = rows.slice(q.rangeFrom, q.rangeTo + 1);
          }
          if (q.singleRow) {
            return { data: rows[0] ?? null, error: rows[0] ? null : { message: 'no rows' } };
          }
          return { data: rows, error: null };
        }),

      insert: (values: Record<string, unknown>): FakeQuery =>
        new FakeQuery((q) => {
          if (table !== 'dreams') return { data: null, error: { message: 'unsupported insert' } };
          const row: DreamRow = {
            id: `dream-${store.nextDreamId++}`,
            user_id: String(values.user_id),
            recorded_at: String(values.recorded_at),
            raw_transcript: String(values.raw_transcript),
            edited_transcript:
              values.edited_transcript === undefined || values.edited_transcript === null
                ? null
                : String(values.edited_transcript),
            created_at: new Date().toISOString(),
          };
          store.dreams.push(row);
          return { data: q.singleRow ? row : [row], error: null };
        }),

      update: (values: Record<string, unknown>): FakeQuery =>
        new FakeQuery((q) => {
          if (table === 'user_profiles') {
            const idFilter = q.filters.find((f) => f.column === 'id');
            const row = idFilter ? store.profiles.get(String(idFilter.value)) : undefined;
            if (row) Object.assign(row, values);
            return { data: null, error: null };
          }
          // dreams — scoped so a wrong-user update matches nothing → 404.
          const target = scopedDreams().find((d) => matches(d, q.filters));
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
  /** Registers a fake user + profile; returns its id and bearer token. */
  seedUser: (opts?: { tier?: 'free' | 'pro' | 'annual' }) => Promise<{ id: string; token: string }>;
}

/** Construct a fresh fake Supabase backed by a private in-memory store. */
export function makeFakeSupabase(): FakeSupabase {
  const store: FakeStore = {
    tokens: new Map(),
    profiles: new Map(),
    dreams: [],
    nextDreamId: 1,
  };
  let nextUser = 1;

  return {
    authClient: makeClient(store, null),
    clientForToken: (token: string) => {
      const userId = store.tokens.get(token) ?? null;
      return makeClient(store, userId);
    },
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
  };
}

// A single fake instance backs the offline seedUser/makeTestApp exports so that
// `seedUser()` and `makeTestApp()` share the same store within a test file.
const shared = makeFakeSupabase();

/** Offline seedUser used by the brief's integration tests. */
export const seedUser = shared.seedUser;

/** Bearer auth header for a token. */
export function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

/** A makeApp wired with the shared fake deps. */
export function makeTestApp(): Express {
  return makeApp({
    dreamsDeps: {
      // Cast at the fake<->real boundary: the fake implements only the slice
      // the router + auth middleware use (see file header). Kept local so no
      // production code depends on the fake's shape.
      authClient: shared.authClient as unknown as import('@supabase/supabase-js').SupabaseClient,
      clientForToken: (token: string) =>
        shared.clientForToken(token) as unknown as import('@supabase/supabase-js').SupabaseClient,
    },
  });
}
