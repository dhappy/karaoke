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

### Loading from an address

Either source can be a web address instead of a file — paste one into its field,
drop a link onto the window, or paste a link with nothing focused. You can mix
freely: a local video with lyrics from the web, or the reverse.

Two limitations worth knowing before they surprise you:

- **The address must point at the file itself**, not at a page about it. A
  YouTube or Vimeo watch URL is a web page, not a video file, and the app will
  say so rather than failing vaguely. Extracting media from such pages is out of
  scope and will stay that way.
- **A lyric file needs its host's permission to be read by another site.** Videos
  play cross-origin without any cooperation from the host; reading a `.vtt` file
  does not. If the host does not send CORS headers, the app cannot read the file
  and will tell you so. **There is no workaround, deliberately** — routing your
  content through a proxy would send it somewhere you never named, which this
  project will not do. Download the file and choose it locally instead.

### Sharing a pairing

Once both sources are addresses, the app's own link reproduces the pairing,
including any timing offset you applied. Press **Copy link** to take it.

The pairing rides in the URL **fragment**, never the query string, and that is a
privacy decision rather than a formatting one: the fragment is the one part of a
URL browsers never send to a server. A query string would have written what you
were about to sing into the access logs of whoever hosts the site. Local files
cannot appear in a link — the app tells you when a link is only half a pairing,
and refuses to produce one at all when there is nothing shareable.

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
  sources/      addresses: normalize, validate, classify, messages, link, retrieve
src/components/ the impure edge: owns the media element and the overlay
src/state/      session state (runes), plus source-slot orchestration
tests/unit/     Vitest — no browser
tests/integration/ Playwright
tests/fixtures/server.ts  second origin for remote-source tests
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

## Deployment

The build is fully static — `pnpm build` emits `dist/`, which can be served from
any static host or opened from disk. There is no server component to deploy.

It publishes to the **root of the `gh-pages` branch** for GitHub Pages, two ways:

```bash
pnpm deploy          # verify, build, and publish from your machine
```

or automatically: `.github/workflows/deploy.yml` runs on pushes to `master`/`main`
(and on manual dispatch). It gates on lint, type check, unit tests, and the
Playwright suite before deploying, so a broken build cannot reach the live site —
the `src/lib` purity boundary and the no-egress rule are deployment gates, not
advice.

`gh-pages` is treated as a **build artefact, not history**: each deploy is a
single orphan commit, force-pushed, replacing the branch wholesale. The branch
can be deleted and regenerated at any time without losing anything.

### Three things that make Pages deploys fail silently

All three are handled, and all three fail loudly here rather than quietly in
production:

- **`base`** in `vite.config.ts` is pinned to `'/'` because `public/CNAME` serves
  the site from a custom domain root. If the CNAME were ever removed, the site
  falls back to `dhappy.github.io/karaoke` and `base` must become `'/karaoke/'` —
  otherwise `index.html` loads fine while every asset 404s, which presents as a
  blank page with no obvious cause.
- **`public/CNAME`** must reach the branch root or the custom domain silently
  reverts. Both the script and the workflow abort if it is missing.
- **`public/.nojekyll`** stops Pages running Jekyll over the output. Jekyll drops
  any path beginning with an underscore, and Vite can emit those — the symptom is
  a 404 on one chunk.

## Static assets

`public/` holds files that ship as-is. Everything in it is copied verbatim into
the build root and served from `/`, so `public/logo.png` is `/logo.png` in both
dev and production. This is the right home for a favicon, a web manifest, or
anything referenced by a stable URL.

Two things follow from "verbatim", and both matter:

- Files here are **not** bundled, hashed, transformed, or linted. Reference them
  by absolute path (`/favicon.svg`), never by importing them — an import gets you
  the bundler pipeline instead, which is usually what you actually want for
  images and fonts used inside components. Put those under `src/` and import them.
- Because nothing else inspects this directory, it is the one route by which a
  third-party script could reach users. `tests/unit/egress.test.ts` therefore
  scans the whole build rather than just `dist/assets`, and asserts it reaches a
  file that came from `public/` — so narrowing that scan later fails a test
  instead of quietly reopening the hole.

## Test fixtures

`scripts/make-fixture-media.mjs` generates two silent VP8 WebM files with ffmpeg:
`tiny.webm` (quiet, 25s — the default sync source) and `busy.webm` (bright,
high-frequency noise, 10s — the SC-008 worst case for legibility). Regenerate
with `node scripts/make-fixture-media.mjs`.

## TypeScript version constraint

TypeScript is pinned at **6.0.3**, not the latest 7.x, and this is deliberate.

No stable release of `typescript-eslint` (`>=4.8.4 <6.1.0`) or `svelte-check`
(`^5.0.0 || ^6.0.0`) accepts TypeScript 7 yet. Under TS 7 both do not merely warn
— they crash — which would silently remove `pnpm lint` and `pnpm check`, and with
them the ESLint rule that enforces the `src/lib/` purity boundary. A governance
guarantee that no longer runs is worse than an older compiler.

6.0.3 is the highest version both tools accept. Revisit when
`typescript-eslint` ships a release whose `typescript` peer range includes 7.

## Known gaps

- No fixture exercises the ~1,000-cue scale the timing budget assumes.
- Print/PDF output, lyric editing, and scoring are out of scope by design — see
  the spec's Out of Scope section.
