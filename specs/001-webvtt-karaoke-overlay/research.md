# Phase 0 Research: WebVTT Karaoke Overlay

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-08-17

Ten decisions. Each one closes a Technical Context unknown or an approach fork that materially changes the design. No `NEEDS CLARIFICATION` markers remain after this document.

---

## D1. Parse WebVTT ourselves rather than through the native `TextTrack` API

**Decision**: Hand-write the parser in `src/lib/vtt/parse.ts`, operating on a plain string. Never construct a `<track>` element.

**Rationale**:

- **Diagnostics are a requirement, and the native parser has none.** FR-020 requires tolerating malformed, out-of-order, zero-length, and out-of-range cues while continuing; FR-021 requires reporting failures in plain language that names what went wrong. The native parser silently discards cues it dislikes and surfaces a single detail-free `error` event. We cannot build the required error taxonomy on top of it.
- **Lyrics must load independently of video.** FR-022 requires replacing the lyric file without reloading the video. The native path needs a media element and a blob URL round-trip through load events; a string parser has no such coupling.
- **We need the tokenizer regardless.** Even taking cue time ranges from the native parser, inline word timestamps arrive inside `VTTCue.text` as raw `<00:00:12.500>` markup, so the timestamp splitter, the markup stripper (FR-018), and the segmenter (FR-023) all still have to be written. The native API would supply only the outer time-range parse — the easiest part.
- **Testability.** A pure `string -> {lines, diagnostics}` function is fixture-driven and runs in Vitest with no DOM, no media element, and no async. That is the difference between fast unit tests and a browser harness for parser correctness.

**Alternatives considered**:

- *Native `TextTrack` + `cue.text` post-processing* — rejected above. Buys the time-range parse, costs the entire error-reporting story.
- *`getCueAsHTML()` for the node tree* — rejected. The spec turns timestamp tags into ProcessingInstruction nodes, and browser behavior here is inconsistent; it is the least portable part of the API.
- *An off-the-shelf npm parser* — rejected. Existing parsers target subtitles, treat inline cue timestamps as an afterthought, and none expose the repair-with-diagnostics behavior FR-020/FR-021 need. A dependency that we would have to fork is worse than 300 lines we own.

---

## D2. Drive synchronization from `requestAnimationFrame` reading `currentTime`

**Decision**: One rAF loop per playing media element. Each frame reads `video.currentTime`, computes the render state from it, and writes the result. The loop stops on pause (after one final render) and restarts on play.

**Rationale**:

- **`timeupdate` is disqualified by frequency.** Browsers fire it roughly four times a second. FR-008 requires continuous, smooth tracking with no visible stepping; 250ms granularity is visible stepping.
- **Reading beats accumulating, and that is what satisfies SC-005.** The tempting design keeps a local clock and advances it by frame delta. That accumulates error, and the ten-minute drift criterion becomes a tuning exercise. By treating `currentTime` as the sole source of truth every frame, position error is bounded by one frame interval permanently — drift cannot accumulate because nothing is accumulated. SC-005 becomes structural.
- **It resolves three edge cases for free.** Rate changes (FR-009), tab-backgrounding, and rapid scrubbing all reduce to "the next frame reads the true position." rAF is paused while the tab is hidden, so the first frame after returning re-reads and re-renders correctly with no special handling.

**Alternatives considered**:

- *`requestVideoFrameCallback`* — rejected. It ties updates to decoded video frames, so a 24fps video would update the highlight at 24Hz regardless of a 60Hz display, directly working against SC-003. Cross-browser availability also arrived late in Firefox.
- *`setInterval` at 16ms* — rejected. Not aligned to the compositor, drifts against vsync, and continues burning cycles when the tab is hidden.

---

## D3. Two-layer `clip-path` fill, per word

**Decision**: Each word renders as two stacked, pixel-identical text layers — the unsung layer beneath, the sung layer above — with the sung layer revealed by `clip-path: inset(0 calc(100% - var(--p) * 100%) 0 0)`. Words before the active one sit at `--p: 1`, words after at `--p: 0`.

**Rationale**:

