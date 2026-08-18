# Karaoke

A client-only Svelte application that plays your own music video with your own
WebVTT lyric file overlaid, colouring each word progressively as it is sung.

Nothing is uploaded. There is no account, no server, and no telemetry — after the
first load it works with the network disconnected.

## Requirements

- Node 22+ and pnpm 10+
- A browser with `Intl.Segmenter`: Chrome 126+, Firefox 128+, or Safari 17+

**Why `Intl.Segmenter` sets the floor**: lyrics must split into words correctly
for scripts that do not delimit with spaces (Japanese, Thai, Chinese) and for
characters built from several code points (emoji sequences, Devanagari
conjuncts). Splitting on whitespace or code units puts the highlight boundary
through the middle of a glyph. `Intl.Segmenter` is the platform's ICU-backed
answer, so the browser floor is wherever it landed — a recorded consequence, not
an accident.

## Getting started

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

Drop a video file and a `.vtt` lyric file onto the window, or use the two
buttons. The two are independent: replace either without disturbing the other.

## Scripts

| Command | Does |
|---|---|
| `pnpm dev` | Development server |
| `pnpm build` | Static output in `dist/` — open from any static host or from disk |
| `pnpm test` | Vitest: parser, segmentation, repair, lookup, fill, contrast, egress |
| `pnpm test:e2e` | Playwright: playback, loading, overlay, endurance |
| `pnpm check` | `svelte-check` + `tsc --noEmit` |
| `pnpm lint` | ESLint, including the `src/lib/` purity boundary |

`pnpm test` includes an egress check that reads `dist/`; run `pnpm build` first
or those cases skip with an explicit message rather than passing vacuously.

## How it is put together

Three ideas carry most of the design. All three are recorded in
[`specs/001-webvtt-karaoke-overlay/research.md`](specs/001-webvtt-karaoke-overlay/research.md)
with the alternatives that were rejected.

**The parser is hand-written, not the platform `TextTrack` API.** A lyric file
comes from someone who did not write it and cannot debug it, so the parser has to
explain what went wrong and keep playing the rest of the file. The platform
parser drops bad cues silently and offers no diagnostics to build that on. Inline
`<00:00:12.500>` word timestamps arrive as raw markup inside `cue.text` anyway,
so the native path would only have saved the outer time-range parse.

**Playback position is read every frame, never accumulated.** A local clock
advanced by frame delta accumulates error, and "no observable drift at ten
minutes" becomes a tuning exercise. Reading `currentTime` each frame bounds the
error at one frame interval permanently — drift cannot accumulate because nothing
is accumulated. Seeking, rate changes, and tab-backgrounding then need no
special-case code, because the next frame reads the truth.

**Reactivity is line-granular; the per-frame fill is imperative.** Routing a 60Hz
scalar through Svelte's reactivity would re-diff the overlay tree sixty times a
second for one CSS custom property on one element. The hot path is a single
`style.setProperty` call.

### Layout

```
src/lib/        pure TypeScript — no Svelte, no DOM, no media element
  vtt/          parse, tokenize, sanitize, repair
  timing/       index, lookup, fill, clock
src/components/ the impure edge: owns the media element and the overlay
src/state/      session state (runes)
tests/unit/     Vitest — no browser
tests/integration/ Playwright
```

The `src/lib/` boundary is enforced by ESLint, not by convention: importing
Svelte or touching the DOM from the core fails the build. `clock.ts` is the one
exempt module, because something has to read `currentTime`.

## Project governance

[`.specify/memory/constitution.md`](.specify/memory/constitution.md) states five
principles this codebase is held to, and each has at least one test that can fail
it. That is deliberate — a principle nothing can falsify is only a preference.

## Running the browser tests without root

`npx playwright install --with-deps` needs root to install Chromium's shared
libraries. If you do not have it, `scripts/fetch-browser-libs.sh` extracts them
into a local prefix and writes `.env.test`, which `playwright.config.ts` picks up
automatically. On a normal machine that file is simply absent.

## Test fixtures

`scripts/make-fixture-media.mjs` generates two silent VP8 WebM files with ffmpeg:
`tiny.webm` (quiet, 25s — the default sync source) and `busy.webm` (bright,
high-frequency noise, 10s — the SC-008 worst case for legibility). Regenerate
with `node scripts/make-fixture-media.mjs`.

## Known gaps

- No fixture exercises the ~1,000-cue scale the timing budget assumes.
- Print/PDF output, lyric editing, and scoring are out of scope by design — see
  the spec's Out of Scope section.
