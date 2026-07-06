# DreamLens — Product Requirements Document (PRD)
**Version:** 1.0  
**Author:** Alfredo / American Mortgage Bank (AMB) / Korazin Creative  
**Status:** Draft — Ready for Fable 5 Build Prompt  
**Date:** July 2026

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Problem Statement](#problem-statement)
3. [Market Context & Competitive Landscape](#market-context)
4. [Product Vision](#product-vision)
5. [Goals](#goals)
6. [Non-Goals (v1)](#non-goals)
7. [User Personas](#user-personas)
8. [User Stories](#user-stories)
9. [Feature Requirements](#feature-requirements)
10. [Technical Architecture](#technical-architecture)
11. [Knowledge Base Strategy (No Web Search)](#knowledge-base-strategy)
12. [Memory & Longitudinal Learning System](#memory-system)
13. [Claude Integration Spec](#claude-integration-spec)
14. [Landing Page Spec](#landing-page-spec)
15. [Data Model](#data-model)
16. [API Endpoints](#api-endpoints)
17. [Success Metrics](#success-metrics)
18. [Open Questions](#open-questions)
19. [Timeline & Phasing](#timeline-phasing)
20. [Monetization Strategy](#monetization)

---

## 1. Executive Summary {#executive-summary}

**DreamLens** is a voice-first mobile application that lets users record their dreams immediately upon waking, then delivers AI-powered interpretations grounded in a curated dream symbol knowledge base. Over time, the app builds a longitudinal profile of the user's subconscious patterns — recurring symbols, emotional themes, stress indicators, and psychological archetypes — surfacing insights that no single dream interpretation session could provide alone.

The core experience is frictionless: wake up, open the app, speak. Everything else happens in the background.

The AI engine is powered by Claude (Anthropic) with a RAG (Retrieval-Augmented Generation) architecture backed by a proprietary dream symbol library, eliminating the need for live web search on every query while ensuring consistent, high-quality interpretations grounded in established psychological and cultural frameworks.

---

## 2. Problem Statement {#problem-statement}

Dreams are one of the most personal and psychologically rich experiences humans have — yet they are almost universally lost within minutes of waking. People who want to explore what their dreams mean face a fragmented, high-friction process: they must remember the dream, find an interpretation resource (book, website, app), look up individual symbols manually, and then try to synthesize meaning themselves across multiple lookups. There is no single tool that captures the dream at the moment of maximum memory fidelity (immediately upon waking), interprets it holistically, and remembers it across months to surface patterns the user cannot see themselves.

Existing apps (Shadow, DreamApp, Moonly) offer journaling and basic symbol lookup but none provide:
- True voice-first capture designed for the half-awake state
- Holistic AI interpretation (not symbol-by-symbol lookup)
- Longitudinal pattern recognition across a user's full dream history
- A personal subconscious profile that grows more accurate over time

The cost of not solving this: people lose insight into their own psychological state, recurring stress patterns go unrecognized, and a genuinely valuable self-awareness tool remains unbundled across a broken user experience.

---

## 3. Market Context & Competitive Landscape {#market-context}

**Market signals:**
- Dream journaling is a documented therapeutic practice recommended by sleep psychologists and therapists
- "Dream interpretation" receives 1M+ monthly searches (Google Trends)
- The mental wellness app category (Calm, Headspace) is valued at $5B+ and growing
- AI-native wellness apps are an underserved gap — most incumbents added AI as a feature, not a core design principle

**Competitors:**
| App | Voice Capture | AI Interpretation | Longitudinal Memory | Pattern Recognition |
|---|---|---|---|---|
| Shadow | Partial | No | Basic journal | No |
| DreamApp | No | Basic (symbol lookup) | No | No |
| Moonly | No | Minimal | No | No |
| DreamScript | No (text) | Yes (ungrounded LLM) | Yes (cross-dream) | Yes |
| MyDream | No (text) | Yes (ungrounded LLM) | Yes (multi-dream report) | Yes |
| **DreamLens** | **Yes (core)** | **Yes (Claude + RAG)** | **Yes (full)** | **Yes (v2)** |

> **Note (July 2026):** DreamScript and MyDream already ship longitudinal, cross-dream
> analysis. Longitudinal memory is **not** a novel feature and must not be marketed as one.

**Differentiator:** DreamLens does not win on feature novelty — it wins on execution quality:
1. **Voice-first capture** as the primary mechanic (competitors default to text)
2. **RAG-grounded interpretation** against a curated symbol library grounded in depth psychology and dream science (competitors query LLMs with no grounding source, producing inconsistent results)
3. **Privacy-forward architecture** (no audio stored, no dream content in logs)
4. **Superior interpretation depth** from the curated knowledge base

---

## 4. Product Vision {#product-vision}

> *"Every morning, your subconscious leaves you a message. DreamLens reads it — and remembers every one."*

DreamLens becomes the user's private dream analyst: present every morning, never forgetting, growing more attuned to the user's inner world with every entry. After 30 days, it surfaces patterns the user hasn't noticed. After 90 days, it can reflect back patterns that help you understand yourself — patterns that would take years of journaling to notice manually.

---

## 5. Goals {#goals}

**User Goals (what users achieve):**
- G1: Capture a dream within 60 seconds of waking, before memory fades
- G2: Receive a meaningful, holistic interpretation — not a symbol glossary, a real synthesis
- G3: See patterns in their dreams they couldn't identify themselves
- G4: Build a permanent, searchable record of their inner life

**Business Goals (what the product achieves):**
- G5: Achieve 40% Day-7 retention (dreams are daily — retention should be high if the product delivers value)
- G6: Convert 15% of free users to paid within 60 days
- G7: Reach 10,000 MAU within 6 months of launch
- G8: Establish a proprietary dream symbol knowledge base as a defensible data moat

---

## 6. Non-Goals (v1) {#non-goals}

- **NG1: Social/sharing features** — Dreams are intimate. Community features are a v2 decision, not assumed good.
- **NG2: Sleep tracking hardware integration** — Wearable data (Oura, Apple Watch) is compelling but out of scope for v1. Voice capture is the MVP.
- **NG3: Therapist/professional connections** — Mental health professional referrals require legal and compliance review. Explicitly deferred.
- **NG4: Real-time dream analysis during sleep** — Requires hardware. Not feasible.
- **NG5: Custom symbol databases per user** — Users can add notes, but they cannot upload their own symbol libraries in v1.
- **NG6: Web app** — Mobile-first only. The use case (rolling over and speaking) is inherently mobile.

---

## 7. User Personas {#user-personas}

### Persona A: "The Curious Seeker" (Primary)
- Age: 25–40, urban, educated
- Self-aware, interested in personal growth, already uses journaling or meditation apps
- Dreams frequently, has always been curious about what they mean
- Frustrated that dream memory fades before they can analyze it
- **Core need:** Capture + interpret before the dream is gone

### Persona B: "The Anxious Processor"
- Age: 30–50, going through a life transition (career change, relationship stress, loss)
- Experiences vivid or recurring dreams during stress periods
- Not necessarily interested in spirituality, but open to psychological insight
- **Core need:** Understand why they keep dreaming the same thing

### Persona C: "The Journaling Enthusiast"
- Age: 25–45, already keeps a physical or digital journal
- Wants to add a dream layer to their existing self-reflection practice
- Values the historical record as much as the interpretation
- **Core need:** Searchable dream archive with meaning attached

---

## 8. User Stories {#user-stories}

### Core Capture Flow
- US01: As a user waking from a dream, I want to open the app and immediately start speaking so that I can record the dream before the memory fades.
- US02: As a user, I want the app to transcribe my voice accurately so that I don't have to type anything in a half-awake state.
- US03: As a user, I want to review and lightly edit the transcription before submitting so that obvious errors don't corrupt my dream log.

### Interpretation Flow
- US04: As a user, I want to receive a holistic interpretation of my dream (not a list of symbol definitions) so that I understand what it might mean as a whole experience.
- US05: As a user, I want the interpretation to acknowledge multiple possible meanings so that I can decide what resonates rather than being told one definitive answer.
- US06: As a user, I want the interpretation to reference the specific imagery I described so that it feels personalized, not generic.

### Memory & Pattern Flow
- US07: As a recurring user, I want the app to note when a symbol, theme, or emotion appears in multiple dreams so that I can see what my subconscious is returning to.
- US08: As a user with 30+ entries, I want a "dream profile" summary so that I can understand my overall patterns in one view.
- US09: As a user, I want to search my dream history by keyword, symbol, or date so that I can find a specific entry.
- US10: As a user with recurring dreams, I want the app to surface this pattern proactively ("You've dreamed about water 7 times this month") so that I don't have to discover patterns myself.

### Account & Settings
- US11: As a user, I want my dream history to be private and encrypted so that I trust the app with intimate content.
- US12: As a user, I want to set a morning reminder to log my dream so that I build the habit before memory fades.
- US13: As a free user, I want to log up to 10 dreams before being asked to upgrade so that I can evaluate the product before paying.

---

## 9. Feature Requirements {#feature-requirements}

### P0 — Must Ship (MVP)

| ID | Feature | Description | Acceptance Criteria |
|---|---|---|---|
| F01 | Voice Recording | In-app microphone capture, minimum 5 minutes | Recording starts within 1 tap; background recording not required v1 |
| F02 | Speech-to-Text Transcription | Real-time or near-real-time transcription via device STT or Whisper API | Accuracy >90% for clear speech; handles filler words gracefully |
| F03 | Transcription Review & Edit | Editable text field pre-populated with transcription | User can tap to edit; submit button visible |
| F04 | Claude Dream Interpretation | RAG-powered interpretation via Claude API | Returns within 8 seconds; references user's specific imagery; 200–400 word response |
| F05 | Dream Journal (local + cloud) | Persist each dream entry with date, transcript, and interpretation | Entries survive app close; sync to Supabase within 30 seconds |
| F06 | Entry List View | Reverse chronological list of all dream entries | Shows date, first 80 characters of transcript, emotion tag |
| F07 | Entry Detail View | Full transcript + interpretation for any entry | Readable typography; no truncation |
| F08 | Morning Reminder Push Notification | Configurable daily reminder | User sets time; notification fires reliably; one tap opens to record screen |
| F09 | Auth (Email + Apple/Google Sign-In) | Secure account creation and login | Password reset flow; session persists; no re-login within 30 days |
| F10 | Basic Onboarding | 3-screen intro explaining the app | Skippable; first dream record prompt immediately after |

### P1 — Ship Shortly After

| ID | Feature | Description |
|---|---|---|
| F11 | Recurring Symbol Detection | Flag symbols appearing 3+ times; surface in entry and profile |
| F12 | Emotion Tagging | Auto-tag each dream with primary emotional tone (anxious, peaceful, surreal, etc.) |
| F13 | Dream Profile Page | Summary of top symbols, themes, emotions across all entries |
| F14 | Search | Full-text search across transcripts and interpretations |
| F15 | Streak Tracking | Consecutive days logged; motivational display |

### P2 — Future Versions

| ID | Feature | Description |
|---|---|---|
| F16 | Pattern Insight Reports | Weekly/monthly generated report on subconscious themes |
| F17 | Lucid Dream Training Mode | Prompts and techniques for inducing lucid dreams |
| F18 | Sleep Quality Correlation | Manual sleep quality input; correlate with dream tone |
| F19 | Export | PDF or CSV export of full dream journal |
| F20 | Wearable Integration | Apple Watch / Oura Ring sleep stage triggers |

---

## 10. Technical Architecture {#technical-architecture}

### Stack Recommendation

| Layer | Technology | Rationale |
|---|---|---|
| Mobile App | React Native (Expo) | Cross-platform iOS + Android; Expo handles audio APIs well |
| Backend API | Node.js + Express or Hono | Lightweight; fast to build; familiar to JS ecosystem |
| Database | Supabase (PostgreSQL + pgvector) | Managed Postgres; pgvector for semantic search; built-in auth; realtime |
| AI/LLM | Claude (claude-sonnet-4-6) | Best-in-class reasoning; long context for dream history injection |
| STT (Speech-to-Text) | iOS/Android native (`expo-speech-recognition`) for v1 | Native STT is faster, cheaper, and works offline — the 6am/no-signal case. Whisper API is the higher-accuracy fallback to evaluate at ~1K users (see OQ4), not a v1 dependency |
| Vector Embeddings | OpenAI text-embedding-3-small | Cost-effective; integrates with pgvector |
| File Storage | Supabase Storage | Audio file storage if raw recordings are persisted |
| Push Notifications | Expo Push Notifications | Managed; handles iOS/Android differences |
| Hosting (API) | Railway or Render | Simple deployment; scales with usage |

### Architecture Diagram (Conceptual)

```
[Mobile App (React Native / Expo)]
    |
    |— Voice Capture (Expo AV)
    |— STT (Whisper API / Native)
    |— Auth (Supabase Auth)
    |
    v
[Backend API (Node.js on Railway)]
    |
    |— POST /dreams (create entry)
    |— POST /dreams/:id/interpret (trigger RAG + Claude)
    |— GET /dreams (list with pagination)
    |— GET /dreams/:id (single entry)
    |— GET /profile/patterns (pattern analysis)
    |
    v
[Supabase]
    |— PostgreSQL: users, dreams, symbols, embeddings
    |— pgvector: dream_symbol_embeddings (RAG retrieval)
    |— Storage: audio files (optional)
    |
[RAG Pipeline]
    1. Embed user's dream transcript → vector
    2. Similarity search → top 15 relevant dream symbols from library
    3. Inject symbols + user's last 10 dream summaries + current transcript
    4. Call Claude with assembled context
    5. Return interpretation to app

[Claude API]
    — Receives: system prompt + dream symbol context + user history + current dream
    — Returns: structured interpretation (JSON with fields: summary, themes[], symbols[], emotional_tone, pattern_note)
```

---

## 11. Knowledge Base Strategy (No Web Search) {#knowledge-base-strategy}

This is the most important architectural decision. The goal is to avoid a live web search on every interpretation call — for cost, speed, consistency, and quality reasons.

### The Solution: Curated RAG Knowledge Base

**What it is:** A pre-built database of dream symbols, archetypes, and thematic interpretations stored as vector embeddings in Supabase pgvector.

**What it contains (estimated 3,000–8,000 entries):**
- Common dream symbols (water, flying, teeth, falling, being chased, houses, animals, vehicles, etc.)
- Jungian archetypes (shadow self, anima/animus, persona, the hero, the trickster)
- Freudian interpretive frameworks (wish fulfillment, anxiety displacement, latent vs manifest content)
- Cultural/mythological symbol sets (snakes across cultures, death symbols, rebirth imagery)
- Emotional/somatic patterns (body sensations in dreams, paralysis, weightlessness)
- Color symbolism
- Recurring scenario patterns (exam dreams, late-for-something dreams, falling dreams)
- Relationship dynamics (strangers, deceased relatives, celebrities as projections)

**How it works at query time:**
1. User's dream transcript is embedded (text-embedding-3-small) → vector
2. pgvector similarity search retrieves 10–20 most semantically relevant symbol entries
3. Retrieved entries are injected into Claude's system prompt as grounding context
4. Claude synthesizes a holistic interpretation — it is NOT just returning the lookup entries, it is reasoning across them in the context of the specific dream narrative

**Why this beats web search:**
- Consistent quality (no SEO garbage, no clickbait interpretation sites)
- Established interpretive traditions baked in (Jungian, Freudian, and cross-cultural symbol frameworks — offered as lenses, not fixed meanings)
- No latency (vector search is <100ms vs. web search round trip)
- No per-search cost (pgvector query vs. search API call)
- Privacy (no dream content leaving to a search engine)
- Offline capability (symbols cached locally in future)

**Knowledge base build plan:**
- Phase 1: Seed from public domain sources (Jung's collected works, Hall's "The Meaning of Dreams," Freud's "The Interpretation of Dreams")
- Phase 2: Expand with cultural symbol dictionaries (Native American, African, Eastern, Western)
- Phase 3: Proprietary refinement based on user feedback signals (thumbs up/down on interpretations)

---

## 12. Memory & Longitudinal Learning System {#memory-system}

This is the product's true differentiator and must be architected correctly from day one.

### Dream Memory Schema (per user)

Each dream entry stores:
- Raw transcript text
- Cleaned/edited transcript
- Full interpretation text
- Extracted fields (JSON): `symbols[]`, `themes[]`, `emotional_tone`, `archetype_tags[]`
- Date, time of entry, self-reported sleep quality (optional)
- Vector embedding of the transcript (for semantic deduplication and pattern search)

### Pattern Detection Logic

**Symbol frequency table:** For each user, maintain a running count of symbol appearances. At 3+ occurrences, flag as "recurring." At 5+, surface proactively.

**Theme clustering:** Using embeddings of each dream entry, cluster dreams semantically. Clusters that persist over weeks indicate active subconscious processing of a specific life area.

**Emotional arc tracking:** Plot emotional_tone across time. Persistent negative emotional tone over 2+ weeks is a signal worth surfacing gently (and eventually, a potential upsell to a wellness integration).

**What Claude receives on each new interpretation call:**
```
SYSTEM:
You are DreamLens, a compassionate and psychologically grounded dream analyst...
[Dream symbol context from RAG — 10-20 relevant entries]

USER HISTORY CONTEXT:
This user has logged 23 dreams. Key patterns to date:
- Recurring symbols: water (7x), a childhood home (4x), being late (5x)
- Dominant emotional tone: anxious (12 of 23 entries)
- Active themes: transition, identity uncertainty, time pressure
- Last dream (2 days ago): [brief summary]

CURRENT DREAM:
[User's transcript]

Return a JSON object with: { summary, themes[], symbols[], emotional_tone, pattern_note, questions_to_reflect_on[] }
```

**Pattern note field:** This is the key memory-aware output. When pattern data exists, Claude is instructed to reference it: *"This is the seventh time water has appeared in your dreams. In the context of your recent themes around transition and uncertainty, water often represents the unconscious mind processing change it hasn't yet consciously accepted..."*

---

## 13. Claude Integration Spec {#claude-integration-spec}

### Model
`claude-sonnet-4-6` — strong reasoning, cost-efficient, appropriate context window

### System Prompt Structure
```
[Role + Tone Definition]
You are DreamLens, a thoughtful dream analyst grounded in Jungian psychology, 
Freudian frameworks, and cross-cultural symbol traditions. Your tone is warm, 
curious, and non-prescriptive. You never claim to know definitively what a dream 
means — you offer interpretations and invite reflection. You do not diagnose, 
prescribe, or give medical advice.

[Knowledge Base Context — injected dynamically]
Relevant dream symbol reference material:
{rag_symbol_chunks}

[User History Context — injected dynamically]
{user_pattern_summary}

[Output Format Instructions]
Return a JSON object with exactly these fields:
- summary: string (2-3 sentences, holistic meaning)
- themes: string[] (3-5 psychological or emotional themes)
- symbols: [{symbol: string, interpretation: string}] (key symbols identified)
- emotional_tone: string (single dominant emotional quality)
- pattern_note: string | null (reference to recurring patterns if any; null if first entry)
- questions_to_reflect_on: string[] (2-3 open questions to help the user connect the dream to waking life)
```

### Token Budget Estimate (per call)
- System prompt + role: ~200 tokens
- RAG symbol context (15 entries × ~100 tokens): ~1,500 tokens
- User history summary (capped): ~500 tokens
- User dream transcript: ~300–800 tokens
- Total input: ~2,500–3,000 tokens
- Output: ~400–600 tokens
- **Estimated cost per interpretation:** ~$0.015–0.025 (Sonnet pricing)
- At 1,000 interpretations/day: ~$15–25/day in API costs → fully sustainable

---

## 14. Landing Page Spec {#landing-page-spec}

### Purpose
Convert cold visitors (via organic search, social, word-of-mouth) to app downloads and email waitlist signups. Must communicate the product's core value proposition in under 10 seconds.

### Above the Fold
- **Headline:** "Your dreams are trying to tell you something."
- **Subhead:** "DreamLens listens, interprets, and remembers — every morning."
- **CTA (Primary):** "Join the Waitlist" (email capture)
- **CTA (Secondary):** "See How It Works" (anchors to demo section)
- **Visual:** Dark, deep-space aesthetic — stars, soft nebula, dreamlike quality. No clichéd stock photos of sleeping people.

### Sections
1. Hero (above fold)
2. The Problem — "Dreams fade in minutes. The meaning lasts a lifetime."
3. How It Works — 3 steps: Wake → Speak → Understand
4. The Memory Layer — "After 30 days, DreamLens knows your patterns. After 90, it knows you."
5. Sample Interpretation — Show a mock dream entry with a full interpretation displayed
6. Knowledge Base Credibility — "Grounded in Jungian psychology, Freudian frameworks, and cross-cultural symbol traditions. Not guesswork."
7. Waitlist CTA with email capture
8. FAQ

### Design Direction
- **Palette:** Deep midnight blue (#0A0F1E), soft indigo (#1E2A5E), warm gold accent (#C9A84C), white text
- **Typography:** Elegant serif for headlines (something like Cormorant Garamond or Playfair Display), clean sans for body
- **Feel:** Premium, introspective, slightly mystical but grounded in science. NOT horoscope-app aesthetic.
- **Motion:** Subtle star-field or particle ambient background; smooth scroll reveals

### Voice Dictation Demo on Landing Page
- Interactive demo: user clicks microphone, speaks into browser
- Web Speech API captures input
- Sends to Claude API endpoint (demo key, rate-limited)
- Displays a sample interpretation
- This is the most powerful conversion mechanic on the page — let users feel the product before downloading

---

## 15. Data Model {#data-model}

### Tables (Supabase PostgreSQL)

```sql
-- Users (handled by Supabase Auth, extended)
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  display_name TEXT,
  timezone TEXT,
  reminder_time TIME,
  subscription_tier TEXT DEFAULT 'free', -- 'free', 'pro', 'annual'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dream entries
CREATE TABLE dreams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL,
  raw_transcript TEXT NOT NULL,
  edited_transcript TEXT,
  audio_url TEXT, -- optional, if raw audio stored
  interpretation JSONB, -- full Claude response object
  emotional_tone TEXT,
  symbols JSONB, -- [{symbol, interpretation}]
  themes TEXT[],
  embedding VECTOR(1536), -- for semantic similarity search
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dream symbol knowledge base
CREATE TABLE dream_symbols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  category TEXT, -- 'jungian_archetype', 'freudian', 'cultural', 'somatic', 'scenario'
  interpretation TEXT NOT NULL,
  source TEXT, -- attribution (e.g., "Hall, 1953")
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User pattern aggregates (computed, refreshed periodically)
CREATE TABLE user_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  symbol TEXT,
  occurrence_count INTEGER DEFAULT 0,
  first_seen TIMESTAMPTZ,
  last_seen TIMESTAMPTZ,
  UNIQUE(user_id, symbol)
);

-- Indexes
CREATE INDEX idx_dreams_user_id ON dreams(user_id);
CREATE INDEX idx_dreams_recorded_at ON dreams(recorded_at DESC);
CREATE INDEX idx_dream_symbols_embedding ON dream_symbols USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_dreams_embedding ON dreams USING ivfflat (embedding vector_cosine_ops);
```

---

## 16. API Endpoints {#api-endpoints}

```
POST   /api/dreams                    — Create new dream entry (transcript + audio_url)
POST   /api/dreams/:id/interpret      — Trigger RAG + Claude interpretation
GET    /api/dreams                    — List user's dreams (paginated, auth required)
GET    /api/dreams/:id                — Get single dream entry
PUT    /api/dreams/:id                — Update transcript (pre-interpretation edit)
DELETE /api/dreams/:id                — Delete entry

GET    /api/profile/patterns          — Get user's symbol/theme pattern summary
GET    /api/profile/summary           — Get dream profile (for Profile page)

POST   /api/demo/interpret            — Rate-limited public demo endpoint (landing page)

POST   /api/auth/register             — (handled by Supabase Auth)
POST   /api/auth/login                — (handled by Supabase Auth)
```

---

## 17. Success Metrics {#success-metrics}

### Leading Indicators (measure weekly)
| Metric | Target | Measurement |
|---|---|---|
| Day-1 retention | >60% | % of new users who log a second dream |
| Recording completion rate | >80% | % of sessions that produce a submitted transcript |
| Interpretation satisfaction | >70% thumbs up | In-app rating on interpretation |
| Time to first interpretation | <60 seconds from app open | Funnel timing |
| Waitlist conversion to install | >25% | Email → App Store click-through |

### Lagging Indicators (measure monthly)
| Metric | Target | Measurement |
|---|---|---|
| Day-30 retention | >35% | Cohort analysis |
| Day-7 retention | >45% | Cohort analysis |
| Free → Paid conversion | >12% within 60 days | Subscription funnel |
| Monthly dream entries per active user | >15 | Average entries/MAU |
| NPS | >50 | In-app survey at 30 days |

---

## 18. Open Questions {#open-questions}

| # | Question | Owner | Blocking? |
|---|---|---|---|
| OQ1 | Should raw audio recordings be stored or discarded post-transcription? (Privacy vs. replay value) | Product + Legal | No — default discard for v1 |
| OQ2 | What is the right tone for pattern insights? Jungian/academic or casual/conversational? | Design/Product | Needs user testing |
| OQ3 | Should the app include any content warnings / mental health disclaimers for distressing dreams? | Legal | Yes — add before launch |
| OQ4 | Whisper API vs. native device STT — accuracy vs. cost tradeoff at scale? | Engineering | No — prototype both, decide at 1K users |
| OQ5 | Knowledge base: license requirements for academic sources? | Legal | Yes — resolve before seeding KB |
| OQ6 | What triggers an upsell prompt? Entry limit? Feature gate? | Product | Decide pre-launch |
| OQ7 | HIPAA considerations if the app begins attracting clinical users? | Legal | No for v1; monitor |

---

## 19. Timeline & Phasing {#timeline-phasing}

### Phase 0: Foundation (Weeks 1–2)
- Supabase project setup (auth, database, pgvector extension)
- Dream symbol knowledge base seeding (500+ initial entries)
- Claude integration + RAG pipeline proof of concept
- Basic Express API with /dreams and /interpret endpoints

### Phase 1: MVP (Weeks 3–6)
- React Native app: voice recording, STT, transcript review
- Interpretation display screen
- Dream journal list + detail views
- Supabase sync
- Auth (email + Apple/Google)
- Morning push notification

### Phase 2: Memory Layer (Weeks 7–9)
- Pattern detection pipeline (symbol frequency, theme clustering)
- User pattern summary in Claude context
- Dream Profile page in app
- Pattern-aware interpretation responses

### Phase 3: Landing Page + Waitlist (Parallel with Phase 1)
- Landing page with voice demo
- Email capture (Resend or Mailchimp)
- App Store submission prep

### Phase 4: Monetization + Launch (Weeks 10–12)
- RevenueCat integration (subscription management)
- Free tier limits enforcement (10 dreams)
- Pro tier: unlimited dreams, pattern insights, search
- TestFlight beta → App Store submission

---

## 20. Monetization Strategy {#monetization}

### Freemium Model

**Free Tier:**
- Up to 10 dream entries
- Full interpretation on each
- No pattern analysis (teases that patterns exist after 7+ entries)
- 30-day history retention

**Pro Tier — $7.99/month or $59.99/year:**
- Unlimited dream entries
- Full pattern analysis and Dream Profile
- Search and filtering
- Lifetime history retention
- Priority interpretation speed
- Export to PDF

**Future:**
- DreamLens Premium ($14.99/month): Weekly AI-generated subconscious insight report, personalized reflection prompts, future wearable integration

### Unit Economics (rough)
- COGS per active Pro user: ~$0.50–1.00/month in Claude API calls (30 dreams × $0.025)
- Revenue per Pro user: $7.99/month
- Gross margin on Pro: ~87–93%
- Break-even at $10K MRR ≈ ~1,250 Pro subscribers

---

*End of DreamLens PRD v1.0*

---

## APPENDIX: Fable 5 Build Prompt

The following is a suggested prompt to give Fable 5 (or any AI-assisted coding tool) to begin building this product:

---

**BUILD PROMPT FOR FABLE 5:**

```
Build a mobile app called DreamLens using React Native with Expo.

CORE FEATURES TO BUILD:
1. Voice recording screen — single large microphone button, starts/stops recording
2. Transcription — use device native Speech-to-Text (expo-speech-recognition or similar)
3. Transcript review screen — editable text field, Submit button
4. Interpretation screen — shows structured dream analysis returned from API
5. Dream journal — list view of past entries, reverse chronological
6. Entry detail view — full transcript + interpretation
7. Morning reminder — push notification via Expo Notifications

BACKEND:
- Node.js API (Express or Hono) deployed to Railway
- Supabase for database (PostgreSQL with pgvector extension)
- Claude API (claude-sonnet-4-6) for dream interpretation
- OpenAI text-embedding-3-small for vector embeddings

DATABASE TABLES:
- user_profiles (extends Supabase Auth)
- dreams (id, user_id, recorded_at, raw_transcript, edited_transcript, interpretation JSONB, emotional_tone, symbols JSONB, themes TEXT[], embedding VECTOR(1536))
- dream_symbols (id, symbol, category, interpretation, source, embedding VECTOR(1536))
- user_patterns (user_id, symbol, occurrence_count)

RAG PIPELINE (critical):
When a user submits a dream for interpretation:
1. Embed the transcript using OpenAI text-embedding-3-small
2. Run pgvector similarity search against dream_symbols table
3. Retrieve top 15 most similar symbol entries
4. Fetch user's pattern summary from user_patterns
5. Build context string: [symbol entries] + [user pattern summary]
6. Send to Claude API with system prompt and context
7. Parse JSON response and store in dreams table

CLAUDE SYSTEM PROMPT (use this exactly):
"You are DreamLens, a thoughtful and compassionate dream analyst grounded in Jungian psychology and cross-cultural symbol traditions. Your tone is warm, curious, and non-prescriptive. You never claim to know definitively what a dream means. You offer interpretations and invite reflection. Do not diagnose or give medical advice.

Return ONLY a valid JSON object with these fields:
- summary: string (2-3 sentences, holistic meaning of the dream)
- themes: string[] (3-5 psychological or emotional themes present)
- symbols: [{symbol: string, interpretation: string}] (key symbols and their meaning in context)
- emotional_tone: string (single dominant emotional quality: e.g., 'anxious', 'peaceful', 'surreal', 'melancholic')
- pattern_note: string | null (if user has prior dreams with recurring elements, reference them; otherwise null)
- questions_to_reflect_on: string[] (2-3 open questions to connect the dream to waking life)"

DESIGN AESTHETIC:
- Deep midnight blue background (#0A0F1E)
- Soft indigo accent (#1E2A5E)  
- Warm gold highlights (#C9A84C)
- White/light text
- Elegant serif for display text (use Google Font: Cormorant Garamond)
- Clean sans-serif for body (Inter)
- Dreamlike, premium, introspective — not mystical or horoscope-adjacent

AUTH:
- Supabase Auth
- Email/password + Apple Sign-In + Google Sign-In

MONETIZATION (implement the gate, not the payment yet):
- Free users limited to 10 dream entries
- Show upgrade prompt on entry 11+
- RevenueCat integration stub (can be placeholder for now)

START WITH:
1. Supabase schema (run the SQL migrations first)
2. Backend API with /dreams and /dreams/:id/interpret endpoints
3. Seed the dream_symbols table with at least 50 common dream symbols before building the app
4. Then build the React Native app screens in this order: Record → Review → Interpretation → Journal List → Entry Detail
```
