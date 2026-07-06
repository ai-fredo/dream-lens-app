# DreamLens — UI Design Specification
**Version:** 1.0  
**Companion to:** dreamlens-prd.md, dreamlens-engineering-standards.md  
**Audience:** Fable 5 / any engineer implementing the UI  
**Status:** Binding — do not deviate without explicit client approval

---

## DESIGN PHILOSOPHY STATEMENT

Before any pixel decisions: understand what this product is.

DreamLens is used in a liminal state — the few minutes between sleeping and full wakefulness, when the boundary between the conscious and subconscious is still permeable. The person using it is literally lying in the dark, possibly disoriented, trying to hold onto something that is actively dissolving from memory. The UI exists to serve that exact moment.

That means:
- **Silence over noise.** Every unnecessary element is a distraction that costs the user time and dream memory. The design should feel like it's helping them not wake up fully — not stimulating them.
- **Darkness is the baseline.** Not dark mode as an option. Darkness as the designed reality, because every user of this app will use it in a dark room.
- **Touch before sight.** The core action (record) should be findable by touch alone, without having to orient visually. The record button is large, centered, and nothing else competes with it.
- **Words carry emotional weight.** This is not a productivity app. The copy, the typography treatment, and the amount of whitespace around each element all communicate to the user that their dreams matter.

The aesthetic risk we're taking: **radical restraint on the recording screen, combined with expressive density on the interpretation screen.** These two screens are opposite experiences — one is about capture under pressure, one is about contemplation after the pressure is gone. The design should feel different on each.

---

## WHAT THIS IS NOT

Before describing what to build, be explicit about what this design must never become:

**Not a "mystical" or horoscope app.** No crystal balls. No moon phases unless the user has actual moon cycle data to track. No tarot aesthetics. No glowing orbs. No "ethereal" gradients made of purple and pink. That visual language signals "not serious" to the users who need this most.

**Not a medical or clinical app.** No charts that look like vital signs. No progress percentages. No gamification. No streak flames. This is a reflective tool, not a fitness tracker.

**Not a journaling app with a dark theme.** The design must feel like it was built from the ground up for dreams and the morning state, not like a generic notes app that got a dark color scheme.

**Not AI slop.** This means: no generic hero image of someone sleeping peacefully, no stock-looking icons, no generic card shadows, no "lorem ipsum" quality placeholder design. Every element earns its place.

---

## DESIGN SYSTEM TOKENS

> **Single source of truth:** the shipping token values live in
> `apps/mobile/src/design/tokens.ts` (defined in engineering-standards Section 8).
> The values below describe intent and usage. Where a specific hex/alpha here differs
> from `tokens.ts` (e.g. `text.secondary`, `text.muted`, the semantic and recording
> colors), **`tokens.ts` wins** — reconcile this doc to it, and never hard-code a color
> in a component. Do not let the two drift again.

### Color Philosophy

The palette is built around one tension: **the warmth of candlelight against deep midnight.** The gold is not decorative. It represents the moment a dream surfaces into memory — the single warm note in darkness.

```
Core Surfaces:
  bg-base:     #070C1A  — The void. Screen background. Deeper than typical dark.
  bg-elevated: #0D1628  — Cards, entry rows. Just perceptible as different from bg-base.
  bg-overlay:  #141E3C  — Bottom sheets, modals. Indigo cast.
  bg-input:    rgba(255,255,255,0.05)  — Text inputs, transcript areas.

Accent (use sparingly — maximum 2 instances on any screen):
  gold-primary:  #C9A84C  — The brand mark. Interactive elements, focused states.
  gold-light:    #DFC27A  — Hover states, lighter accents.
  gold-pale:     #EDD9A3  — Used only in interpretation text for key phrases.
  gold-dim:      rgba(201,168,76,0.12)  — Background tints. Barely perceptible.
  gold-border:   rgba(201,168,76,0.22)  — Subtle borders around gold-accented elements.

Text (never pure white — warm off-white preserves the night atmosphere):
  text-primary:   #F2EFEA  — Main content text.
  text-secondary: rgba(242,239,234,0.60)  — Supporting labels, metadata.
  text-muted:     rgba(242,239,234,0.35)  — Placeholders, disabled states, hints.
  text-accent:    #C9A84C  — Accented text (sparingly).

Structural:
  border-subtle:  rgba(255,255,255,0.07)  — Default hairline borders.
  border-medium:  rgba(255,255,255,0.14)  — Stronger dividers.
  border-gold:    rgba(201,168,76,0.22)  — Gold-tinged borders on accent cards.

Semantic:
  error:     #D95858  — Muted red, not aggressive.
  success:   #5CAD5C  — Quiet green.

Recording state:
  rec-active: #C85252  — Recording indicator. Warm red.
  rec-pulse:  rgba(200,82,82,0.20)  — Pulse animation shadow.
```

### Typography System

**Two typefaces. No more, ever.**

