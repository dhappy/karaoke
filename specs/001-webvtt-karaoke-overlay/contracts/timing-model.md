# Contract: Timing Model

**Modules**: `src/lib/timing/{index,lookup,fill,clock}.ts` | **Consumers**: `LyricOverlay.svelte`

Pure functions plus one impure clock. The pure part is where every synchronization correctness claim (FR-005, FR-007, FR-008, FR-009, FR-010, FR-019, SC-002, SC-004, SC-005, SC-009) is proven, without a browser.

## Pure surface

```ts
function buildIndex(lines: readonly LyricLine[]): CueIndex;

function resolve(
  index: CueIndex,
  position: number,          // media currentTime, seconds
  prefs: Pick<DisplayPreferences, 'previewWindow' | 'countdownThreshold'>,
  offset: number,            // signed, seconds (FR-013)
): RenderState;

function fillFraction(token: WordToken, at: number): number;  // clamped [0,1]
```

`resolve` evaluates lyrics at `position - offset` and never mutates `index.lines`. It may update `index.cursor`, which is advisory only — `resolve` must return identical output for the same `(index.lines, position, prefs, offset)` regardless of cursor state. That property is the test that catches every cursor-invalidation bug, including the rapid-scrub edge case.

### Phased delivery

`resolve` is delivered in two steps, and the split is sanctioned here so that a partial
implementation is contract-compliant rather than a silent shortfall:

| Field | Phase | Task |
|---|---|---|
| `active` | US1 | T033 — returns `preview: null`, `countdown: null` |
| `preview`, `countdown` | US4 | T059 — completes the remaining two fields |

The signature never changes; only which fields are populated. Every guarantee below applies to
`active` from US1 onward. A US1-era `resolve` returning non-null `preview` is as wrong as a
US4-era one returning `null` — the contract is the authority in both directions.

### Guarantees

1. **Cursor independence** — as above. Verified by running the fixture corpus forwards, backwards, and in shuffled random-access order, asserting identical `RenderState` sequences.
2. **Completeness under overlap** — `resolve` returns *every* line covering the evaluated position, not the first (FR-019).
3. **Empty is a valid answer** — gaps and post-final positions return `active: []`, which the overlay renders as cleared (FR-005).
4. **Monotone fill** — for a fixed token, `fillFraction` is non-decreasing in `at`, exactly `0` at or before `token.start`, exactly `1` at or after `token.end`.
5. **No drift** — `resolve` is memoryless in position. Position error is bounded by one frame interval for all time (SC-005). There is no accumulator to drift.
6. **Rate agnostic** — nothing reads `playbackRate`. Rate changes are invisible to the model because position is read, not integrated (FR-009).
7. **Offset is exact away from boundaries** — evaluating at `t + x` with offset `x` equals
   evaluating at `t` with offset `0`, and returning the offset to zero restores the original
   behaviour exactly. The qualifier is not a hedge: `(t + x) - x` differs from `t` by an ULP in
   IEEE-754, which flips the answer when `t` lands exactly on a token boundary. Offset must not
   *accumulate* error (it never does — it is one subtraction at point of use, never written back
   to the cue times), but it cannot make float arithmetic associative. (An earlier wording of
   this clause claimed bit-identical output and was falsified by the T026 offset test.)

## Clock (the one impure seam)

```ts
function createClock(media: HTMLMediaElement, onFrame: (position: number) => void): {
  start(): void;
  stop(): void;
  dispose(): void;
};
```

Behavior:

- `requestAnimationFrame` loop; each frame reads `media.currentTime` and calls `onFrame` (D2).
- Starts on `play`/`playing`, stops on `pause`/`ended` — **after one final `onFrame`**, so the overlay freezes exactly where it was (FR-010).
- Emits one `onFrame` on `seeked` even while paused, so scrubbing updates a paused overlay (FR-009, SC-004).
- Emits one `onFrame` on `visibilitychange` to visible. rAF is throttled while hidden; the first frame back re-reads the true position, so no resync logic is needed.
- `dispose` removes every listener and cancels any pending frame. Leaked rAF loops across source swaps (FR-022) are the failure this exists to prevent.

## Performance budget

| Operation | Budget | Basis |
|---|---|---|
| `buildIndex` | < 5 ms at 1,000 lines | Once per load |
| `resolve`, sequential playback | O(1) amortized | Cursor advance (D5) |
| `resolve`, after seek | O(log n) | Binary search |
| Per-frame DOM writes | 1 property set | Only the active token's `--p` (D4) |

The per-frame DOM-write budget is the one that decides SC-003. It is a fixed constant, independent of line length and file size.
