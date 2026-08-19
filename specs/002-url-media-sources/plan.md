# Implementation Plan: URL Media Sources

**Branch**: `002-url-media-sources` (working branch: `master`) | **Date**: 2026-08-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-url-media-sources/spec.md`

## Summary

Let the video and the WebVTT file be given as addresses as well as files, in any combination, and make a loaded pairing shareable as a link.

Three pieces carry the feature. A **pure source layer** (`src/lib/sources/`) normalizes and validates an address, classifies every way a load can fail, and turns a pairing into a link and back — all total functions over plain values, provable in Vitest with no browser. A **split retrieval path** that reflects a real platform asymmetry: lyrics are read with `fetch` (which needs CORS), while the video address is assigned straight to `<video src>` (which does not), so one source routinely succeeds where the other fails and each reports its own outcome. And a **fragment-carried share link**, which is the only transport that satisfies Constitution II — a query string would deliver the person's chosen addresses into GitHub Pages' access logs, a host they never named.

The shipped Content-Security-Policy currently permits no third-party origin at all, so it must widen — by exactly two directives, inbound only, with the egress test rewritten to pin the new shape rather than stop looking.

Nothing about parsing, timing, highlighting, or playback changes. This feature adds ways in, and one way out.

## Technical Context

**Language/Version**: TypeScript 6 (strict), Svelte 5 (runes), targeting ES2023

**Primary Dependencies**: Svelte 5 + Vite 8. **Zero runtime dependencies added.** `URL`, `URLSearchParams`, `fetch`, `AbortController`, and `history` are all platform built-ins — Principle V's "platform APIs MUST be preferred over reimplementation", with nothing left to reimplement.

**Storage**: N/A. Still no persistence. The share link is the person's own artifact, held in their bookmarks; the application stores nothing between visits.

**Testing**: Vitest for the pure source layer (normalization, validation, classification, link codec, and `retrieveText` with an injected `fetch`); Playwright against a **second local origin** for CORS, status, timeout, and redirect behaviour — a different port is a different origin, which is what makes those tests real.

**Target Platform**: Unchanged — modern evergreen browsers, desktop and mobile. `Intl.Segmenter` still sets the floor; nothing here raises it.

**Project Type**: Single project, client-only SPA. No backend, and this feature deliberately does not add one (no proxy — see Constitution Check).

**Performance Goals**: No frame-path change. Nothing this feature adds is read during playback. Existing budgets (60fps highlight, 100ms word onset, O(1) per-frame work) are untouched and must remain so.

**Constraints**: Lyric fetch deadline 20s; video stall threshold 30s without progress (SC-106 requires these be bounded *and stated*). Locally chosen files must keep working with the network disconnected (FR-121, SC-109). The link payload must reach no server, including our own (FR-124, SC-111).

**Scale/Scope**: Two source slots, one pairing at a time. Roughly 6 new pure modules, 1 new state module, 2 new components, and edits to 5 existing files.

All Technical Context items are resolved — see [research.md](./research.md). No `NEEDS CLARIFICATION` markers remain.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Evaluated against [Karaoke Constitution v1.0.1](../../.specify/memory/constitution.md).**

### Gate result

| Principle | Verdict | Basis |
|---|---|---|
| I. Pure Core, Impure Edge | PASS | New logic is pure and framework-free in `src/lib/sources/`; the one I/O function takes `fetch` as a parameter (D9). **No second `HTMLMediaElement` module** — `clock.ts` remains the only one in `src/lib/`, and the video path lives in `VideoStage.svelte`, the carved-out impure edge |
| II. The Device Is the Boundary | PASS — **with the argument below** | Fetching from an address the person typed is explicitly permitted by the principle; the link rides in the fragment so nothing reaches our host (D1); no proxy, no telemetry, no persistence |
| III. Frame Budget Is Correctness | PASS | Nothing added is read per frame. The two new reactive fields change at human frequency (a load starts, a load fails) and are read by chrome only. No playhead is introduced |
| IV. Never a Blank Screen | PASS | `decodeLink` and `normalizeAddress` are total; a failed load commits nothing; every failure category maps to a plain-language message naming a next step, with no fetched content in it |
| V. Earn Every Dependency | PASS | Zero runtime dependencies added; every capability is a platform built-in (D3, D5) |

**Gate passes, pre-Phase 0 and post-Phase 1 alike.** Complexity Tracking is empty — see the note at the end of this section.

### Principle II deserves the argument, not the checkmark

This is the feature that most directly tests "The Device Is the Boundary", and passing it by assertion would be worthless. Three things are being changed, and each needs its own justification.

**1. The application will now make network requests for user content.** Principle II anticipates this exactly: *"Fetching a media or lyric file from an address the person typed is permitted — that is the person directing their own browser."* This feature does that and only that. Every request is to an address the person supplied; the product contacts nothing else (FR-117), sends no analytics, and adds no telemetry. `retrieveText` is contractually limited to a single `fetch` to the given URL, and SC-108 verifies zero unrequested destinations across a full session.

**2. The Content-Security-Policy widens.** The current policy permits no third-party origin, which would block the feature entirely. It gains `https:` on `media-src` and `connect-src` — and nothing else. The widening is **inbound only**: `script-src` and `style-src` stay at `'self'`, so nothing fetched can execute; `form-action 'none'` and `base-uri 'none'` already forbid outbound navigation; `frame-src 'none'` and `worker-src 'none'` are added explicitly rather than inherited. The capability added is "retrieve these two kinds of file", not "talk to the internet". Development gets `http://localhost:*` through a Vite hook so the relaxation never reaches `dist/` (D2).

