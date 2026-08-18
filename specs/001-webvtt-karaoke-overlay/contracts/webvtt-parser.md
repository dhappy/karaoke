# Contract: WebVTT Parser

**Module**: `src/lib/vtt/parse.ts` | **Consumers**: lyric loading (FR-001, FR-022), diagnostics UI (FR-021)

The parser is the feature's trust boundary: it turns an arbitrary user-supplied file into the validated [data model](../data-model.md). It is a pure function — no DOM, no media element, no I/O, no async.

## Signature

```ts
function parseWebVTT(source: string, opts?: {
  mediaDuration?: number;   // enables cue-beyond-media diagnostics
  locale?: string;          // for Intl.Segmenter word breaking
}): ParseResult;

type ParseResult =
  | { ok: true;  lines: LyricLine[]; diagnostics: Diagnostic[] }
  | { ok: false; lines: [];          diagnostics: Diagnostic[] };
```

`ok: false` is reserved for files that cannot yield any usable lyrics. A file with 200 good cues and 3 broken ones is `ok: true` with 3 warnings — that is FR-020's "continue playing the rest of the file."

## Accepted input

The supported subset of the WebVTT grammar:

| Construct | Handling |
|---|---|
| `WEBVTT` header | Required. Absent ⇒ `missing-webvtt-header`, fatal. |
| `NOTE` blocks | Skipped silently. |
| `STYLE`, `REGION` blocks | Skipped. Positioning is owned by the overlay (FR-012), not the file. |
| Cue identifier line | Captured as `LyricLine.id`. |
| `hh:mm:ss.mmm --> hh:mm:ss.mmm` | Required per cue. `mm:ss.mmm` short form accepted. |
| Cue settings (`align`, `line`, `position`, …) | Parsed and **discarded** (FR-018). |
| `<v Name>` voice spans | Name captured to `LyricLine.voice`; tag never rendered (FR-018). |
| `<b> <i> <u> <c.class> <ruby> <rt>` | Stripped to their text content (FR-018). |
| `<00:00:12.500>` inline timestamps | **Load-bearing.** Split the cue into word groups with real timings (FR-003). |
| `&amp; &lt; &gt; &nbsp; &lrm; &rlm;` | Decoded to characters. |
| Byte-order mark, CRLF, lone CR | Normalized before parsing. |

## Repair rules

Every repair emits a `warning` diagnostic naming the source line. None of them abort the parse.

| Condition | Code | Action |
|---|---|---|
| `end < start` | `inverted-cue` | Swap the two. |
| `end === start` | `zero-length-cue` | Skip the cue; it cannot be highlighted. |
| Cue starts before the previous cue | `out-of-order-cue` | Keep it; sort at the end. Out-of-order is legal for overlaps (FR-019) and only diagnosed, never rejected. |
| `start >= mediaDuration` | `cue-beyond-media` | Drop the cue. |
| Timestamp unparseable | `malformed-timestamp` | Skip the cue block. |
| Cue block with no `-->` | `unparseable-cue-block` | Skip. |
| Zero cues in a valid file | `no-cues` | `ok: true`, empty `lines` — loads fine, shows nothing. |
| Empty / whitespace-only file | `empty-file` | Fatal. |

## Guarantees

1. **Totality** — never throws for any string input, including binary garbage. A caller needs no try/catch.
2. **Sorted output** — `lines` is sorted by `start`, ties broken by `end`. `CueIndex` construction depends on this.
3. **Token coverage** — for any line, `tokens` are ordered, non-overlapping, and lie within `[start, end]`. Lines with derived timings cover the full span with no gap (SC-009).
4. **No markup escapes** — no `LyricLine.text` or `WordToken.text` contains a WebVTT **tag**
   (`</?name…>` or an inline `<timestamp>`) or an undecoded entity. Checked by a property test over the fixture
   corpus, not by inspection.

   A bare `<` or `>` produced by decoding `&lt;`/`&gt;` is CORRECT output and must not be
   rejected — displaying those characters is the entire purpose of the entity. The guarantee
   is that no *markup* survives, not that no angle bracket does — `&lt; &gt;` legitimately
   decodes to `< >`, which a naive `<[^>]*>` check would reject. A tag is anchored by a tag
   name or a timestamp; match on that. (Found by the T015 property test on first run against
   `markup.vtt`; the original wording of this clause forbade correct behaviour.)
5. **Grapheme safety** — no token boundary falls inside a grapheme cluster (FR-023).
6. **Diagnostics never echo input** — messages describe fault classes, never quote file content.
7. **Determinism** — same input and options ⇒ identical output, including `id` generation.

## Test corpus

`tests/fixtures/` — each file exists to pin one behavior:

| Fixture | Pins |
|---|---|
| `word-timed.vtt` | Inline timestamps, `derived: false` throughout |
| `line-only.vtt` | D8 distribution, SC-009 gapless coverage |
| `overlapping.vtt` | Duet cues, FR-019 multi-active |
| `malformed.vtt` | Every repair rule, one cue each |
| `non-latin.vtt` | Japanese, Thai, Devanagari, emoji ZWJ sequences |
| `markup.vtt` | Voice spans, nested tags, entities, cue settings |
| `empty.vtt` | Valid header, zero cues |