**Cormorant Garamond** (Display) — Used only for emotional content that needs weight and intimacy: interpretation summaries, dream titles when the user names them, onboarding headlines, the app name in the nav. This face is ancient, literary, and carries the gravitas the subject deserves. Use at 300 or 400 weight only. Never bold. Italic available for emphasis in interpretation text.

**Inter** (Body/UI) — Everything functional: buttons, labels, metadata, navigation, settings, form fields, the journal list. Clean, invisible, never competes with Cormorant.

```
TYPE SCALE:

Display (Cormorant Garamond):
  display-xl:  44sp  |  lh 50  |  ls -0.5  |  weight 300
  display-lg:  34sp  |  lh 40  |  ls -0.3  |  weight 400
  display-md:  26sp  |  lh 32  |  ls -0.2  |  weight 400
  display-sm:  20sp  |  lh 26  |  ls 0     |  weight 400

Body (Inter):
  body-lg:     17sp  |  lh 26  |  ls 0     |  weight 400
  body-md:     15sp  |  lh 23  |  ls 0     |  weight 400
  body-sm:     13sp  |  lh 20  |  ls 0.1   |  weight 400

Labels (Inter):
  label-lg:    15sp  |  lh 20  |  ls 0.1   |  weight 500
  label-md:    13sp  |  lh 18  |  ls 0.1   |  weight 500
  label-sm:    11sp  |  lh 16  |  ls 0.12  |  weight 500

Eyebrow (Inter, uppercase):
  eyebrow-md:  10sp  |  lh 14  |  ls 0.18  |  weight 500  |  UPPERCASE
  eyebrow-sm:  9sp   |  lh 12  |  ls 0.16  |  weight 500  |  UPPERCASE

Monospace (for timestamps, entry IDs — rarely needed):
  mono:        13sp  |  lh 20  |  ls 0.02  |  weight 400

RULE: Use Cormorant only for dream content and emotional moments.
Use Inter for everything the user taps, types, or navigates.
Never mix them in the same text block.
```

### Spacing System

All spacing in multiples of 4dp. The 8pt grid is the foundation.

```
4dp  — Minimum gap between inline elements (icon + label)
8dp  — Tight internal padding, small gaps
12dp — Medium internal padding
16dp — Standard padding (most card interiors)
20dp — Comfortable section breathing room
24dp — Section separators
32dp — Screen-level horizontal padding
40dp — Between major content sections
48dp — Large vertical rhythm gaps
64dp — Screen-level top/bottom breathing room (after safe area)
```

### Elevation & Depth

No drop shadows. Depth is communicated through background color steps only.

```
Level 0 — bg-base (#070C1A) — screen background
Level 1 — bg-elevated (#0D1628) — cards, list items
Level 2 — bg-overlay (#141E3C) — bottom sheets, modals
Level 3 — Color accent — focus state, active record button ring
```

### Border Radius

```
sm:   6dp  — Small elements (pills, badges, tiny chips)
md:   12dp — Standard cards, buttons, input fields
lg:   16dp — Large cards, bottom sheet corners
xl:   24dp — Full rounded buttons, record button ring
full: 9999 — Circular elements (record button, avatars)
```

### Touch Targets

This is non-negotiable. Dreams are recorded in a half-awake state.

```
Minimum touch target:    56dp × 56dp (all interactive elements)
Standard button height:  52dp
Record button visible:   96dp circle
Record button tap area:  128dp (transparent extension around visible button)
Journal row height:      76dp minimum
Tab bar items:           62dp height
```

---

## SCREEN SPECIFICATIONS

### Screen 1: RecordScreen
**The product's most important screen. Everything else is secondary.**

```
PURPOSE: Capture a dream description before memory degrades. Maximum speed, 
minimum friction, zero cognitive load.

LAYOUT — full screen dark canvas:

─────────────────────────────────────────────
 [status bar — transparent, light text]
─────────────────────────────────────────────

 [safe area inset, ~44dp on notch devices]

 "This morning's dream"                     ← display-sm, text-secondary
 FRIDAY, JULY 4                             ← eyebrow-sm, text-muted, 8dp below

 [40dp spacer]

 ╔═══════════════════════════════════════╗
 ║                                       ║
 ║  [transcript area — 180dp min height] ║
 ║                                       ║
 ║  Default state:                       ║
 ║  "Speak when you're ready..."         ║
 ║  → body-lg, italic, text-muted, centered
 ║                                       ║
 ║  Recording state:                     ║
 ║  Live transcription text appears here ║
 ║  → body-lg, text-primary, left-aligned,
 ║    no border, no card — just raw text ║
 ║                                       ║
 ╚═══════════════════════════════════════╝

 [32dp spacer]

            ◯ RECORD BUTTON ◯
            [centered, 96dp]

 [20dp spacer]

 "Tap to begin"                            ← body-sm, text-muted, centered
 
 [flexible spacer — grows to fill remaining height]

 Journal →                                 ← label-md, text-secondary, right-aligned
                                              32dp from right edge
                                              56dp from bottom safe area

─────────────────────────────────────────────
 [bottom safe area]
─────────────────────────────────────────────
```

