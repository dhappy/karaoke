# Quickstart: Validating the WebVTT Karaoke Overlay

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

How to run the feature and prove it works. This is a validation guide — implementation belongs in `tasks.md` and the code itself.

## Prerequisites

- Node 22+ and pnpm 10+ (both present on this machine: Node 22.14.0, pnpm 10.4.1)
- A modern browser meeting the [D6 floor](./research.md#d6-intlsegmenter-for-word-and-grapheme-segmentation): Chrome 126+, Firefox 128+, or Safari 17+
- No server, no API keys, no accounts — the app is entirely client-side

## Setup

```bash
pnpm install
pnpm dev          # Vite dev server, prints a localhost URL
```

## Scenario 1 — Core karaoke (User Story 1, P1)

The one scenario that must pass before anything else matters.

1. Open the dev server URL.
2. Drag `tests/fixtures/word-timed.vtt` and a music video onto the window.
3. Press play.

**Expected**: the line covering the playhead appears over the video; each word fills with the sung color progressively across the word — not snapping whole-word, not jumping letter by letter; the overlay clears in the gaps between lines and again at end of file.

**Fails if**: the whole line changes color at once (fill fraction not wired, [D3](./research.md#d3-two-layer-clip-path-fill-per-word)), highlighting visibly steps (`timeupdate` used instead of rAF, [D2](./research.md#d2-drive-synchronization-from-requestanimationframe-reading-currenttime)), or a stale line persists into a gap.

## Scenario 2 — Loading (User Story 2, P2)

1. With a song loaded and playing, drop a **different** `.vtt` on the window.
   **Expected**: lyrics swap, video keeps playing, no reload (FR-022).
2. Drop `tests/fixtures/malformed.vtt`.
   **Expected**: loads and plays; a warning banner names how many cues were repaired or skipped. Playback is not blocked.
3. Drop a `.txt` file that is not WebVTT.
   **Expected**: a plain-language error. **The previously loaded lyrics keep working** — this is the FR-021 clause most likely to regress.
4. Drop `tests/fixtures/empty.vtt` (valid header, zero cues).
   **Expected**: loads successfully, shows no overlay, no error.

## Scenario 3 — Playback and sync correction (User Story 3, P3)

1. Pause mid-line. **Expected**: the highlight freezes exactly in place and does not creep.
2. Resume. **Expected**: continues from the frozen point, no replay, no skip.
3. Scrub into the middle of a line. **Expected**: within a quarter second, words before the playhead are colored and words after are not (SC-004).
4. Scrub rapidly back and forth for several seconds, then release. **Expected**: the overlay matches wherever the playhead landed. No stale line, no duplicate line. *(This is the cursor-invalidation test from [D5](./research.md#d5-cursor-plus-binary-search-lookup-over-an-interval-index).)*
5. Set playback rate to 0.5× then 2×. **Expected**: highlighting tracks the audible position at both.
6. Apply a +0.5 s offset. **Expected**: every word shifts immediately; the offset holds for the session.

## Scenario 4 — Presentation (User Story 4, P4)

1. Load `tests/fixtures/non-latin.vtt`. **Expected**: Japanese, Thai, Devanagari, and emoji sequences all highlight without the fill boundary ever bisecting a glyph (FR-023).
2. Load `tests/fixtures/overlapping.vtt`. **Expected**: both duet lines display and fill independently (FR-019).
3. Increase text size until a line wraps. **Expected**: the line wraps and stays fully visible; the fill continues correctly onto the second row — the case a whole-line clip would break.
4. Play over bright, busy footage. **Expected**: text stays legible with no setting change (FR-015).
5. Narrow the window to phone width. **Expected**: overlay scales, controls stay reachable and unobscured (FR-012).
6. Watch a lead-in gap. **Expected**: countdown appears and disappears exactly when the line starts (FR-017); the next line shows de-emphasized inside the preview window (FR-016).

## Scenario 5 — Long-run accuracy

1. Play a full song (10+ minutes) to the end.

**Expected**: highlighting is as accurate at ten minutes as at the first line (SC-005). Because position is read each frame rather than accumulated ([D2](./research.md#d2-drive-synchronization-from-requestanimationframe-reading-currenttime)), any observable drift here means the clock was reimplemented as an accumulator — check that first.

2. Switch tabs for a minute, come back. **Expected**: the overlay matches the actual playback position immediately.

## Automated checks

```bash
pnpm test          # Vitest — parser, tokenizer, repair, lookup, fill
pnpm test:e2e      # Playwright — playback, loading, overlay
pnpm check         # svelte-check + tsc --noEmit
```

The Vitest suite is where the correctness claims live and needs no browser. Two properties matter most, per [contracts/timing-model.md](./contracts/timing-model.md):

- **Cursor independence** — the fixture corpus replayed forwards, backwards, and in shuffled random access yields identical `RenderState` sequences. Catches every scrub bug.
- **Gapless derived coverage** — lines with no inline timings produce tokens covering the full span, so no line is ever fully colored at its start or fully uncolored at its end (SC-009).

## Building

```bash
pnpm build         # static output in dist/
pnpm preview
```

`dist/` is static files. It can be opened from any static host or from disk; there is no server component to deploy.