**3. The share link carries the person's choices.** This is the sharpest point, and it is why the transport is not a matter of taste. The site is served from GitHub Pages. Had the pairing ridden in a query string, every opened link would have written *what that person was about to sing* into the access logs of a host they never named — the precise thing the principle's second paragraph prohibits. The fragment is the one part of a URL that is never placed in a request line and never sent in `Referer`. FR-124 states this as an outcome, [contracts/share-link.md](./contracts/share-link.md) fixes it as a contract, and SC-111 is the test that can fail it.

**What was refused on Principle II grounds**, and is recorded so the reasoning survives:

- **No proxy.** When a host refuses to let its lyric file be read cross-origin, the tempting fix is to route the request through a server we control. That would send the person's content somewhere they did not name. The answer is to tell them and suggest downloading the file. The spec puts this in Out of Scope; this plan records *why* it is there.
- **No probe of the video address.** A HEAD request would sharpen video error messages, but it is a second request the person did not ask for, and (per D3) it would be wrong more often than the thing it diagnoses.
- **No `Referer`, no cookies, no custom headers.** `referrerPolicy: 'no-referrer'` and `credentials: 'omit'` are contract requirements, not defaults (FR-118, FR-119). A custom identifying header would also force a CORS preflight, breaking working requests — the privacy-preserving choice is the functional one.

### Principle I: one placement that needs stating rather than assuming

`retrieveText` performs I/O, which no other `src/lib/` module does. It is placed in `src/lib/sources/` because it satisfies the letter of the principle — no Svelte import, no DOM access, no media-element reference — *and* its rationale: `fetch` is injected, so abort, deadline, non-`ok` status, and `TypeError` branches are all reachable from a node test with a stub. "Every claim of correctness the project makes MUST be provable by a test that runs without a browser" is met, not dodged.

The media-element limit is untouched. This feature adds **no** module in `src/lib/` that references a live `HTMLMediaElement`; `clock.ts` remains the only one, and the video source path lives in `VideoStage.svelte`, which v1.0.1 explicitly carves out.

### Every principle has a test that can fail it

A principle no test can fail is only a preference. For this feature:

| Principle | The test that can fail it |
|---|---|
| I | The existing import-boundary check, extended to `src/lib/sources/`; the pure suites run in node |
| II | `egress.test.ts`, **rewritten** to pin the widened CSP's exact shape; plus SC-111's assertion that no code path writes the payload outside `location.hash` |
| III | Existing frame-budget endurance test — unchanged, and must stay green |
| IV | `link.test.ts` and `normalize.test.ts` totality cases (binary garbage, hostile fragments); the FR-112 "previous content survives" integration assertions |
| V | The existing zero-runtime-dependency check |

**The egress test is the one to watch, and it is weaker than it appears.** Its assertion is `toMatch(/connect-src\s+'self'/)` — a *prefix* match. It was checked against the widened policy rather than assumed: `connect-src 'self' blob: data: https:` **still matches**, so the test stays green while the property it exists to protect changes underneath it.

That is the worst of the available outcomes. A failing assertion would force someone to look; a vacuously passing one lets the widening through unremarked, and the project's only mechanism for keeping Principle II falsifiable stops falsifying anything.