**Record Button States (the most specified element in this document):**

```
DEFAULT STATE:
  Circle: 96dp diameter
  Background: bg-elevated (#0D1628)
  Border: 1.5dp, gold-border (rgba(201,168,76,0.22))
  Icon: microphone SVG, 32dp, gold-primary (#C9A84C)
  Tap area: 128dp transparent circle (centered on button)

PRESS STATE (finger down, not yet recording):
  Border: gold-primary (#C9A84C) — instant, no animation
  Scale: 0.96 — spring, 150ms, no overshoot

RECORDING STATE:
  Border: 2dp, rec-active (#C85252)
  Background: rgba(200,82,82,0.08) — barely perceptible red tint
  Icon: square/stop shape, 20dp × 20dp, rec-active (#C85252)
  Animation: single pulse ring expanding outward
    - Ring: same color as border, starts at 96dp, expands to 120dp
    - Opacity: 0.6 → 0, duration 1600ms, repeating
    - Do NOT animate the button itself — only the ring
  
STOPPING STATE (button tapped to stop, transcript processing):
  Returns immediately to default border/color
  Icon: checkmark, gold-primary
  No animation — instant feedback that the action registered

DISABLED STATE (no transcript content):
  Opacity: 0.4
  Hint text: "Nothing recorded yet"
```

**Transcript Area:**
```
No card. No border. No background color. Just text on the screen background.
The absence of chrome around the transcript is intentional — it signals to 
the user that this is not a form they're filling out, it's a thought they're 
capturing. Do not add a card, a border, or a box.

The text fades in word by word as STT delivers results. No jump cuts.
Font-size matches body-lg (17sp) so it's readable without glasses in low light.
Color: text-primary — the brightest text available.
Style: italic — this is dream narrative, not UI text.
```

**Navigation bar: None.**
The record screen has no navigation bar. No back button on first open. No title bar. The only navigation element is the "Journal →" text link at the bottom — present but visually quiet.

---

### Screen 2: ReviewScreen

```
PURPOSE: Let the user correct transcription errors before interpretation. 
This is a brief pause, not a full editing experience.

LAYOUT:

 [Nav bar: Back arrow (left), "Your dream" centered, label-lg, text-primary]

 [24dp top padding below nav]

 DATE                                       ← eyebrow-sm, text-muted
 Friday, July 4 at 6:23 AM                 ← label-md, text-secondary, 4dp below

 [20dp spacer]

 "Review your dream"                        ← display-sm, text-primary
 "Correct any errors before interpretation" ← body-md, text-secondary, 8dp below

 [24dp spacer]

 ┌─────────────────────────────────────────┐
 │                                         │
 │  [TextInput — multiline]                │
 │  Displays raw transcript, editable      │
 │  → body-lg, text-primary               │
 │  → 16dp internal padding               │
 │  → bg-input background                 │
 │  → border-subtle border (1dp)          │
 │  → radius-md                           │
 │  → min height: 200dp                   │
 │  → max height: 55% of screen           │
 │  → scrollable if content overflows     │
 │                                         │
 └─────────────────────────────────────────┘

 [12dp spacer]
 
 "Lightly edit any transcription errors. The meaning matters more than exact words."
 → body-sm, text-muted, italic

 [flexible spacer]

 [Interpret this dream]                    ← Primary button, full width
                                              bg: gold-primary
                                              text: #070C1A (dark on gold)
                                              height: 52dp
                                              radius: full (26dp)
                                              label: label-lg

 [Skip interpretation, save only]          ← Text link below button
                                              label-sm, text-muted
                                              24dp below primary button
                                              only show if user explicitly wants to save without AI

 [bottom safe area]
```

**Key design decisions:**
- The "Review" screen is purposefully quick. There is no elaborate UI here — one text field, one action button, minimal explanation. The user should feel they're spending 20 seconds here at most.
- The edit instruction is italic and muted — it should read as a whisper, not a directive.
- The primary CTA button uses gold background with dark text — the only place in the app where the button background is gold. Every other button is outlined or text-only. This makes "Interpret" the unambiguous primary action.

---

### Screen 3: InterpretationScreen

