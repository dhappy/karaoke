---

description: "Task list for WebVTT Karaoke Overlay"
---

# Tasks: WebVTT Karaoke Overlay

**Input**: Design documents from `/specs/001-webvtt-karaoke-overlay/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: INCLUDED — not optional here. [Karaoke Constitution v1.0.0](../../.specify/memory/constitution.md) § Development Workflow requires unit tests for every pure-core module and an integration test for every person-observable behaviour. Test tasks below exist to satisfy that, not as a TDD preference.

**Organization**: Tasks are grouped by user story so each can be implemented, tested, and shipped independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete work)
- **[Story]**: Which user story the task serves (US1–US4)
- Every task names an exact file path

## Path Conventions

Single project, client-only SPA. `src/` and `tests/` at repository root, per [plan.md](./plan.md) § Project Structure.

The load-bearing structural rule: `src/lib/` is pure TypeScript — no Svelte imports, no DOM, no media element. `src/components/` and `src/state/` are where the browser lives. T004 makes this a lint failure rather than a code-review habit.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, toolchain, and the fixture corpus every later phase tests against

- [X] T001 Create the directory structure from plan.md § Project Structure: `src/lib/vtt/`, `src/lib/timing/`, `src/components/`, `src/state/`, `src/styles/`, `tests/unit/`, `tests/integration/`, `tests/fixtures/`
- [X] T002 Initialize the pnpm project with Svelte 5, Vite 6, and TypeScript 5.7 in `package.json`, `vite.config.ts`, `svelte.config.js`, `index.html`, and `src/main.ts` — no runtime dependencies beyond Svelte (Constitution V)
- [X] T003 [P] Configure TypeScript strict mode targeting ES2023 in `tsconfig.json`
- [X] T004 [P] Configure ESLint and Prettier in `eslint.config.js`, including an import-boundary rule that fails the build when any file under `src/lib/` imports from `svelte`, `src/components/`, or `src/state/`, or references `document`/`window`/`HTMLMediaElement` (enforces Constitution I)
- [X] T005 [P] Configure Vitest for the pure core in `vitest.config.ts`, scoped to `tests/unit/`
- [X] T006 [P] Configure Playwright in `playwright.config.ts`, scoped to `tests/integration/`
- [X] T007 [P] Author the WebVTT fixture corpus in `tests/fixtures/` — `word-timed.vtt`, `line-only.vtt`, `overlapping.vtt`, `malformed.vtt`, `non-latin.vtt`, `markup.vtt`, `empty.vtt`, each pinning the behaviour named in [contracts/webvtt-parser.md](./contracts/webvtt-parser.md) § Test corpus
- [X] T008 [P] Generate deterministic silent fixture video at `tests/fixtures/tiny.webm` (quiet, 25s) and `tests/fixtures/busy.webm` (bright high-frequency noise, 10s — the SC-008 worst case) via `scripts/make-fixture-media.mjs`, and commit them — integration tests must not depend on network media

**Checkpoint**: `pnpm dev` serves an empty app; `pnpm test` and `pnpm test:e2e` run and pass vacuously

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The lyric pipeline and app shell that every user story builds on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T009 [P] Define `WordToken`, `LyricLine`, `Diagnostic`, and the closed `DiagnosticCode` union in `src/lib/vtt/types.ts` per [data-model.md](./data-model.md)
- [X] T010 [P] Define `CueIndex`, `RenderState`, and `ActiveLine` in `src/lib/timing/types.ts` per [data-model.md](./data-model.md)
- [X] T011 [P] Implement markup stripping in `src/lib/vtt/sanitize.ts` — remove `<b> <i> <u> <c> <ruby> <rt>`, capture `<v Name>` to metadata, decode entities, discard cue settings (FR-018)
- [X] T012 [P] Implement script-correct segmentation in `src/lib/vtt/tokenize.ts` using `Intl.Segmenter` at word and grapheme granularity, never splitting inside a grapheme cluster (FR-023, D6)
- [X] T013 [P] Implement cue repair and diagnostics in `src/lib/vtt/repair.ts` covering every row of the repair table in [contracts/webvtt-parser.md](./contracts/webvtt-parser.md) (FR-020)
- [X] T014 Implement the parser in `src/lib/vtt/parse.ts` — block scanning, timestamp parsing, inline `<00:00:12.500>` splitting, and character-weight duration distribution for lines without word timings (FR-002, FR-003, FR-004, D8); depends on T009, T011, T012, T013
- [X] T015 [P] Unit-test sanitization in `tests/unit/sanitize.test.ts`, asserting no `<`, `>`, or undecoded entity survives into any output text
- [X] T016 [P] Unit-test segmentation in `tests/unit/tokenize.test.ts` against `non-latin.vtt`, asserting no token boundary falls inside a grapheme cluster
- [X] T017 [P] Unit-test repair in `tests/unit/repair.test.ts` against `malformed.vtt`, asserting one diagnostic per defect and that good cues survive
- [X] T018 [P] Unit-test the parser in `tests/unit/parse.test.ts`, including totality against binary garbage and gapless derived coverage for `line-only.vtt` (SC-009)
- [X] T019 [P] Implement lyric session state in `src/state/lyrics.svelte.ts` with the `empty → loading → ready|failed` machine, staging parse results and swapping only on success (FR-021)
- [X] T020 [P] Implement media and playback state in `src/state/media.svelte.ts` holding **only** `playing`, `rate`, `seeking`, `offset`, `duration` — the playhead MUST NOT be a rune (Constitution III; see [data-model.md](./data-model.md) § PlaybackState)
- [X] T021 [P] Implement display preferences in `src/state/prefs.svelte.ts` with the defaults from [data-model.md](./data-model.md)
- [X] T022 [P] Define colour schemes, type scale, and the legibility scrim as custom properties in `src/styles/tokens.css` (D9)
- [X] T023 Implement the application shell in `src/components/App.svelte`, composing state modules and layout
- [X] T024 Implement `src/components/VideoStage.svelte` — owns the `<video>` element, establishes the overlay stacking context, scales with the video box in fullscreen and at any window size (FR-012)
- [X] T025 Implement a development-only fixture loader in `src/state/devFixture.ts` that loads `tests/fixtures/word-timed.vtt` and `tiny.webm` directly, so User Story 1 is independently testable without the file picker from User Story 2

**Checkpoint**: A WebVTT file parses to validated lyric lines with full diagnostics, and the app shell renders a playing video with no overlay yet

---

## Phase 3: User Story 1 — Sing along with word-by-word highlighting (Priority: P1) 🎯 MVP

**Goal**: A loaded video and word-timed lyric file produce synchronized, progressively-filling word highlighting over the video.

**Independent Test**: Load `tests/fixtures/word-timed.vtt` and `tiny.webm` through the dev fixture loader, press play, and confirm the correct line displays and each word fills progressively at its timed moment for the full duration.

### Tests for User Story 1

- [X] T026 [P] [US1] Unit-test cursor independence in `tests/unit/lookup.test.ts` — replay the fixture corpus forwards, backwards, and in shuffled random access, asserting identical `RenderState` sequences regardless of cursor state (the property that catches every scrub bug, per [contracts/timing-model.md](./contracts/timing-model.md))
- [X] T027 [US1] Unit-test overlap completeness in `tests/unit/lookup.test.ts` against `overlapping.vtt`, asserting every covering line is returned rather than the first (FR-019)
- [X] T028 [P] [US1] Unit-test fill monotonicity in `tests/unit/fill.test.ts` — non-decreasing in time, exactly 0 at or before `start`, exactly 1 at or after `end`
- [X] T029 [P] [US1] Integration-test core playback in `tests/integration/playback.spec.ts` — line appears, words fill in order, overlay clears in gaps and at end of file
- [X] T030 [US1] Assert word-onset accuracy in `tests/integration/playback.spec.ts` — for every token in `word-timed.vtt`, measure the delta between the token's parsed `start` and the frame at which its fill first becomes non-zero, and assert at least 99% fall within 100ms (SC-002)

### Implementation for User Story 1

- [X] T031 [P] [US1] Implement `buildIndex` in `src/lib/timing/index.ts`, sorting lines by start and precomputing the `maxEndPrefix` running maximum (D5)
- [X] T032 [P] [US1] Implement `fillFraction` in `src/lib/timing/fill.ts`, clamped to [0, 1]
- [X] T033 [US1] Implement `resolve` in `src/lib/timing/lookup.ts` — binary search plus leftward walk over `maxEndPrefix` for all covering lines, with an advisory cursor and explicit discontinuity detection; evaluates at `position - offset` and never mutates `index.lines` (D5, D7). Populates `RenderState.active` only — `preview` and `countdown` are returned as `null` until T059 (see [contracts/timing-model.md](./contracts/timing-model.md) § Phased delivery); depends on T031, T032
- [X] T034 [US1] Implement `createClock` in `src/lib/timing/clock.ts` — rAF loop reading `media.currentTime` each frame, one final frame on pause, one frame on `seeked` and on `visibilitychange`, and a `dispose` that removes every listener and cancels any pending frame (FR-008, D2)
- [X] T035 [P] [US1] Implement `src/components/WordSpan.svelte` with two pixel-identical stacked layers revealed by `clip-path: inset()` driven by a `--p` custom property, exposing its element for imperative writes, giving sung / active / unsung three visually distinct states (FR-006, D3)
- [X] T036 [US1] Implement `src/components/LyricLine.svelte`, rendering ordered `WordSpan`s that wrap without breaking the per-word fill
- [X] T037 [US1] Implement `src/components/LyricOverlay.svelte`, reactive at line granularity only, keyed by `LyricLine.id`, rendering nothing when the active set is empty (FR-005)
- [X] T038 [US1] Implement the imperative per-frame writer `applyRenderState` in `src/components/applyRenderState.ts` — writes `--p` to the active token's element only, filling proportionally to progress through the token's time range; must not touch reactive state (FR-007, Constitution III, D4)
- [X] T039 [US1] Wire the clock, `resolve`, and `applyRenderState` together in `src/components/App.svelte`, passing position as an argument and never storing it

**Checkpoint**: User Story 1 is fully functional — this is the MVP and the first point at which a person can actually sing to the thing

---

## Phase 4: User Story 2 — Load my own video and lyric files (Priority: P2)

**Goal**: A person supplies any video and any WebVTT file from their own device, with failures explained and never destructive.

**Independent Test**: Drag an arbitrary video and an arbitrary WebVTT file onto the window; confirm both are accepted, the line count matches the file, and karaoke begins on play.

### Tests for User Story 2

- [X] T040 [P] [US2] Integration-test loading in `tests/integration/loading.spec.ts` — file picker and drag-and-drop, independent replacement of lyrics and video, and that a failed load leaves previously loaded content playable (FR-021, FR-022)

### Implementation for User Story 2

- [X] T041 [P] [US2] Implement `src/components/SourcePicker.svelte` with both a file picker and drag-and-drop, accepting video and lyrics independently in either order (FR-001)
- [X] T042 [P] [US2] Implement `src/components/ErrorBanner.svelte`, rendering errors and warnings distinctly, never blocking playback of loaded content, and rendering diagnostic text as text rather than markup (FR-021)
- [X] T043 [US2] Implement load orchestration in `src/state/lyrics.svelte.ts` and `src/state/media.svelte.ts` — parse into a staging slot and swap in only on success, so a bad file never clears good lyrics (FR-021, FR-022)
- [X] T044 [US2] Surface media load failures as plain language in `src/components/VideoStage.svelte`, never as raw `MediaError` codes (FR-021)
- [X] T045 [US2] Dispose and rebuild the clock and `CueIndex` on source swap in `src/components/App.svelte`, so no rAF loop or listener leaks across loads (FR-022)
- [X] T046 [US2] Replace the dev fixture loader path with the real picker in `src/components/App.svelte`, retaining `src/state/devFixture.ts` for tests

**Checkpoint**: User Stories 1 and 2 both work independently — the app is now self-service

---

## Phase 5: User Story 3 — Control playback and correct the sync (Priority: P3)

**Goal**: Pause, resume, scrub, change rate, and correct a lyric file that runs early or late.

**Independent Test**: While a song plays, scrub to an arbitrary point and confirm the overlay immediately shows the correct line with the correct words already coloured; then apply a timing offset and confirm highlighting shifts by that amount.

### Tests for User Story 3

- [X] T047 [P] [US3] Integration-test playback control in `tests/integration/playback-control.spec.ts` — pause freezes the highlight in place, resume continues without replay or skip, and rate changes at 0.5× and 2× still track the audible position (FR-009, FR-010)
- [X] T048 [US3] Integration-test rapid scrubbing in `tests/integration/playback-control.spec.ts` — drag the playhead back and forth repeatedly, then assert the overlay matches where it landed with no stale or duplicated line
- [X] T049 [US3] Unit-test offset exactness in `tests/unit/lookup.test.ts` — applying offset `x` then `-x` returns identical output (D7)
- [X] T050 [P] [US3] Implement time formatting for controls in `src/lib/format.ts` — seconds to `m:ss` / `h:mm:ss` for the scrubber and duration readout, pure and unit-tested in `tests/unit/format.test.ts`

### Implementation for User Story 3

- [X] T051 [P] [US3] Implement `src/components/PlaybackControls.svelte` with play/pause, seek, volume, mute, and fullscreen, emitting the `PlaybackCommand` union from [contracts/component-api.md](./contracts/component-api.md) (FR-011)
- [X] T052 [US3] Drive the scrubber from throttled `timeupdate` rather than the frame clock in `src/components/PlaybackControls.svelte` — a seek bar does not need 60Hz, and wiring it to the frame clock reintroduces the Constitution III violation through the back door
- [X] T053 [US3] Handle `seeking`/`seeked` in `src/lib/timing/clock.ts` and `src/lib/timing/lookup.ts` to force cursor invalidation and emit a frame even while paused (SC-004)
- [X] T054 [P] [US3] Implement `src/components/OffsetControl.svelte` — signed, immediate, session-persistent, with a reset and an explicit sign in the label ("lyrics 0.4s early") (FR-013)
- [X] T055 [US3] Ensure controls remain reachable and unobscured by the overlay at narrow widths and in fullscreen in `src/components/VideoStage.svelte` (FR-012)

**Checkpoint**: Practising a song — repeating verses and fixing an offset file — now works end to end

---

## Phase 6: User Story 4 — Read the words comfortably on any screen (Priority: P4)

**Goal**: Legible, adjustable presentation with a preview line and a lead-in countdown.

**Independent Test**: Change each display setting in turn during playback and confirm the overlay updates immediately and stays legible over both dark and bright footage.

### Tests for User Story 4

- [X] T056 [P] [US4] Unit-test contrast in `tests/unit/contrast.test.ts` — every colour scheme meets the contrast floor against the composited scrim at every text size (SC-008, D9)
- [X] T057 [P] [US4] Integration-test presentation in `tests/integration/overlay.spec.ts` — text size, colour scheme, and placement apply immediately; a long line wraps and stays fully visible with the fill continuing onto the second row
- [X] T058 [US4] Integration-test preview and countdown in `tests/integration/overlay.spec.ts` — the next line appears de-emphasized inside the preview window, and the countdown ends exactly when the line starts (FR-016, FR-017)

### Implementation for User Story 4

- [X] T059 [US4] Complete `resolve` in `src/lib/timing/lookup.ts` by populating the `RenderState.preview` and `RenderState.countdown` fields that T033 deliberately left `null`, from the preview window and countdown threshold (FR-016, FR-017)
- [X] T060 [P] [US4] Implement `src/components/Countdown.svelte`, appearing only for gaps exceeding the threshold and disappearing exactly at line start
- [X] T061 [US4] Render the preview line in a de-emphasized style in `src/components/LyricOverlay.svelte` (FR-016)
- [X] T062 [P] [US4] Implement `src/components/DisplaySettings.svelte` for text size, colour scheme, and vertical placement, applying immediately without interrupting playback (FR-014)
- [X] T063 [US4] Apply the scrim, text shadow, and `paint-order: stroke fill` outline to all lyric text in `src/components/LyricLine.svelte` and `src/styles/tokens.css` (FR-015)
- [X] T064 [US4] Ensure the fill boundary's position reads as a second state channel alongside colour in `src/components/WordSpan.svelte`, so colour is never the sole carrier of sung/unsung state (Constitution, Quality Standards)
- [X] T065 [US4] Make the overlay responsive in `src/components/LyricOverlay.svelte` — scales with the video box, wraps long lines, keeps interactive targets at 44px or larger (FR-012)

**Checkpoint**: All four user stories are independently functional

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: The guarantees that span every story, and the ones a principle without a test cannot make

- [X] T066 [P] Enforce the no-egress rule with a strict `Content-Security-Policy` in `index.html` and a build-output check in `tests/unit/egress.test.ts` asserting the bundle contains no analytics, telemetry, or third-party origin (Constitution II — a principle no test can fail is only a preference)
- [X] T067 [P] Verify offline operation in `tests/integration/offline.spec.ts` — the built app loads and plays a local pair with the network disconnected (Constitution II)
- [X] T068 [P] Add a long-run accuracy test in `tests/integration/playback-endurance.spec.ts` asserting highlight accuracy at the ten-minute mark matches the first line (SC-005)
- [X] T069 Add a frame-budget assertion in `tests/integration/playback-endurance.spec.ts` — no dropped frames during continuous playback, and per-frame DOM mutation bounded to the active token (SC-003, Constitution III)
- [X] T070 Add a tab-visibility test in `tests/integration/playback-endurance.spec.ts` — after backgrounding and returning, the overlay matches actual playback position
- [X] T071 [P] Accessibility pass across `src/components/` — keyboard reachability for all controls, focus visibility, and 44px minimum targets
- [X] T072 Verify the import-boundary lint rule in `eslint.config.js` actually fails by adding a temporary `import { mount } from 'svelte'` to `src/lib/timing/lookup.ts`, confirming the build rejects it, then reverting the probe — an unenforced boundary is not a boundary
- [X] T073 [P] Write `README.md` covering local development, the browser floor and why `Intl.Segmenter` sets it, and how to supply files
- [X] T074 Code cleanup and dead-path removal across `src/`
- [X] T075 Run the full [quickstart.md](./quickstart.md) validation, all five scenarios, and record results

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately
- **Foundational (Phase 2)**: depends on Setup — **blocks every user story**
- **User Stories (Phases 3–6)**: all depend on Foundational; then proceed in parallel if staffed, or sequentially P1 → P2 → P3 → P4
- **Polish (Phase 7)**: depends on all desired stories being complete

### User Story Dependencies

- **US1 (P1)**: depends only on Foundational. Uses the dev fixture loader (T025) rather than US2's picker, which is what keeps it independently testable.
- **US2 (P2)**: depends only on Foundational. Replaces the dev loader path but does not change US1's rendering.
- **US3 (P3)**: depends only on Foundational for its controls; T053's cursor invalidation touches `lookup.ts` from US1, so run it after US1 if both are in flight.
- **US4 (P4)**: depends only on Foundational; T059 extends `resolve` from US1 and T061/T063 extend US1's overlay components, so schedule after US1.

**Honest caveat**: US3 and US4 are *independently testable* but not *file-independent* from US1 — T053, T059, T061, and T063 modify files US1 created. Two developers can work US3 and US4 concurrently; neither should work them concurrently with US1.

### Within Each User Story

- Tests are written before implementation and must fail first
- Types → pure logic → components → wiring
- Story complete and checkpointed before moving to the next priority

### Parallel Opportunities

Recomputed from the actual `[P]` markers — every task listed here targets a file no other
parallel task touches. Tests that share a spec file are sequential by design, not oversight.

- **Phase 1**: T003, T004, T005, T006, T007, T008 — six independent config and fixture files
- **Phase 2**: T009, T010, T011, T012, T013 (types and pure modules), then T014, then T015, T016, T017, T018, T019, T020, T021, T022
- **US1**: T026, T028, T029, T031, T032, T035
- **US2**: T040, T041, T042
- **US3**: T047, T050, T051, T054
- **US4**: T056, T057, T060, T062
- **Phase 7**: T066, T067, T068, T071, T073

---

## Parallel Example: User Story 1

```bash
# Tests — only these three are [P]; T027 and T030 share files with T026 and T029:
Task: "Unit-test cursor independence in tests/unit/lookup.test.ts"
Task: "Unit-test fill monotonicity in tests/unit/fill.test.ts"
Task: "Integration-test core playback in tests/integration/playback.spec.ts"

