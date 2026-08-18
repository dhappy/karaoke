# Implementation Plan: WebVTT Karaoke Overlay

**Branch**: `001-webvtt-karaoke-overlay` (working branch: `master`) | **Date**: 2026-08-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-webvtt-karaoke-overlay/spec.md`

## Summary

A client-only Svelte application that plays a person's own music video with their own WebVTT lyric file overlaid, coloring each word progressively as it is sung.

The technical core is three separable pieces: a **hand-written WebVTT parser** that recovers word-level inline timestamps (which the browser's native `TextTrack` API does not expose reliably) and repairs malformed cues; a **pure timing model** that maps a playback position to a render state via cursor-plus-binary-search lookup over an interval index; and a **two-layer clip-path renderer** that fills each word progressively with one CSS custom-property write per frame. Synchronization is driven by a `requestAnimationFrame` loop that *reads* `video.currentTime` each frame rather than accumulating elapsed time — which makes the accumulated-drift failure in SC-005 structurally impossible rather than merely tuned away.

Everything runs in the browser. No server, no upload, no persistence beyond the session.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict), Svelte 5 (runes), targeting ES2023

**Primary Dependencies**: Svelte 5 + Vite 6. Zero runtime dependencies — the WebVTT parser, timing model, and renderer are all first-party. `Intl.Segmenter` (platform built-in) provides script-correct word and grapheme segmentation.

**Storage**: N/A — all state is in-memory and session-scoped. No persistence, per spec Assumptions.

**Testing**: Vitest for the parser and timing model (pure functions, no DOM, fixture-driven); Playwright for playback integration against a synthetic fixture video.

**Target Platform**: Modern evergreen browsers, desktop and mobile (Chrome/Edge 126+, Firefox 128+, Safari 17+). `Intl.Segmenter` availability sets the floor.

**Project Type**: Single project — a client-only single-page web application. No backend, no API layer.

**Performance Goals**: Highlight updates at display refresh rate (60fps typical, 120fps capable) with no dropped frames during continuous playback (SC-003). Word onset within 100ms of the file's own timing for ≥99% of words (SC-002). Correct overlay within 250ms of any seek (SC-004).

**Constraints**: Fully offline-capable after first load; no network egress with local files; zero accumulated drift across a 10-minute song (SC-005); text legible to WCAG contrast guidance over arbitrary footage (SC-008); per-frame work must be O(1) in cue count.

**Scale/Scope**: One song at a time. Lyric files up to ~1,000 cues and ~15,000 word tokens; videos to 10+ minutes. Single user, single screen. Roughly 12–15 components and 3 library modules.

All Technical Context items are resolved — see [research.md](./research.md) for the decisions and the alternatives rejected. No `NEEDS CLARIFICATION` markers remain.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Evaluated against [Karaoke Constitution v1.0.1](../../.specify/memory/constitution.md)** (ratified 2026-08-17, amended 2026-08-18).

### Gate result

| Principle | Verdict | Basis |
|---|---|---|
| I. Pure Core, Impure Edge | PASS | `src/lib/` is framework-free (T004 makes this a build failure, not a habit); `clock.ts` is the single media module *within `src/lib/`*, which is what v1.0.1 scopes the limit to |
| II. The Device Is the Boundary | PASS | No accounts, uploads, telemetry, or persistence (FR-001, spec Out of Scope); `dist/` is static; enforced by T064/T065 |
| III. Frame Budget Is Correctness | PASS | Position read per frame, never accumulated (D2); O(1) lookup (D5); one property write per frame (D4); playhead excluded from reactive state by construction |
| IV. Never a Blank Screen | PASS | Total parser, repair-with-warnings, staged swap on failure (FR-020, FR-021) |
| V. Earn Every Dependency | PASS | Zero runtime deps; `Intl.Segmenter` over a library (D6); the one rejected platform API documented with rationale (D1) |

**Gate passes, pre-Phase 0 and post-Phase 1 alike.** No violations. Complexity Tracking is empty.

Every principle now has at least one task that can fail it in CI — I via T004 and T070, II via T064/T065, III via T067, IV via T017/T018, V via T002. A principle no test can fail is only a preference, so this mapping is part of the gate rather than a nicety.

### Resolved since the previous evaluation

**Principle I scoping — CLOSED.** The prior run recorded an open item: read literally, v1.0.0's "exactly one seam is permitted to touch a live `HTMLMediaElement`" was violated by `VideoStage.svelte`, which must own the `<video>` element to apply play/pause/seek/fullscreen. That reading contradicted the principle's own title and rationale, but the design was not entitled to resolve the ambiguity in its own favour.

Constitution v1.0.1 resolves it in the only place it could legitimately be resolved: the clause now scopes to `src/lib/`, with an explicit carve-out naming `src/components/` as the impure edge that owns the media element by design. `VideoStage.svelte` (T024) is unambiguously permitted. This was `/speckit-analyze` finding D1, its only CRITICAL.

**Principle III violation — FIXED in the previous run.** `PlaybackState` carried a per-frame `position` field in a runes module. The entity is now split: reactive state holds only human-frequency fields, and the playhead is passed to `resolve()` as an argument rather than stored. See [data-model.md](./data-model.md) § PlaybackState.

### Known gaps — all closed

`/speckit-analyze` left four findings this plan did not own. All have since been applied to
`tasks.md` and, where they touched design, to the contracts:

| Finding | Severity | Resolution |
|---|---|---|
| G1 | HIGH | T030 added — asserts word onset within 100ms for ≥99% of tokens (SC-002), the criterion that previously had zero coverage |
| F1 | HIGH | `playback.spec.ts` split by concern into three spec files; every remaining `[P]` verified against a distinct target file |
| F2 | MEDIUM | `resolve`'s two-phase delivery is now sanctioned in [contracts/timing-model.md](./contracts/timing-model.md) § Phased delivery, so T033's partial implementation is compliant rather than a shortfall |
| C1 | MEDIUM | T050 added — creates `src/lib/format.ts`, the last tree entry with no task |

Two lower-severity items from that report remain open and are deliberately not carried here:
**G2** (no fixture exercises the ~1,000-cue scale the timing budget assumes) and **B1**
(SC-003 states its threshold as a device class rather than a measurable frame budget). Both
are spec-level wording, not plan defects.

## Project Structure

### Documentation (this feature)

```text
specs/001-webvtt-karaoke-overlay/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── webvtt-parser.md
│   ├── timing-model.md
│   └── component-api.md
├── checklists/
│   └── requirements.md  # Written by /speckit-specify
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/
├── lib/                        # PURE — no Svelte, no DOM, no media element (Principle I)
│   ├── vtt/
│   │   ├── parse.ts            # WebVTT text -> LyricLine[] + Diagnostic[]
│   │   ├── tokenize.ts         # line text -> WordToken[] via Intl.Segmenter
│   │   ├── sanitize.ts         # strip tags, voice spans, positioning hints
│   │   ├── repair.ts           # zero-length / out-of-order / out-of-range cues
│   │   └── types.ts
│   ├── timing/
│   │   ├── index.ts            # build interval index over cues
│   │   ├── lookup.ts           # position -> active lines (cursor + binary search)
│   │   ├── fill.ts             # position -> per-word fill fraction
│   │   ├── clock.ts            # rAF loop — the ONLY src/lib module touching a media element
│   │   └── types.ts            # CueIndex, RenderState, ActiveLine
│   └── format.ts               # time formatting for controls
├── components/                 # IMPURE EDGE — owns the media element and its controls
│   ├── App.svelte
│   ├── VideoStage.svelte       # media element + overlay stacking context
│   ├── LyricOverlay.svelte     # active + preview lines, countdown
│   ├── LyricLine.svelte        # one line, wraps
│   ├── WordSpan.svelte         # two-layer clip-path fill
│   ├── applyRenderState.ts     # imperative per-frame writer (D4)
│   ├── Countdown.svelte
│   ├── PlaybackControls.svelte
│   ├── SourcePicker.svelte     # file picker + drag-and-drop
│   ├── OffsetControl.svelte
│   ├── DisplaySettings.svelte
│   └── ErrorBanner.svelte
├── state/
│   ├── media.svelte.ts         # media source + playback state — NO playhead (Principle III)
│   ├── lyrics.svelte.ts        # lyric source, parsed lines, diagnostics
│   ├── prefs.svelte.ts         # display preferences, timing offset
│   └── devFixture.ts           # dev-only loader; keeps US1 testable without US2
├── styles/
│   └── tokens.css              # colour schemes, type scale, legibility scrim
└── main.ts