```
PURPOSE: Deliver the interpretation in a way that feels like a thoughtful 
person speaking to you, not a report being generated. The visual shift from 
the sparse RecordScreen to the textured InterpretationScreen should feel like 
emerging from a quiet hallway into a warm room.

LAYOUT — Scrollable:

 [Nav bar: Back arrow (left), "Friday's dream" centered, label-lg, text-primary]

 ─────────────────────────────────
 LOADING STATE (shown during API call, 4–8 seconds):
 
 [centered in screen]
 ◯ — subtle breathing circle animation (no spinner)
   → 48dp circle, border-gold, opacity pulses 0.4→0.8→0.4, 2s cycle
   → Do not show percentage or progress bar
 
 "Reading your dream"                      ← body-md, text-muted, centered, 20dp below circle
 
 ─────────────────────────────────
 CONTENT STATE:

 [32dp top padding]
 
 EMOTIONAL TONE INDICATOR:
 [small rounded pill, top-right, 12dp from edge]
 Example: "Anxious"
 → eyebrow-sm text, gold-dim background, gold-border border, radius-full
 → 8dp vertical × 14dp horizontal padding

 DREAM DATE:
 "Friday, July 4"                          ← eyebrow-md, text-muted
 [8dp below]

 SUMMARY BLOCK:
 [The most important element on this screen]
 
 The interpretation summary text is displayed in Cormorant Garamond,
 display-md (26sp), text-primary, line-height 36.
 
 No card. No border. No background. The text lives on the screen directly.
 This is the closest thing to hearing a voice speaking to you.
 
 Example rendering:
 "This dream places you in the role of
  observer at a threshold — the door you
  couldn't open is a recurring symbol of
  transition that your subconscious hasn't
  yet resolved."

 [32dp spacer]
 [horizontal divider — 1dp, border-subtle, 32dp horizontal margin]
 [32dp spacer]

 THEMES SECTION:
 "Themes"                                  ← eyebrow-sm, text-muted
 [12dp below]
 
 Horizontal row of theme pills:
 Each pill: label-sm, text-accent, gold-dim bg, gold-border border, radius-sm, 8dp×14dp padding
 Wrap if needed. 8dp gap between pills.
 Examples: "Unresolved transition"  "Identity uncertainty"  "Avoidance"

 [28dp spacer]

 SYMBOLS SECTION:
 "In your dream"                           ← eyebrow-sm, text-muted
 [16dp below]
 
 For each identified symbol, a row:
 ┌─────────────────────────────────────────┐
 │ DOOR                          [12dp pad]│ ← label-lg, text-primary
 │ A door you cannot open appears when... │ ← body-sm, text-secondary, 6dp below
 └─────────────────────────────────────────┘
 
 Card: bg-elevated, border-subtle border, radius-md
 Left border accent: 2dp solid gold-primary
 Vertical padding: 16dp. Horizontal: 16dp.
 Gap between cards: 10dp.
 Maximum 5 symbols shown. "See all" link if more.

 [28dp spacer]

 PATTERN NOTE (only shown when patternNote is non-null):
 ┌─────────────────────────────────────────┐
 │ ✦ PATTERN                               │ ← eyebrow-sm, gold-primary
 │                                         │
 │ [patternNote text]                      │ ← body-md, text-primary, italic
 │                                         │
 └─────────────────────────────────────────┘
 Card: gold-dim background, gold-border border, radius-md
 This card is visually distinct from symbol cards — gold-tinted, not dark.
 The ✦ glyph is the only decorative element in the app.

 [28dp spacer]

 REFLECTION QUESTIONS:
 "Questions to sit with"                   ← eyebrow-sm, text-muted
 [16dp below]
 
 Each question on its own row, left-border only:
 Border: 2dp, border-subtle (no gold — these should feel quieter than symbols)
 Question text: body-md, text-secondary, italic
 Padding left: 16dp. Vertical: 8dp per question. 14dp gap between.

 [40dp spacer]

 [Save to journal]                         ← outlined button, full width
 → border: border-medium (1dp), radius-full
 → text: label-lg, text-primary
 → height: 52dp
 → Only if this interpretation hasn't been saved yet

 [48dp bottom padding]
 [bottom safe area]
```

---

### Screen 4: JournalScreen (List)

```
PURPOSE: Browse past dreams. Secondary to the recording experience. 
Should feel like a private archive, not a social feed.

LAYOUT:

 [Nav bar: "Journal" label-lg text-primary (centered), filter icon right]

 [Search bar — 16dp horizontal, 12dp vertical margin]
  → bg-input, border-subtle, radius-md
  → body-md, text-primary
  → Magnifier icon left, 16dp text-primary opacity 0.4
  → Placeholder: "Search dreams..." body-md, text-muted

 [Empty state — shown when no entries]:
  Center of screen:
  "Your journal is quiet"                  ← display-sm, text-secondary, centered
  "Record your first dream to begin."      ← body-md, text-muted, centered, 12dp below
  [Record now]                             ← text button, gold-primary, label-md

 [List — FlatList, reverse chronological]:

 Each entry row:
 ┌─────────────────────────────────────────┐
 │ FRIDAY, JULY 4            Anxious  •    │ ← eyebrow-sm text-muted | pill | dot
 │ "I was standing in my childhood home..."│ ← body-md text-secondary, 1 line truncated
 │ Water  •  Door  •  Stranger             │ ← eyebrow-sm text-muted, comma-sep symbols
 └─────────────────────────────────────────┘

 Row height: 76dp minimum
 Background: bg-elevated
 No border radius on rows — they should feel like a continuous list, not cards
 Separator: 1dp border-subtle
 Left edge: 4dp solid gold-primary (ONLY if this entry has a pattern note)
 Tap: navigate to EntryDetailScreen

 Sections by month:
 "JULY 2026"                              ← eyebrow-md, text-muted, 16dp left pad, 24dp above
 [entries for July]
 "JUNE 2026"                             ← same
 [entries for June]
```