- **Per-word, not per-line, because lines wrap.** The classic karaoke technique sweeps one horizontal clip across an entire line. That breaks the moment a line wraps to a second visual row (FR-012, and the "very long line" edge case), because a single horizontal boundary is meaningless across two rows. Clipping within each word is wrap-agnostic.
- **Both layers keep normal text rendering.** Shadows, outlines, and the sung/unsung treatments can differ freely and are applied to real, opaquely-colored text — which is what makes the FR-015/SC-008 legibility work tractable.
- **One property write per frame.** Only the active word's `--p` changes between frames; every other word is already clamped at 0 or 1. Cost per frame is O(1) in line length, not O(words).

**Alternatives considered**:

- *`background-clip: text` with a moving gradient stop* — rejected. It requires `color: transparent`, which couples the fill to the text color and complicates the outline/stroke work that legibility over arbitrary footage depends on. Kept in reserve if the duplicate-layer DOM proves costly.
- *Per-character spans toggled individually* — rejected. It produces the per-letter jump that the spec's Assumptions explicitly rule out, and multiplies DOM nodes by an order of magnitude.

---

## D4. Reactive state at line granularity; imperative DOM writes at word granularity

**Decision**: Svelte reactivity owns *which* lines are on screen — a coarse, low-frequency change. The rAF loop writes `--p` directly to the active word's element via `style.setProperty`, bypassing the reactive system entirely.

**Rationale**: This is the single most important performance decision in the design. Routing a 60Hz scalar through reactive state would invalidate and re-diff the overlay component tree sixty times a second for a change that touches one CSS custom property on one element. Frames get dropped and SC-003 fails. Splitting the two — reactive for structure, imperative for the per-frame scalar — keeps the framework doing what it is good at and keeps the hot path at a single property write.

**Alternatives considered**:

- *All-reactive, `$state` holding the playhead* — rejected on the cost above.
- *A CSS-animation-driven fill scheduled per word* — rejected. It re-derives a second clock from the animation timeline, reintroducing exactly the drift-and-resync problem D2 eliminates, and it fights every seek.

---

## D5. Cursor-plus-binary-search lookup over an interval index