tests/
├── unit/                       # Vitest — no browser
│   ├── parse.test.ts
│   ├── sanitize.test.ts
│   ├── tokenize.test.ts
│   ├── repair.test.ts
│   ├── lookup.test.ts
│   ├── fill.test.ts
│   ├── format.test.ts
│   ├── contrast.test.ts        # Principle: contrast measured against the scrim (D9)
│   └── egress.test.ts          # Principle II made falsifiable
├── integration/                # Playwright
│   ├── playback.spec.ts             # US1 core sync + onset accuracy (SC-002)
│   ├── playback-control.spec.ts     # US3 pause/resume/rate/scrub
│   ├── playback-endurance.spec.ts   # drift, frame budget, tab visibility
│   ├── loading.spec.ts
│   ├── overlay.spec.ts
│   └── offline.spec.ts
└── fixtures/
    ├── word-timed.vtt
    ├── line-only.vtt
    ├── overlapping.vtt
    ├── malformed.vtt
    ├── non-latin.vtt
    ├── markup.vtt
    ├── empty.vtt
    ├── tiny.webm               # quiet VP8, 25s — default sync source
    └── busy.webm               # bright noise, 10s — SC-008 legibility worst case

index.html
vite.config.ts
svelte.config.js
tsconfig.json
eslint.config.js                # carries the src/lib import-boundary rule (T004)
vitest.config.ts
playwright.config.ts
package.json
```

**Structure Decision**: Single project, client-only SPA. There is no backend, no API, and no second deployable, so Options 2 and 3 from the template do not apply. The one structural commitment worth naming is the split between `src/lib/` (pure TypeScript — no Svelte, no DOM, no media element) and `src/components/` + `src/state/` (everything that touches the browser). Every requirement with a correctness claim attached — parsing (FR-002/003/004/018/020/023), lookup (FR-005/019), fill (FR-007) — lives on the pure side and is testable with Vitest against fixture files, with no browser in the loop. The rAF clock in `src/lib/timing/clock.ts` is the single seam where the pure model meets a real `HTMLMediaElement`.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

Empty, and legitimately so. Two candidate entries were considered across the plan's revisions and neither survived:

- **Principle III, playhead in reactive state** — found by the post-Phase 1 re-check and **fixed rather than justified**. It had no upside to trade against, so there was nothing to enter.
- **Principle I, `VideoStage` touching the media element** — was never a design violation, only an ambiguity in the constitution's wording. Closed by amendment v1.0.1, which scopes the limit to `src/lib/`.

Complexity is justified by a named problem it solves, never by preference. Neither of these had one.