---

### Screen 5: EntryDetailScreen

```
PURPOSE: View a past dream with its full interpretation. 
Read-only except for a notes field.

LAYOUT — scrollable, mirrors InterpretationScreen but with historical framing:

 [Nav bar: Back, "Friday, July 4" centered, label-lg text-primary]

 [Same section order as InterpretationScreen]
 [Additional section at bottom:]

 NOTES (editable):
 "Your thoughts"                           ← eyebrow-sm, text-muted
 [16dp below]
 ┌─────────────────────────────────────────┐
 │ [TextInput, multiline]                  │
 │ Placeholder: "Add a reflection..."      │
 └─────────────────────────────────────────┘
 Saves on blur (no save button — auto-save with subtle visual confirmation)
 Auto-save indicator: "Saved" in label-sm text-muted, appears for 2s then fades
```

---

### Screen 6: ProfileScreen (Pattern Analysis)

```
PURPOSE: Show the user patterns in their dream history. 
Only available to Pro users or after 7+ entries as a teaser.

LAYOUT — scrollable:

 [Nav bar: "Your patterns" label-lg text-primary (centered)]

 [Top summary — prominent display]:

 YOUR DREAM LIFE                           ← eyebrow-md, text-muted
 [16dp below]
 
 Stat row (3 columns, equal width):
 ┌──────────┬──────────┬──────────────────┐
 │    23    │    7     │    Anxious       │
 │ Dreams   │ Symbols  │ Dominant tone    │
 └──────────┴──────────┴──────────────────┘
 Numbers: display-lg, text-primary
 Labels: eyebrow-sm, text-muted
 
 [32dp spacer]

 RECURRING SYMBOLS:
 "Keeps returning"                         ← eyebrow-sm, text-muted
 [16dp below]
 
 Horizontal scrollable row of symbol cards:
 Each card: 100dp × 100dp, bg-elevated, border-subtle, radius-lg
 Symbol name: label-md, text-primary, centered
 Count: display-sm, gold-primary, centered, below name
 Appears before name: "×7"
 
 [28dp spacer]
 
 EMOTIONAL TIMELINE:
 "How your dreams have felt"              ← eyebrow-sm, text-muted
 [16dp below]
 
 Simple horizontal line chart — 30 data points, one per day
 Each point: 6dp circle, color-coded by emotional tone:
   anxious: #C85252 (muted red)
   peaceful: #5CAD5C (muted green)
   surreal: #C9A84C (gold)
   melancholic: #7A85C1 (muted blue)
   other: border-medium
 Line connecting points: border-subtle, 1dp
 No axes. No grid. Just the emotional arc.
 
 [28dp spacer]

 RECENT INSIGHT:
 "What your dreams suggest"               ← eyebrow-sm, text-muted
 [16dp below]
 
 If Pro user + 30+ dreams:
 [AI-generated pattern insight — same card treatment as pattern note above]
 
 If free user OR fewer than 7 dreams:
 ┌─────────────────────────────────────────┐
 │ "Keep dreaming"                         │ ← display-sm, text-secondary
 │ "Your pattern analysis unlocks after    │ ← body-md, text-muted
 │  7 entries. You have 3 more to go."     │
 │                                         │
 │ [Upgrade to Pro for full analysis]      │ ← text button, gold-primary, label-md
 └─────────────────────────────────────────┘
```

---

### Screen 7: SettingsScreen

```
LAYOUT — standard settings list:

 [Nav bar: "Settings" label-lg text-primary]
 
 Sections with eyebrow-sm headers (text-muted, 16dp left, 24dp above):

 "MORNING RITUAL"
 ─ Reminder time           [time picker / toggle]
 ─ Reminder enabled        [toggle switch, gold-primary when on]
 
 "ACCOUNT"
 ─ [user email]            [label-md, text-secondary]
 ─ Subscription            [label-md] / "Free" or "Pro" [pill, right-aligned]
 ─ Upgrade to Pro          [only if free tier] → label-md, gold-primary
 
 "PRIVACY"
 ─ Face ID / App Lock      [toggle]
 ─ Privacy Policy          [external link]
 ─ Data & Privacy          [navigates to data export/deletion sub-screen]
 
 "ABOUT"
 ─ Version                 [label-md, text-muted, right-aligned]
 ─ DreamLens is a reflection tool. It is not a substitute for professional care.
   → body-sm, text-muted, italic, 24dp all sides padding
 
 [DANGER ZONE — visually separated]:
 [48dp spacer]
 "Delete account and all dreams"           ← label-md, error (#D95858)
 → confirmation required before execution
 → modal with explicit warning text
```

---

### Screen 8: OnboardingFlow (3 screens)