**Decision**: Sort lines by start time and precompute a running maximum of end times. To find the active set at position `t`: binary search for the last line whose start ≤ `t`, then walk left while the running max end ≥ `t`, collecting lines whose range covers `t`. Between frames, keep a cursor; advance it incrementally while playback is monotonic, and fall back to a fresh binary search when a discontinuity is detected (`t` moved backwards, or jumped by more than one frame's worth, or a `seeking` event fired).

**Rationale**:

- **Overlaps make naive lookup wrong.** FR-019 requires duets and backing vocals — two lines active at once — to display and highlight independently. A "find the one cue containing t" search silently drops one of them. The running-max-end augmentation makes finding *all* covering intervals correct and still logarithmic.
- **The cursor makes the common case O(1).** Playback is monotonic almost always; the amortized cost per frame is a comparison.
- **Explicit discontinuity detection is what makes rapid scrubbing correct.** The "drag the playhead quickly back and forth" edge case is precisely a cursor-invalidation bug in disguise. Naming the invalidation condition up front is cheaper than debugging stale lines later.

**Alternatives considered**:

- *Linear scan per frame* — viable at 1,000 cues, rejected on principle: it makes per-frame cost depend on file size, and the constraint says O(1) in cue count.
- *A full interval tree* — rejected as unjustified complexity for a sorted, mostly-disjoint, few-hundred-element set.

---

## D6. `Intl.Segmenter` for word and grapheme segmentation

**Decision**: Split line text into words with `new Intl.Segmenter(locale, {granularity: 'word'})`, filtering to `isWordLike` segments. Use `granularity: 'grapheme'` wherever a partial measurement could otherwise land mid-character.

**Rationale**: FR-023 requires correct behavior for scripts that do not delimit words with spaces and for characters composed of multiple code points. `Intl.Segmenter` is the platform's ICU-backed implementation of exactly this and needs no dependency. Splitting on `/\s+/` fails Japanese, Thai, and Chinese outright; splitting on code units breaks emoji, Devanagari conjuncts, and combining marks — the visible symptom being a highlight boundary that bisects a glyph.

**Consequence**: `Intl.Segmenter` sets the browser floor (Chrome 87+, Safari 14.1+, Firefox 125+). That is comfortably inside the spec's "modern evergreen browsers" assumption and is recorded as the reason the floor is where it is.

**Alternatives considered**:

- *Whitespace split with a CJK special case* — rejected. Reimplements a fraction of ICU, badly.
- *An npm segmentation library* — rejected. Ships a large table for something the platform already has.

---

## D7. Timing offset applied at lookup, never to stored cues

**Decision**: The offset is one scalar on Playback State. Lookup evaluates at `t - offset`. Parsed cue times are immutable after parse.

**Rationale**: FR-013 requires the offset to take effect immediately and persist for the session. Rewriting every cue on each adjustment is O(cues) per keystroke, destroys the precomputed index, and makes the offset lossy across repeated changes (round-tripping accumulated float error). A single subtraction at the point of use is O(1), exact, and trivially reversible. It also keeps the parse output a faithful record of the file, which the diagnostics depend on.

---

## D8. Derive per-word timings by character-weight distribution

**Decision**: For a line with no inline timestamps (FR-004), assign each word a share of the line duration proportional to its character count, excluding whitespace and punctuation from the weight. Word boundaries come from D6.

**Rationale**: The spec's Assumptions section already commits to proportional-to-length. Character weight is a better proxy for singing duration than equal division — long words genuinely take longer — and it directly satisfies SC-009's requirement that the fill never sit fully colored at line start or fully uncolored at line end, because the weights sum to exactly the line duration by construction.

**Alternatives considered**:

- *Equal division per word* — rejected as visibly wrong on lines mixing short and long words.
- *Syllable estimation* — rejected. Language-specific, unreliable, and explicitly beyond what the spec says the file expresses.

---

## D9. Guarantee contrast with a scrim, not against the video

**Decision**: Render lyrics on a semi-opaque gradient scrim behind the text block, plus a text shadow and `paint-order: stroke fill` outline. Measure contrast between text and scrim.

**Rationale**: SC-008 demands measured contrast against the brightest and darkest footage tested. Contrast against arbitrary video is not a property that can be *verified* — the footage is unbounded, and any check is a sample. Interposing a scrim converts an untestable claim into a deterministic one: the scrim's composited color is known, so the contrast ratio is computable and assertable in a unit test, independent of what plays behind it. This is a testability decision as much as a design one.

**Alternatives considered**:

- *Sampling video frames and adapting text color* — rejected. Requires per-frame canvas readback (expensive, and taints the canvas for cross-origin sources), and produces color that flickers with the footage.
- *Outline only, no scrim* — rejected. Insufficient over high-detail bright footage, which is the case SC-008 names.

---

## D10. Vite + Svelte 5 SPA; Vitest and Playwright for tests

**Decision**: Plain Vite + Svelte 5 with runes. No SvelteKit. Vitest for `src/lib/`, Playwright for browser integration.

**Rationale**: The spec rules out a server component, accounts, persistence, and routing. SvelteKit's value is SSR, routing, and server endpoints — all three are out of scope, and adopting it would mean configuring `adapter-static` to switch them back off. Vite alone is the smaller correct tool. Vitest shares Vite's transform pipeline, so the pure modules test with no separate build config. Playwright covers what genuinely needs a browser: real media playback, seeking, and fullscreen.

**Fixture note**: integration tests need a deterministic video. `scripts/make-fixture-media.mjs` generates two silent VP8 WebM files with ffmpeg and they are committed, so the suite never depends on network media or on an encoder being present at test time. A second, deliberately hostile fixture (bright high-frequency noise) exists so SC-008 legibility is measured against real composited pixels rather than against the stylesheet.

**Alternatives considered**:

- *SvelteKit with `adapter-static`* — rejected as configuration overhead for capabilities the spec excludes. Revisit only if a shareable-link or catalog feature ever enters scope.
- *Jest / Testing Library* — rejected. A second transform pipeline for no gain over Vitest.

---

## Resolved Technical Context

| Unknown | Resolution | Source |
|---|---|---|
| Language/Version | TypeScript 5.7 strict, ES2023 | D10 |
| Primary Dependencies | Svelte 5 + Vite 6, zero runtime deps | D1, D6, D10 |
| Storage | N/A — session-scoped memory | spec Assumptions |
| Testing | Vitest (pure core) + Playwright (browser) | D10 |
| Target Platform | Chrome 126+, Firefox 128+, Safari 17+ | D6 sets the floor |
| Project Type | Client-only SPA, single project | D10 |
| Performance Goals | Display-rate updates, O(1) per frame | D2, D4, D5 |
| Constraints | No drift by construction; testable contrast | D2, D9 |
| Scale/Scope | ~1,000 cues, ~15,000 tokens, 10+ min | D5 |