It must be rewritten to pin whole directive values rather than prefixes: extract each directive up to its `;` and compare the token set exactly, so that `media-src` and `connect-src` may carry `https:` and nothing further, while `script-src`, `style-src`, `object-src`, `frame-src`, `base-uri`, and `form-action` stay exactly as they are. **A prefix match on a policy that grows by appending tokens is not a guard.** This is the single highest-risk item in the feature and belongs early in `tasks.md`, not at the end.

### Complexity Tracking

Empty. No principle is violated, and no accepted violation needs justification.

## Project Structure

### Documentation (this feature)

```text
specs/002-url-media-sources/
├── plan.md              # This file
├── research.md          # Phase 0 output — 11 decisions
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── source-loading.md
│   └── share-link.md
├── checklists/
│   └── requirements.md  # Written by /speckit-specify
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/
├── lib/                          # PURE — no Svelte, no DOM, no media element (Principle I)
│   ├── sources/                  # NEW
│   │   ├── normalize.ts          # copied-address artifacts -> clean address (D5)
│   │   ├── validate.ts           # address -> URL | pre-network failure (FR-105)
│   │   ├── hosts.ts              # streaming-service suffixes, stored WITHOUT scheme (D6)
│   │   ├── classify.ts           # platform errors -> closed FailureCategory set (D4)
│   │   ├── messages.ts           # category -> plain language + next step (FR-110/111)
│   │   ├── link.ts               # ShareLink <-> fragment; total, round-trips (SC-110)
│   │   ├── retrieve.ts           # the ONE I/O function; fetch injected (D9)
│   │   └── types.ts              # SourceSlot, FailureCategory, ShareLink
│   ├── vtt/                      # unchanged
│   ├── timing/                   # unchanged — clock.ts is still the only media module
│   └── format.ts                 # unchanged
├── state/
│   ├── sources.svelte.ts         # NEW — per-slot tokens, attempts, link reflection (D7, D10)
│   ├── media.svelte.ts           # + loading, failure
│   ├── lyrics.svelte.ts          # + loading, failure (load() itself unchanged)
│   └── prefs.svelte.ts           # unchanged — prefs deliberately never enter a link
├── components/                   # IMPURE EDGE
│   ├── SourcePicker.svelte       # + address input, paste/drop routing (FR-116)
│   ├── ShareLinkBar.svelte       # NEW — explicit copy action (FR-132), completeness (FR-127)
│   ├── LinkAnnounce.svelte       # NEW — names addresses before contacting them (FR-128)
│   ├── VideoStage.svelte         # describe() becomes origin-aware; stall detection (FR-120)
│   ├── ErrorBanner.svelte        # unchanged shape — categories arrive as messages
│   └── App.svelte                # wires the slots; no longer the only loader
├── main.ts                       # unchanged
└── styles/tokens.css             # unchanged

tests/
├── unit/
│   ├── normalize.test.ts         # NEW
│   ├── validate.test.ts          # NEW
│   ├── hosts.test.ts             # NEW
│   ├── classify.test.ts          # NEW
│   ├── messages.test.ts          # NEW
│   ├── link.test.ts              # NEW — round-trip is SC-110
│   ├── retrieve.test.ts          # NEW — stubbed fetch
│   └── egress.test.ts            # REWRITTEN — pins the widened CSP (D2)
├── integration/
│   ├── remote-sources.spec.ts    # NEW — happy path, mixed pair, CORS asymmetry
│   ├── remote-failures.spec.ts   # NEW — the taxonomy, and FR-112 survival
│   ├── share-link.spec.ts        # NEW — round-trip, replaceState, hostile fragments
│   └── (existing specs)          # unchanged, must stay green
└── fixtures/
    └── server.ts                 # NEW — second origin with misbehaving routes (D11)

index.html                        # CSP: +https: on media-src and connect-src only
vite.config.ts                    # + transformIndexHtml hook for dev-only localhost
```

**Structure Decision**: Single project, unchanged. The feature slots into the existing pure-core / impure-edge split rather than introducing a layer: new logic goes to `src/lib/sources/` because it is provable without a browser, orchestration to `src/state/` because that is where runes live, and element handling stays in `src/components/` where the constitution puts it. No new top-level directory is introduced — see D9 for the rejected `src/net/` alternative.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified.

**No violations.** No entries.
