# Phase 1 Data Model: WebVTT Karaoke Overlay

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

Entities are drawn from the spec's Key Entities section, plus three derived structures the design requires: `Diagnostic`, `CueIndex`, and `RenderState`. Types are shown in TypeScript because they are the implementation's actual contract; see [contracts/](./contracts/) for behavioral guarantees.

Times are **seconds as `number`** throughout, matching `HTMLMediaElement.currentTime`. Never milliseconds — a mixed-unit codebase is where sync bugs live.

---

## Immutable parse output

These are produced once by the parser and never mutated. Per D7, the timing offset is applied at lookup, so cue times stay a faithful record of the file.

### `WordToken`

The smallest highlighted unit.

| Field | Type | Notes |
|---|---|---|
| `text` | `string` | Display text, markup already stripped (FR-018) |
| `start` | `number` | Seconds, absolute on the media timeline |
| `end` | `number` | Seconds; `end > start` guaranteed post-repair |
| `index` | `number` | 0-based position within the line |
| `derived` | `boolean` | `true` if timing came from D8 distribution rather than the file (FR-003 vs FR-004) |

**Validation**
- `end > start` — enforced by repair, never by the parser's happy path.
- Tokens within a line are ordered by `index`, and `start` is non-decreasing across that order.
- `text` is non-empty and contains no whitespace-only segments; non-word segments from `Intl.Segmenter` are dropped before token construction (D6).
- Token boundaries never fall inside a grapheme cluster (FR-023).

### `LyricLine`

One timed unit of lyrics. May overlap other lines (FR-019).

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Stable identity for keyed rendering; the cue identifier if present, else a generated ordinal |
| `start` | `number` | Seconds |
| `end` | `number` | Seconds; `end > start` post-repair |
| `text` | `string` | Full display text, markup stripped |
| `tokens` | `WordToken[]` | Ordered, non-empty for any renderable line |
| `voice` | `string \| null` | Speaker from a `<v Name>` annotation, retained as metadata but never rendered as literal text (FR-018) |

**Validation**
- `tokens[0].start >= start` and `tokens.at(-1).end <= end`.
- A line whose tokens are entirely `derived` covers `[start, end]` with no gaps — this is what SC-009 asserts.
- An empty-text cue parses successfully and yields zero tokens; it is retained for diagnostics but never rendered.

### `Diagnostic`

The parser's error channel. Existence of this type is the reason for D1.

| Field | Type | Notes |
|---|---|---|
| `severity` | `'error' \| 'warning'` | `error` = file unusable; `warning` = cue repaired or skipped, rest of file fine |
| `code` | `DiagnosticCode` | Enumerated, see below |
| `line` | `number \| null` | 1-based line number in the source file |
| `message` | `string` | Plain language, names the problem and the remedy (FR-021) |

`DiagnosticCode` is a closed set: `missing-webvtt-header`, `malformed-timestamp`, `zero-length-cue`, `inverted-cue`, `out-of-order-cue`, `cue-beyond-media`, `unparseable-cue-block`, `empty-file`, `no-cues`.

**Rule**: a `Diagnostic` never carries raw file content into its `message`. Messages describe the fault class and the fix; they do not echo untrusted input into the UI.

---

## Session state (mutable)

### `LyricSource`

| Field | Type | Notes |
|---|---|---|
| `origin` | `{kind: 'file', name: string} \| {kind: 'url', href: string}` | |
| `status` | `'empty' \| 'loading' \| 'ready' \| 'failed'` | |
| `lines` | `LyricLine[]` | Sorted by `start`; empty unless `status === 'ready'` |
| `diagnostics` | `Diagnostic[]` | Populated in `ready` and `failed` alike — a file can load with warnings |

**State transitions**

```text
empty ──load──▶ loading ──parse ok───▶ ready
                   │                     │
                   └──parse fatal──▶ failed
                                         │
       ready ──load new──▶ loading ◀─────┘
```

**Critical rule (FR-021)**: a transition into `failed` must not clear the `lines` of a previously `ready` source. Failed loads are staged and swapped in only on success, so previously loaded content stays usable.

### `MediaSource`

| Field | Type | Notes |
|---|---|---|
| `origin` | same shape as `LyricSource.origin` | |
| `status` | `'empty' \| 'loading' \| 'ready' \| 'failed'` | |
| `duration` | `number \| null` | Known once metadata loads; used to flag `cue-beyond-media` |
| `error` | `string \| null` | Plain-language message (FR-021) |