# Implementation — three independent files:
Task: "Implement buildIndex in src/lib/timing/index.ts"
Task: "Implement fillFraction in src/lib/timing/fill.ts"
Task: "Implement WordSpan.svelte in src/components/WordSpan.svelte"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1: Setup
2. Phase 2: Foundational — **critical, blocks everything**
3. Phase 3: User Story 1
4. **STOP and VALIDATE**: run quickstart Scenario 1 against the fixture pair
5. This is a demonstrable product: a person can sing to it

### Incremental Delivery

1. Setup + Foundational → lyric pipeline and shell ready
2. + US1 → **MVP**: synchronized karaoke with a fixed pair
3. + US2 → self-service: any video, any lyric file
4. + US3 → practisable: repeat verses, fix offset files
5. + US4 → comfortable: legible, adjustable, with preview and countdown

Each increment is independently valuable and does not break the last.

### Parallel Team Strategy

1. Everyone on Setup + Foundational
2. Then: Developer A takes US1 through to its checkpoint. Developers B and C take US2 and US3/US4 respectively **after** US1's checkpoint, given the file overlap noted above.
3. Polish is broadly parallel and can absorb spare capacity at any point after US1.

---

## Notes

- `[P]` means different files and no dependency on incomplete work
- Every task names an exact file path; commit after each task or logical group
- Stop at any checkpoint to validate a story independently
- Three tasks exist purely to make a constitutional principle falsifiable: **T004** (import boundary), **T066** (no egress), **T072** (proving T004 actually fails). Treat them as load-bearing, not as chores — each one converts a stated principle into something CI can reject.