```
SCREEN 1 — Hook:
 Full screen, centered.
 
 App icon / wordmark: 40dp, centered, 20% from top
 
 "Every morning, your subconscious leaves you a message."
 → display-lg, text-primary, centered, max-width 300dp
 
 "DreamLens reads it — and remembers every one."
 → body-lg, text-secondary, centered, 16dp below, max-width 280dp
 
 [Get started]                             ← primary button, 80% width, centered, bottom 20%
 
SCREEN 2 — Privacy & Intent:
 "Before we begin"                        ← display-md, text-primary
 
 [Three icon + text rows]:
 ◉  "Your dreams are private."
    "Transcripts are encrypted. Nothing is shared. Audio is discarded immediately."
 
 ◉  "This is reflection, not therapy."
    "DreamLens helps you understand your dreams. It is not mental health care."
 
 ◉  "You control your data."
    "Delete your account and all dreams anytime from Settings."
 
 Icon: 24dp circle outline, gold-primary, centered on row
 Row padding: 16dp all sides. Gap between rows: 16dp.
 
 [I understand, continue]                 ← primary button

SCREEN 3 — Record First Dream:
 "Let's begin."                           ← display-md, text-primary
 
 "Do you remember a dream from last night?"
 → body-lg, text-secondary
 
 [Record now]                             ← primary button
 [Not today]                              ← text link below, label-md, text-muted
```

---

## COMPONENT LIBRARY

### PrimaryButton
```
Height: 52dp
Radius: full (26dp)
Background: gold-primary (#C9A84C)
Text: #070C1A (the base background color — maximum contrast)
Typography: label-lg (Inter 500, 15sp)
States:
  pressed: scale 0.97, spring 120ms
  disabled: opacity 0.35, no pointer events
Use for: exactly ONE action per screen — the most important action
```

### OutlinedButton
```
Height: 52dp
Radius: full (26dp)
Background: transparent
Border: 1dp, border-medium (rgba(255,255,255,0.14))
Text: text-primary
Typography: label-lg
States:
  pressed: background rgba(255,255,255,0.05), spring 120ms
  disabled: opacity 0.35
Use for: secondary actions (Save, Share, Try again)
```

### TextButton
```
No background, no border
Text: varies (text-primary, text-secondary, or gold-primary depending on prominence)
Typography: label-md
Touch target: minimum 44dp height via padding
Use for: tertiary actions, navigation links, "skip" type actions
```

### Card
```
Background: bg-elevated (#0D1628)
Border: 1dp, border-subtle (rgba(255,255,255,0.07))
Radius: radius-md (12dp)
Padding: 16dp

Variant — Gold accent (for pattern notes):
Background: rgba(201,168,76,0.08)
Border: 1dp, gold-border (rgba(201,168,76,0.22))
Radius: radius-md

Variant — Symbol card:
Left border: 2dp solid gold-primary
Left radius: 0 on left edge (the left border replaces the radius)
Right radius: radius-md on right edge
```

### Pill / Badge
```
Gold pill (theme, emotional tone):
  Background: rgba(201,168,76,0.12)
  Border: 1dp, gold-border
  Text: gold-primary, eyebrow-sm
  Padding: 4dp top/bottom, 10dp left/right
  Radius: full

Neutral pill:
  Background: rgba(255,255,255,0.07)
  Border: none
  Text: text-muted, eyebrow-sm
  Same padding and radius
```

### Toggle Switch
```
Track — off: rgba(255,255,255,0.12)
Track — on:  gold-primary (#C9A84C)
Thumb — off: #F2EFEA
Thumb — on:  #070C1A (matches screen bg — the contrast against gold reads as "active")
Transition: spring, 200ms
```

### Input Field
```
Background: rgba(255,255,255,0.05)
Border: 1dp, border-subtle
Radius: radius-md
Padding: 12dp vertical, 16dp horizontal
Text: body-lg, text-primary
Placeholder: body-lg, text-muted
Focus border: gold-primary (1.5dp)
Focus transition: 150ms
```

### Skeleton Loading
```
Color: rgba(255,255,255,0.06)
Animation: opacity oscillates 0.06 → 0.12 → 0.06, 1800ms, ease-in-out
Radius: matches the element being loaded
Never use a spinner unless inside a button confirming an action
```

### EmptyState
```
Centered in container, max-width 280dp:
[Illustration slot — 80dp × 80dp — simple SVG, single color gold-primary]
Title: display-sm, text-secondary, centered, 20dp below
Body: body-md, text-muted, centered, 8dp below title
Action: TextButton or OutlinedButton, centered, 24dp below body
```

---

## ANIMATION PRINCIPLES

### The Single Rule

Animate with intention, not decoration. Every animation must either:
1. Communicate state change (something started, something finished)
2. Communicate spatial relationship (where did this element come from)
3. Communicate feedback (the system received your action)

If it does none of these, remove it.

### Approved Animations

```
Screen transitions:
  Push: new screen slides in from right (standard navigation)
  Modal: bottom sheet slides up
  Interpretation load: fade in (not slide — it's not spatial, it's a reveal)
  Duration: 280ms, ease-out cubic-bezier(0.16, 1, 0.3, 1)

Record button:
  Press: scale 0.96, spring (stiffness 400, damping 28), no overshoot
  Recording ring: expand + fade, 1600ms, repeating linear, single ring only
  Stop: instant return to default state (no animation — confirmatory speed)

Interpretation reveal:
  Elements appear sequentially as the screen loads, not all at once
  Summary: 0ms delay, 400ms fade in
  Themes pills: 100ms delay, 300ms fade in (stagger 50ms each)
  Symbol cards: 250ms delay, 300ms fade in (stagger 80ms each)
  Pattern note: 600ms delay, 300ms fade in
  Reflection questions: 800ms delay, 300ms fade in
  Base: opacity 0 → 1 + translateY 8dp → 0. Nothing more dramatic.

List items:
  Journal entries: no animation on scroll (native, fast)
  New entry appears: fade in, no slide

Haptics (must match animations):
  Record start: ImpactFeedbackStyle.Medium
  Record stop: NotificationFeedbackType.Success
  Interpretation delivered: ImpactFeedbackStyle.Light
  Error: NotificationFeedbackType.Error
  Button press: ImpactFeedbackStyle.Light

Reduced motion (mandatory):
  All translateY animations: remove, keep opacity only
  Record ring pulse: replace with opacity pulse on button border only
  Sequential reveals: collapse all delays, reveal simultaneously
```

### What to Never Animate

- Content text appearing during scrolling
- Journal list rows on scroll
- Any element the user didn't trigger
- Background elements (no ambient particle animation in the app — only acceptable on the landing page where the user is stationary)

---

## TYPOGRAPHY USAGE RULES

These rules prevent the most common AI design failure modes:

**Rule 1: Cormorant is for dreams, not UI.**
The dream summary is in Cormorant. The tab label "Journal" is in Inter. Never reverse this.

**Rule 2: Never bold Cormorant.**
Use Cormorant at 300 or 400 weight only. The typeface's elegance comes from its weight. Making it bold makes it look like a headline font, which is wrong.

**Rule 3: Italic in Cormorant is an emotional signal.**
Reserve italic for: the interpretation summary if a particular phrase needs emphasis, reflection questions, notes the user adds. Use it sparingly enough that it carries meaning when it appears.

**Rule 4: Eyebrow text must be fully uppercase.**
Never display eyebrow text in title case or sentence case. It reads as a header if you don't, which breaks the hierarchy.

**Rule 5: Text muted is for context, not for content.**
If information is worth showing, it should be text-secondary or text-primary. Use text-muted only for supporting information that helps the user understand primary content — dates, counts, hints, placeholders.

**Rule 6: Never more than 3 type sizes on one screen.**
Count the type sizes. If you have display-md, label-lg, body-md, body-sm, eyebrow-sm, and label-sm on one screen, you have too many. Simplify.

---

## COPY STYLE GUIDE

This matters as much as the visual design. Bad copy ruins good design.

### Voice

The app speaks as a thoughtful, observant presence — not a brand, not a chatbot, not a therapist. It notices things. It doesn't judge. It doesn't perform enthusiasm.

Never: "Awesome! Your dream has been saved! 🌙✨"
Correct: "Saved."

Never: "We couldn't process your dream right now. Please try again!"
Correct: "Something went wrong. Your transcript is safe — tap to try again."

Never: "Tap the microphone to get started on your dream journaling journey!"
Correct: "Speak when you're ready."

### Specific Microcopy

```
RecordScreen:
  Before recording: "Speak when you're ready."
  Recording: "Listening..."
  Stopped: "Reviewing your dream"
  Permission denied: "DreamLens needs microphone access. Open Settings."

ReviewScreen:
  Title: "Review your dream"
  Subtitle: "Correct any errors before interpretation"
  Edit hint: "Lightly edit any transcription errors. Meaning matters more than exact words."
  CTA: "Interpret this dream"
  Skip: "Save without interpreting"

InterpretationScreen loading:
  "Reading your dream" — nothing else. No percentage. No progress bar.

InterpretationScreen error:
  Title: "Couldn't interpret your dream"
  Body: "Your dream is saved. Tap to try again when you're connected."
  CTA: "Try again"

JournalScreen empty:
  "Your journal is quiet"
  "Record your first dream to begin."

PatternScreen — not enough dreams:
  "Keep dreaming"
  "Pattern analysis unlocks after 7 entries. [n] more to go."

OnboardingScreen 2:
  "This is reflection, not therapy."  — not "We are not medical professionals" or "Disclaimer:"
  "You control your data." — not "Privacy settings"

Account deletion confirmation:
  "This will permanently delete all [n] dreams and your account. This cannot be undone."
  "Delete everything" — not "Confirm deletion" or "Yes, proceed"
  "Keep my account" — the escape option, prominently placed, gold-primary color
```

### Tone Rules

1. **Sentence case everywhere.** "Record your dream" not "Record Your Dream."
2. **No exclamation marks.** Ever. In the entire app.
3. **No "we" or "our."** The app speaks, not a company. "Your dream is saved." not "We saved your dream."
4. **Error messages name the recovery action.** "Tap to try again" not "An error occurred."
5. **Empty states invite, don't apologize.** "Your journal is quiet" not "No dreams recorded yet."
6. **Counts are specific.** "3 more to go" not "Keep logging dreams to unlock this."

---

## ACCESSIBILITY CHECKLIST

Before any screen is considered done:

```
Contrast:
[ ] All text meets 4.5:1 minimum against its background
[ ] gold-primary (#C9A84C) on bg-base (#070C1A) = 8.4:1 ✓
[ ] text-primary (#F2EFEA) on bg-base (#070C1A) = 18.2:1 ✓  
[ ] text-secondary (rgba F2EFEA/0.60) on bg-base = 5.8:1 ✓ (check per use)
[ ] text-muted (rgba F2EFEA/0.35) on bg-base = 3.3:1 — only acceptable for decorative text
    CRITICAL: Do not use text-muted for meaningful content. Check every instance.

Touch targets:
[ ] Every tappable element is minimum 56dp × 56dp
[ ] Record button has 128dp minimum tap zone
[ ] Tab bar items are minimum 62dp height

Screen reader:
[ ] Every interactive element has accessibilityLabel
[ ] Record button: accessibilityLabel changes with state
  "Start recording" → "Stop recording" → "Recording saved"
[ ] Interpretation content is accessible as text (not hidden behind animation)
[ ] Image/icon elements that carry meaning have accessibilityLabel
[ ] Decorative elements (the ✦ glyph) have accessibilityElementsHidden={true}

Dynamic type:
[ ] Test at 3 system font size settings: Default, Large, and Accessibility XL
[ ] RecordScreen transcript area expands correctly at large sizes
[ ] Card content does not overflow at large sizes
[ ] Minimum font sizes: body-sm (13sp) may need maxFontSizeMultiplier={1.5}

Reduced motion:
[ ] App respects AccessibilityInfo.isReduceMotionEnabled
[ ] All translateY animations disabled under reduced motion
[ ] Record button ring: replaced with static border glow under reduced motion
[ ] Sequential reveals: all simultaneous under reduced motion
```

---

## FONTS INSTALLATION

```typescript
// apps/mobile/App.tsx

import {
  useFonts,
  CormorantGaramond_300Light,
  CormorantGaramond_300Light_Italic,
  CormorantGaramond_400Regular,
  CormorantGaramond_400Regular_Italic,
} from '@expo-google-fonts/cormorant-garamond';

import {
  Inter_300Light,
  Inter_400Regular,
  Inter_500Medium,
} from '@expo-google-fonts/inter';

// Must show a blank dark screen while fonts load.
// Never show the app with system fonts — the typography 
// is too central to the design to display incorrectly.
```

---

## THINGS THAT WILL LOOK LIKE AI SLOP IF NOT PREVENTED

This section exists because these are the specific patterns that will emerge from any AI coding tool if left unchecked. Treat this as a checklist to verify after each screen is implemented:

```
[ ] No gradient backgrounds — anywhere in the app, ever
    (The landing page has them; the app does not)

[ ] No card drop shadows
    Cards are distinguished by background color only

[ ] No colored circles with icons inside them as decorative bullets
    (This pattern is everywhere in AI-generated UI and reads instantly as low-effort)

[ ] Cormorant Garamond is not used for navigation labels or button text
    Even if you think it looks nice there — it doesn't belong there

[ ] The record screen has no bottom tab bar
    Other screens CAN have a bottom tab bar if navigation requires it
    The record screen is exempt — it should feel like a dedicated tool, not a tab

[ ] No celebration animations when a dream is saved or interpreted
    No confetti, no checkmark with a bounce, no "Great job!" toast
    This is a contemplative experience

[ ] No numbered steps (01 / 02 / 03 style) on any screen
    Unless the content is literally a sequence the user must follow in order

[ ] The ✦ glyph appears in exactly one place: the pattern note card header
    Using it elsewhere dilutes its meaning

[ ] Loading states use a breathing circle, not a spinner
    Spinners communicate urgency; this experience does not

[ ] Empty states use the defined copy above
    Not "Nothing here yet" or "No results found"

[ ] No avatar / profile photo placeholder at the top of any screen
    This app is anonymous by design — no personal identification visual

[ ] The gold color (#C9A84C) appears in: 
    the record button border, primary CTA, theme pills, symbol left borders,
    the ✦ glyph, active toggle state, focused input border, and text-accent uses
    It should NOT appear in: background washes, large filled areas, decorative frames
    Restraint on gold is what makes gold meaningful when it appears
```

---

*End of DreamLens UI Design Specification v1.0*