`LyricSource` and `MediaSource` transition **independently** — that is the whole content of FR-022.

### `PlaybackState`

Split in two by **Principle III**, which forbids holding the playhead in reactive state. The
split is not stylistic — it is the compliance boundary, and collapsing the two halves back into
one reactive object is the regression to watch for.

**`PlaybackState` (reactive, `src/state/media.svelte.ts`)** — changes at human frequency, safe
to route through runes:

| Field | Type | Notes |
|---|---|---|
| `playing` | `boolean` | Set from `play`/`pause`/`ended` |
| `rate` | `number` | Playback rate; nothing in the timing model reads it (FR-009) |
| `seeking` | `boolean` | Set from `seeking`/`seeked`; forces cursor invalidation (D5) |
| `offset` | `number` | Seconds, signed. Lyrics evaluated at `position - offset` (FR-013, D7) |
| `duration` | `number \| null` | From loaded metadata |

**Playhead position (non-reactive)** — changes at display frequency, and therefore MUST NOT be a
rune. It is never stored as a field. The clock reads `currentTime` and passes it directly to
`resolve()` as an argument; the resulting fill fraction is written to the DOM imperatively (D4).

```ts
// Compliant: position is an argument, never state.
createClock(el, (position) => {
  const next = resolve(index, position, prefs, playback.offset);
  applyRenderState(next);        // imperative; one property write for the active token
});
```

**Violation to watch for**: adding `position: $state(0)` to the reactive half "so components can
read it." That single line re-diffs the overlay tree sixty times a second and fails SC-003. If a
component appears to need the playhead, it needs a `RenderState` field instead.

### `DisplayPreferences`

Session-scoped (spec Assumptions: no persistence).

| Field | Type | Default | Requirement |
|---|---|---|---|
| `textScale` | `number` | `1.0` | FR-014 |
| `colorScheme` | `'classic' \| 'high-contrast' \| 'warm' \| 'cool'` | `'classic'` | FR-014, SC-008 |
| `placement` | `'bottom' \| 'center' \| 'top'` | `'bottom'` | FR-014 |
| `previewWindow` | `number` | `4.0` s | FR-016 |
| `countdownThreshold` | `number` | `3.0` s | FR-017 |

**Validation**: every `colorScheme` must satisfy the contrast floor against the composited scrim (D9) at every `textScale`. This is a unit-testable invariant, not a design review item.

---

## Derived structures

### `CueIndex`

Built once per `LyricSource` transition into `ready`. Rebuilt never — the offset does not invalidate it (D7).

| Field | Type | Notes |
|---|---|---|
| `lines` | `readonly LyricLine[]` | Sorted by `start`, then by `end` |
| `maxEndPrefix` | `readonly number[]` | `maxEndPrefix[i] = max(lines[0..i].end)`; makes all-covering-interval lookup logarithmic (D5) |
| `cursor` | `number` | Mutable hint, last resolved index; advisory only — correctness never depends on it |

### `RenderState`

What the overlay draws for one frame. Pure function of position and index.

| Field | Type | Notes |
|---|---|---|
| `active` | `ActiveLine[]` | Zero, one, or many (FR-019). Empty means clear the overlay (FR-005) |
| `preview` | `LyricLine \| null` | Next line if within `previewWindow` (FR-016) |
| `countdown` | `number \| null` | Seconds until next line, if the gap exceeds `countdownThreshold` (FR-017) |

`ActiveLine` is `{line: LyricLine, activeTokenIndex: number, fill: number}` where `fill` ∈ [0, 1] is the fraction of the active token completed. Tokens below `activeTokenIndex` render at fill 1, above at 0 (D3).

---

## Entity relationships

```text
LyricSource ──1:N──▶ LyricLine ──1:N──▶ WordToken
     │                    ▲
     └──1:N──▶ Diagnostic │
                          │
              CueIndex ───┘  (borrows, does not own)

MediaSource ──▶ <video> ──currentTime──▶ clock ──position (argument)──┐
     │                                                                │
     └──▶ PlaybackState (reactive: playing/rate/seeking/offset) ──────┤
                                                                      ├──▶ RenderState ──▶ overlay
                                          CueIndex ──────────────────┤
                                DisplayPreferences ──────────────────┘
```

`RenderState` is recomputed every frame and owns nothing. That is what makes seeking, rate changes, and tab-backgrounding require no special-case code (D2).
