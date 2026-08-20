---

description: "Task list for URL Media Sources"
---

# Tasks: URL Media Sources

**Input**: Design documents from `/specs/002-url-media-sources/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: INCLUDED — not optional here. [Karaoke Constitution v1.0.1](../../.specify/memory/constitution.md) § Development Workflow requires unit tests for every pure-core module and an integration test for every person-observable behaviour. The plan's Constitution Check also names, per principle, the test that can fail it. These tasks exist to satisfy governance, not as a TDD preference.

**Organization**: Tasks are grouped by user story so each can be implemented, tested, and shipped independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete work)
- **[Story]**: Which user story the task serves (US1–US5)
- Every task names an exact file path

## Path Conventions

Single project, client-only SPA. `src/` and `tests/` at repository root, per [plan.md](./plan.md) § Project Structure.

The structural rule from feature 001 still governs: `src/lib/` is pure TypeScript — no Svelte imports, no DOM, no media element. `eslint.config.js` already scopes that rule to `src/lib/**/*.ts`, so the new `src/lib/sources/` directory inherits it with no configuration change. T004 tightens it for this feature's specific temptation.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: The test origin and lint boundary every later phase depends on

- [X] T001 Create the directory `src/lib/sources/` per [plan.md](./plan.md) § Project Structure
- [X] T002 Author the second-origin fixture server in `tests/fixtures/server.ts` serving `tests/fixtures/` with the seven routes in [quickstart.md](./quickstart.md) § The fixture origin — `/ok/*` (with `Access-Control-Allow-Origin: *`), `/no-cors/*` (header deliberately absent), `/404/*`, `/403/*`, `/slow/*` (holds past the 20s deadline), `/redirect/*` (302 to `/ok/*`), `/html/*` (200 with an HTML body). Node's built-in `http` only — no new dependency (Constitution V)
- [X] T003 Add the fixture server to the `webServer` array in `playwright.config.ts` on a fixed port distinct from 5173, so integration tests run against a genuinely different origin (research D11)
- [X] T004 [P] Extend `no-restricted-globals` in `eslint.config.js` to forbid `location` and `history` inside `src/lib/`, enforcing the [contracts/share-link.md](./contracts/share-link.md) rule that `link.ts` is pure and the caller owns navigation

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The content policy, the pure source layer, and the state plumbing. Nothing loads from an address until the CSP widens, so this phase blocks every user story.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### The content policy — highest risk in the feature

- [X] T005 Widen the CSP in `index.html` by exactly two directives — add `https:` to `media-src` and to `connect-src` — and add explicit `frame-src 'none'` and `worker-src 'none'`. Change nothing else; `script-src`, `style-src`, `object-src`, `base-uri`, and `form-action` stay as they are (research D2)
- [X] T006 Add a `transformIndexHtml` hook to `vite.config.ts` that appends `http://localhost:*` to `media-src` and `connect-src` **in dev mode only**, so the relaxation the integration tests need never reaches `dist/` (research D2)
- [X] T007 **Rewrite** the CSP assertions in `tests/unit/egress.test.ts` to pin whole directive values rather than prefixes: parse each directive up to its `;` and compare its token set exactly. `media-src` and `connect-src` may carry `https:` and nothing further; `script-src`, `style-src`, `object-src`, `frame-src`, `base-uri`, and `form-action` must be unchanged. The current `toMatch(/connect-src\s+'self'/)` is a **prefix** match that still passes against the widened policy — verified, not assumed — so leaving it would let any future widening through unnoticed ([plan.md](./plan.md) § Constitution Check)
- [X] T008 Add an assertion to `tests/unit/egress.test.ts` that the bundle contains no absolute third-party URL introduced by this feature, confirming the streaming-host list is stored as bare hostnames (research D6)

### Pure source layer — `src/lib/sources/`

- [X] T009 [P] Define `SourceSlot`, `FailureCategory`, `ShareLink`, and `AddressLoadAttempt` in `src/lib/sources/types.ts` per [data-model.md](./data-model.md). `FailureCategory` is a **closed** union — adding a member is an interface change
- [X] T010 [P] Implement `normalizeAddress` in `src/lib/sources/normalize.ts` — trim, strip one layer of wrapping `<>`, strip trailing `.,;:!?`, strip a trailing `)` only when parens are unbalanced ([contracts/source-loading.md](./contracts/source-loading.md) § normalize.ts)
- [X] T011 [P] Unit-test `normalizeAddress` in `tests/unit/normalize.test.ts` against the full table in the contract, including idempotence and the `Foo_(bar)` case that must be left alone
- [X] T012 [P] Implement `isStreamingHost` in `src/lib/sources/hosts.ts` with dot-boundary suffix matching over the ten hosts in research D6, stored as **bare hostnames with no scheme**
- [X] T013 [P] Unit-test `isStreamingHost` in `tests/unit/hosts.test.ts` — `www.`/`m.` subdomains match, `notyoutube.com` does not, and every entry is asserted to contain no `://`
- [X] T014 Implement `validateAddress` in `src/lib/sources/validate.ts` in the contract's check order — unusable scheme, then mixed content, then streaming page — making **no network request** (FR-105). Depends on T012
- [X] T015 [P] Unit-test `validateAddress` in `tests/unit/validate.test.ts` covering `javascript:`, `data:`, `file:`, http-from-https, streaming hosts, and that check order is observable
- [X] T016 [P] Implement `classifyFetchFailure` and `classifyMediaError` in `src/lib/sources/classify.ts` per the two tables in [contracts/source-loading.md](./contracts/source-loading.md) § classify.ts
- [X] T017 [P] Unit-test classification in `tests/unit/classify.test.ts` — every `FailureCategory` reachable, `TypeError` maps to `refused-or-unreachable`, and `hasPlayed` splits `unplayable-video` from `interrupted`
- [X] T018 [P] Implement `messageFor` in `src/lib/sources/messages.ts` — total over the closed category set, each message naming what went wrong **and** a next step, phrased per slot
- [X] T019 [P] Unit-test `messageFor` in `tests/unit/messages.test.ts` asserting the four contract guarantees: every category yields a message; no message contains response text, status text, or exception text; no message embeds the address; the slot is identifiable from the wording (SC-105)
- [X] T020 Implement `retrieveText` in `src/lib/sources/retrieve.ts` with `fetch` injected as a parameter defaulting to `globalThis.fetch`, and the exact request shape from the contract — `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, `redirect: 'follow'`, `mode: 'cors'`, no custom headers. Never throws; clears its deadline timer on every exit path. Depends on T016
- [X] T021 Unit-test `retrieveText` in `tests/unit/retrieve.test.ts` with a stubbed `fetch` — success, 404/403/5xx, `TypeError`, deadline fired, caller-abort returning `{ abandoned: true }` rather than a failure, and assertions that the request carries no cookies, no referrer, and no custom header

### State plumbing

- [X] T022 Add `loading` and `failure` fields to `MediaState` in `src/state/media.svelte.ts` and a `fail` variant that records a category alongside the message, keeping the file's Constitution III warning intact — neither field may be read on the frame path
- [X] T023 [P] Add `loading` and `failure` fields to `LyricsState` in `src/state/lyrics.svelte.ts`, leaving `load()` itself unchanged — its existing staging already satisfies FR-112 for the lyrics slot
- [X] T024 Create `SourcesState` in `src/state/sources.svelte.ts` holding the per-slot monotonic tokens, the in-flight `AddressLoadAttempt` per slot, and the abandon-previous-on-new-attempt logic (research D7). Tokens are **not** reactive — they are read in async continuations, never rendered

**Checkpoint**: The CSP permits retrieval, the pure layer is proven in node, and the state layer can track an attempt. User stories can begin.

---

## Phase 3: User Story 1 - Sing to a video and lyrics that live on the web (Priority: P1) 🎯 MVP

**Goal**: Paste two addresses, press play, and get the same karaoke a local pair produces.

**Independent Test**: Paste `/ok/tiny.webm` and `/ok/word-timed.vtt` from the fixture origin, press play, and confirm word-by-word highlighting identical to the local pair.

### Implementation

- [X] T025 [US1] Add an address input to `src/components/SourcePicker.svelte` for each slot — a text field plus submit, alongside the existing file pickers, with the 44px minimum hit target the constitution's Accessibility standard requires
- [X] T026 [US1] Implement `loadLyricsFromAddress` in `src/state/sources.svelte.ts` following the eight-step orchestration in [contracts/source-loading.md](./contracts/source-loading.md) § Orchestration — normalize, validate, take a token, retrieve, **re-check the token after every await**, then commit through the existing `lyrics.load()`. Depends on T020, T024
- [X] T027 [US1] Implement `loadVideoFromAddress` in `src/state/sources.svelte.ts` — normalize, validate, take a token, then assign the address to the media source. No `fetch` probe and **no `crossorigin` attribute**, so videos that need no CORS keep working (research D3)
- [X] T028 [US1] Wire both address loaders into `src/components/App.svelte` alongside the existing file handlers, so the two slots stay independent
- [X] T029 [US1] Surface per-slot loading state in `src/components/SourcePicker.svelte` — the person must be able to tell which of the two sources is still pending (FR-107)
- [X] T030 [P] [US1] Integration test the happy path in `tests/integration/remote-sources.spec.ts` — both addresses load, playback runs, and the overlay shows the active line
- [X] T031 [P] [US1] Integration test in `tests/integration/remote-sources.spec.ts` that a pair loaded from addresses produces the same line selection and word onsets as the same pair loaded as files (SC-102), which is what proves no code branches on origin
- [X] T032 [US1] Integration test the abandonment race in `tests/integration/remote-sources.spec.ts` — submit `/slow/word-timed.vtt` then immediately `/ok/word-timed.vtt`; the fast one must stay loaded and the slow one must neither replace it nor paint an error (FR-108, SC-107)

**Checkpoint**: A person with two addresses can sing. This is the MVP.

---

## Phase 4: User Story 2 - Mix a local file with a remote address (Priority: P2)

**Goal**: One source from disk, the other from an address, in either order.

**Independent Test**: Choose a local video, paste a lyric address, confirm karaoke plays; reverse and confirm again.

### Implementation

- [X] T033 [US2] Ensure replacing one slot never disturbs the other in `src/state/sources.svelte.ts` — a lyric load must not reset the video element, and a video load must not re-parse lyrics or reset `media.offset` (FR-103, FR-022 from feature 001)
- [X] T034 [US2] Display the current origin per slot in `src/components/SourcePicker.svelte` — the file name for a file, the address for an address — so the person can confirm the pairing (FR-115). Render the address as **text**, never as a link
- [X] T035 [P] [US2] Integration test both mixed orders in `tests/integration/remote-sources.spec.ts` — local video + address lyrics, then address video + local lyrics
- [X] T036 [P] [US2] Integration test in `tests/integration/remote-sources.spec.ts` that swapping one slot preserves the other's content, the playback position, and the applied offset
- [X] T037 [US2] Integration test the CORS asymmetry in `tests/integration/remote-sources.spec.ts` — `/no-cors/tiny.webm` **plays** while `/no-cors/word-timed.vtt` **fails**, proving each slot reports its own outcome and that the video path carries no CORS dependency (research D3)

**Checkpoint**: US1 and US2 both work independently.

---

## Phase 5: User Story 3 - Understand and recover when an address does not work (Priority: P3)

**Goal**: Every failure names itself in plain language, and whatever was playing keeps playing.

**Independent Test**: With a song playing, feed each broken address in turn; confirm a distinct explanation each time and that playback never stops.

### Implementation

- [X] T038 [US3] Make `describe()` in `src/components/VideoStage.svelte` origin-aware — it takes the origin kind so a remote failure suggests checking the address rather than choosing another file. This is a message-layer branch only; no playback behaviour may depend on origin ([data-model.md](./data-model.md) § Equivalence)
- [X] T039 [US3] Route video failures through `classifyMediaError` and `messageFor` in `src/components/VideoStage.svelte`, replacing the local `MediaError` switch so both slots share one taxonomy
- [X] T040 [US3] Implement the video stall detector in `src/components/VideoStage.svelte` — 30 seconds with no `progress` event and insufficient buffer reports `timed-out` before playback, `interrupted` after it (research D8, FR-120)
- [X] T041 [US3] **Implement the video source reinstatement path** in `src/state/sources.svelte.ts`: capture the current `src` before assigning a new address and restore it if the new one fails. Assigning `<video src>` is destructive — the old source is gone the instant the assignment happens — so staging alone cannot satisfy FR-112 for the video slot. This reads as correct without the reinstatement and quietly fails SC-104 ([contracts/source-loading.md](./contracts/source-loading.md) § Design note)
- [X] T042 [US3] Surface `failure` categories through `src/components/ErrorBanner.svelte` using `messageFor`, keeping the existing error/warning distinction — a warning still means it is playing
- [X] T043 [P] [US3] Integration test the pre-network refusals in `tests/integration/remote-failures.spec.ts` — malformed text, `http:` from `https:`, and a YouTube watch page each produce a distinct message with **no request made** (FR-105, FR-114)
- [X] T044 [P] [US3] Integration test the network failures in `tests/integration/remote-failures.spec.ts` against `/no-cors/`, `/404/`, `/403/`, `/slow/`, and `/html/` — one distinct plain-language message each (FR-110, SC-103)
- [X] T045 [US3] Integration test survival in `tests/integration/remote-failures.spec.ts` — with a pair playing, every failure above leaves the video, the lyrics, the playback position, and the offset untouched (FR-112, SC-104). Include the video-replacement case that T041 exists for
- [X] T046 [P] [US3] Integration test in `tests/integration/remote-failures.spec.ts` that no rendered message contains a status code, exception text, fetched content, or the address itself (FR-111)
- [X] T047 [P] [US3] Integration test the redirect case in `tests/integration/remote-failures.spec.ts` — `/redirect/word-timed.vtt` loads normally with no extra step for the person

**Checkpoint**: Failures are legible and non-destructive. The feature is usable rather than merely present.

---

## Phase 6: User Story 4 - Share a ready-to-play link (Priority: P4)

**Goal**: A loaded pairing becomes a link that restores itself, carrying the timing correction and disclosing nothing to any server.

**Independent Test**: Load a pair from addresses, apply a `-0.4` offset, copy the link, open it fresh — same sources, same offset, only play remaining.

### Implementation

- [X] T048 [P] [US4] Implement `encodeLink`, `decodeLink`, and `linkCompleteness` in `src/lib/sources/link.ts` per [contracts/share-link.md](./contracts/share-link.md) — keys `v`, `l`, `o`; `decodeLink` is **total**; unrecognized keys ignored; offset clamped to ±600s; first repeated key wins. Touches neither `location` nor `history`
- [X] T049 [P] [US4] Unit-test the codec in `tests/unit/link.test.ts` — the round-trip property (SC-110) with a **non-zero** offset, totality against binary garbage and truncated fragments, clamping, key order stability, and that file-backed slots contribute nothing
- [X] T050 [US4] Reflect loaded addresses and the settled offset into the fragment via `history.replaceState` in `src/state/sources.svelte.ts` — never `pushState`, and debounce the offset so dragging does not churn the address bar (research D10, FR-131). Depends on T048
- [X] T051 [US4] Decode the fragment on boot and on `hashchange` in `src/state/sources.svelte.ts`, feeding each address back through `validateAddress` exactly as typed input (FR-123, FR-129)
- [X] T052 [US4] Create `src/components/LinkAnnounce.svelte` naming the addresses an incoming link is about to contact, rendered as **text** — never markup, never a clickable link — and shown before contact begins (FR-128)
- [X] T053 [US4] Create `src/components/ShareLinkBar.svelte` with an explicit copy action (FR-132) that reports completeness per the contract's table — silent when complete, naming the missing half when partial, and **refusing** when empty (FR-127, SC-113)
- [X] T054 [US4] Add the 2000-character length guard in `src/components/ShareLinkBar.svelte` — over the threshold, say the pairing plays but the link is too long to share. The pairing must keep working; silent truncation is prohibited
- [X] T055 [US4] Mount `LinkAnnounce` and `ShareLinkBar` in `src/components/App.svelte`
- [X] T056 [P] [US4] Integration test the round trip in `tests/integration/share-link.spec.ts` — load a pair, apply a non-zero offset, reopen the encoded link, and assert both sources and the offset return (SC-110)
- [X] T057 [US4] **Integration test that the payload reaches no server** in `tests/integration/share-link.spec.ts` — open a shared link and assert via request interception that no request line and no `Referer` contains any part of the pairing (FR-124, SC-111). This is the Constitution II test; if it fails, the feature does not ship
- [X] T058 [P] [US4] Integration test address-bar behaviour in `tests/integration/share-link.spec.ts` — ten source changes during playback never reload the page, never interrupt playback, and leave the back button stepping out of the application rather than through the session (FR-131, SC-112)
- [X] T059 [P] [US4] Integration test hostile and partial fragments in `tests/integration/share-link.spec.ts` — `#v=javascript:alert(1)`, `#l=%00%01%02`, `#o=NaN`, `#o=99999`, and an unknown key beside a good one; none throws, blanks the screen, or executes, and the recognized half still loads (FR-129, FR-130)
- [X] T060 [P] [US4] Integration test the partial and empty link cases in `tests/integration/share-link.spec.ts` — a mixed pair reports partial, and two local files refuse to copy

**Checkpoint**: A pairing is shareable, and sharing it discloses nothing.

---

## Phase 7: User Story 5 - Supply addresses quickly and repeatedly (Priority: P5)

**Goal**: Paste-and-go, without hunting for the right input.

**Independent Test**: Paste an address onto the application with nothing focused and confirm it routes to the correct slot and loads.

### Implementation

- [X] T061 [US5] Handle paste and drop of a bare address anywhere on the application in `src/components/SourcePicker.svelte`, routing to the lyrics or video slot by apparent type and extending the existing `route()` that today handles only `File` objects (FR-116)
- [X] T062 [US5] Add a routing override in `src/components/SourcePicker.svelte` so a wrong guess can be corrected without re-pasting (FR-116)
- [X] T063 [P] [US5] Integration test paste routing in `tests/integration/remote-sources.spec.ts` — an address pasted with nothing focused reaches the right slot, and the override moves it to the other

**Checkpoint**: All five stories are independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T064 Verify the offline guarantee by hand per [quickstart.md](./quickstart.md) § Scenario 10 — `pnpm build && pnpm preview`, network genuinely disconnected, local file pair loads and plays exactly as before (FR-121, SC-109)
- [X] T065 [P] Add an integration assertion in `tests/integration/remote-sources.spec.ts` that no request is made to any address the person did not supply, across a full session including failed loads (FR-117, SC-108)
- [X] T066 [P] Confirm the existing frame-budget endurance test in `tests/integration/playback-endurance.spec.ts` still passes — this feature must not touch the frame path (Constitution III)
- [X] T067 [P] Update `README.md` to document loading by address and the share link, including the honest limitation that a host refusing cross-origin reads cannot be worked around and the file should be downloaded instead
- [X] T068 Run the full gate — `pnpm test`, `pnpm test:e2e`, `pnpm check`, `pnpm lint`, and `pnpm build` followed by `pnpm test` so the egress suite runs against `dist/` rather than skipping
- [X] T069 Walk [quickstart.md](./quickstart.md) scenarios 1–10 end to end and confirm every `FailureCategory` is reachable from the interface rather than merely defined

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup. **BLOCKS all user stories** — nothing loads from an address until T005 widens the CSP
- **User Stories (Phases 3–7)**: All depend on Foundational
- **Polish (Phase 8)**: Depends on the stories being delivered

### User Story Dependencies

- **US1 (P1)**: Depends only on Foundational. The MVP
- **US2 (P2)**: Depends on Foundational. Exercises the independence US1 built, but is separately testable
- **US3 (P3)**: Depends on Foundational. Its survival tests (T045) are most meaningful once US1 exists, but the classification work stands alone
- **US4 (P4)**: Depends on Foundational. Genuinely independent of US2 and US3 — the link codec and reflection touch different files
- **US5 (P5)**: Depends on US1's address input existing (T025), since it extends that component

### Critical path

```
T005 (CSP) ──▶ T007 (egress rewrite) ──▶ everything
T009 (types) ──▶ T010–T021 (pure layer) ──▶ T024 (state) ──▶ T026/T027 (loaders) ──▶ US1
T048 (link codec) ──▶ T050 (reflection) ──▶ T051 (restore) ──▶ US4
```

### Within each user story

- Pure modules before the state that calls them
- State before the components that read it
- Implementation before its integration test, except where the test defines the contract being met

### Parallel Opportunities

- T004 runs alongside T002/T003
- **T010–T019 are the big parallel block**: five pure modules and their five unit-test files, all different files, all independent once T009 lands
- Within US1: T030 and T031 in parallel
- Within US3: T043, T044, T046, T047 in parallel — different assertions, same spec file, so coordinate or split
- Within US4: T048 and T049 in parallel; then T056, T058, T059, T060 in parallel
- Once Foundational completes, US1 through US4 can proceed in parallel with enough hands; US5 waits on T025

---

## Parallel Example: Phase 2 pure layer

```bash
# After T009 (types) lands, launch the pure modules together:
Task: "Implement normalizeAddress in src/lib/sources/normalize.ts"
Task: "Implement isStreamingHost in src/lib/sources/hosts.ts"
Task: "Implement classifyFetchFailure/classifyMediaError in src/lib/sources/classify.ts"
Task: "Implement messageFor in src/lib/sources/messages.ts"

# And their tests, each against a different file:
Task: "Unit-test normalizeAddress in tests/unit/normalize.test.ts"
Task: "Unit-test isStreamingHost in tests/unit/hosts.test.ts"
Task: "Unit-test classification in tests/unit/classify.test.ts"
Task: "Unit-test messageFor in tests/unit/messages.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1: Setup
2. Phase 2: Foundational — **do not shortcut T007**; the egress rewrite is what keeps Principle II falsifiable, and the widening passes the current assertion silently
3. Phase 3: User Story 1
4. **STOP and VALIDATE**: paste two addresses, sing
5. Ship if ready — a person with two working addresses has the whole point of the feature

### Incremental Delivery

1. Setup + Foundational → the policy permits retrieval and the pure layer is proven
2. US1 → paste two addresses and sing → **MVP**
3. US2 → mix a local file with an address
4. US3 → failures become legible and non-destructive
5. US4 → pairings become shareable
6. US5 → paste-and-go comfort

### Highest-risk tasks, called out

- **T007** — the egress rewrite. The existing assertion is a prefix match that still passes against the widened policy; leaving it converts a guarantee into a preference with nothing to signal it
- **T041** — video source reinstatement. The naive assignment reads as correct and quietly fails SC-104
- **T026** — the token re-check after *every* await, not just the first. `retrieveText` resolving and the subsequent parse are two separate suspension points
- **T057** — the Constitution II test. If the payload reaches a server, the feature does not ship

---

## Requirement traceability

Every requirement maps to at least one task. Where a requirement is satisfied by a contract the task implements rather than named in the task text, the task is still listed here — this table is the authority on coverage.

| Req | Tasks |
|---|---|
| FR-101 video by address | T027, T028, T030 |
| FR-102 lyrics by address | T026, T028, T030 |
| FR-103 any combination, any order | T033, T035 |
| FR-104 identical once loaded | T031 (SC-102 assertion), T038 (message-layer branch only) |
| FR-105 validate before requesting | T014, T015, T043 |
| FR-106 normalize copied artifacts | T010, T011 |
| FR-107 per-slot progress | T029 |
| FR-108 abandon in-flight | T024, T026, T032 |
| FR-109 bounded no-progress | T020, T021, T040 |
| FR-110 distinct categories | T016–T019, T044 |
| FR-111 no untrusted text in messages | T019, T046 |
| FR-112 failure destroys nothing | T023, T041, T045 |
| FR-113 judge by content, not extension | T044 (`/html/` route), T026 |
| FR-114 streaming pages explained | T012, T013, T043 |
| FR-115 show current origin | T034 |
| FR-116 paste/drop + override | T061, T062, T063 |
| FR-117 contact only what was supplied | T065 |
| FR-118 minimal disclosure | T020, T021 |
| FR-119 no credentials | T020, T021 |
| FR-120 mid-playback interruption | T040, T045 |
| FR-121 offline unbroken | T064 |
| FR-122 reflect addresses in the link | T050 |
| FR-123 restore from a link | T051, T056 |
| FR-124 link reaches no server | T048, T057 |
| FR-125 offset travels, prefs do not | T048, T049, T050, T056 |
| FR-126 no file names in the link | T048, T049 |
| FR-127 partial links declared | T053, T060 |
| FR-128 announce before contacting | T052 |
| FR-129 link addresses are untrusted | T051, T059 |
| FR-130 ignore unrecognized parts | T048, T059 |
| FR-131 no reload, no history churn | T050, T058 |
| FR-132 explicit copy action | T053 |
| SC-101 two addresses to playback | T025–T030 |
| SC-102 identical to a local pair | T031 |
| SC-103 every failure distinct | T044 |
| SC-104 previous content survives | T045 |
| SC-105 which source failed, and why | T019, T044 |
| SC-106 bounded, stated give-up | T020, T021, T040 |
| SC-107 newest request wins | T026, T032 |
| SC-108 zero unrequested destinations | T065 |
| SC-109 offline files unchanged | T064 |
| SC-110 link round-trips | T049, T056 |
| SC-111 nothing reaches a server | T057 |
| SC-112 address bar behaves | T058 |
| SC-113 incomplete links declared | T053, T060 |

---

## Notes

- `[P]` tasks touch different files and have no dependency on incomplete work
- `[Story]` labels map tasks to spec.md user stories for traceability
- Contracts under `specs/002-url-media-sources/contracts/` are the authority on module behaviour; where code and contract disagree, one is a bug and the disagreement must be resolved rather than tolerated (Constitution § Development Workflow)
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently
