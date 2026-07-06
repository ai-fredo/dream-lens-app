---
title: DreamLens Knowledge Vault — Home
type: index
version: 1.0
updated: 2026-07-05
---

# DreamLens Knowledge Vault

This is the source of truth for DreamLens's dream interpretation knowledge base. It is authored as an [Obsidian](https://obsidian.md) vault so it is human-readable, editable, and linkable — and it exports to a machine-readable format (`JSONL` / `SQL`) that seeds the production `dream_symbols` table for the RAG pipeline.

> [!important] One source, two outputs
> **You** read and edit the markdown notes here. **The app** consumes the export in `_exports/`. Never hand-edit the export — regenerate it from the vault. See [[_scripts/build-export|build-export]].

---

## The stance this vault takes (read this first)

Most "dream dictionaries" are pseudoscience, and both the scientific tradition and the depth-psychology tradition say so explicitly:

- The empirical researcher **G. William Domhoff** (the leading modern authority on dream content) holds that 50 years of scientific study support *no* specifically Freudian or Jungian symbol claims, but *do* support that dreams cohere with waking thoughts and preoccupations — the **continuity hypothesis**. See [[Frameworks/Continuity Hypothesis|Continuity Hypothesis]].
- **Carl Jung himself** wrote that dream interpretation "recognises no fixed meaning of symbols" (CW 8, §471) and that dream-dictionary style "routine recipes and definitions" are "of no value whatever." His actual method is *amplification* against the dreamer's real life. See [[Methodology/Jungian Method|Jungian Method]].

So this vault does **not** claim "X means Y." Every entry provides **interpretive lenses** and **reflective questions** grounded in named traditions, and hands the meaning-making back to the dreamer. This is:

1. **Intellectually honest** — it matches what the actual authorities endorse.
2. **Legally safe** — it's original synthesis, not reproduction of copyrighted texts. See [[_meta/Sourcing and Copyright|Sourcing and Copyright]].
3. **Better product** — it reframes DreamLens as a reflection tool (which your own disclaimer already states), not a fortune teller. That is a stronger, more defensible market position.

> [!warning] Marketing language to fix
> The current landing-page copy calls the KB "authoritative." Consider softening to "grounded in established traditions" or "informed by depth psychology and dream science." Claiming authority over dream *meaning* is precisely the claim Jung and Domhoff reject, and a knowledgeable critic (or App Store reviewer) can call it out. See [[_meta/Positioning Notes|Positioning Notes]].

---

## How the vault is organized

| Folder | What's in it | Feeds RAG? |
|---|---|---|
| [[Symbols]] | Dream elements (environments, animals, objects, body, nature, people, colors, actions) | Yes |
| [[Archetypes]] | Jungian archetypal figures (Shadow, Anima/Animus, Self, etc.) | Yes |
| [[Scenarios]] | Whole-dream patterns (being chased, falling, exam, teeth, etc.) | Yes |
| [[Emotions]] | Emotional-tone reference for tagging | Partial |
| Frameworks | The theories the entries draw on (continuity, compensation, etc.) | Context only |
| Methodology | How interpretation actually works (amplification, subjective/objective level) | Context only |
| _templates | Note templates for authoring new entries | No |
| _meta | Sourcing, copyright, positioning, changelog | No |
| _exports | The generated JSONL / SQL the app consumes | Output |
| _scripts | The build script that turns the vault into the export | No |

---

## Entry status legend

Every symbol/scenario/archetype note has a `status` in its frontmatter:

- `core` — hand-authored, high quality, ships in v1. **~70 of these is the MVP target.**
- `draft` — generated or stubbed, needs an editorial pass before shipping.
- `review` — flagged for a second look (accuracy, tone, or sensitivity).
- `retired` — kept for history, excluded from export.

Only `core` and `review`-passed entries are exported by default.

---

## Quickstart for expanding the vault

1. Duplicate [[_templates/Symbol Template|Symbol Template]] into the right `Symbols/` subfolder.
2. Fill every section. Follow the voice in [[_meta/Editorial Voice|Editorial Voice]].
3. Set `status: core` once it meets the bar.
4. Run [[_scripts/build-export|build-export]] to regenerate `_exports/dream_symbols.jsonl`.
5. The app's embedding job picks up the new/changed rows on next seed.

---

## Related project docs (outside this vault)

- `dreamlens-prd.md` — product requirements
- `dreamlens-engineering-standards.md` — engineering/testing/security standards
- `dreamlens-ui-design-spec.md` — UI design system
