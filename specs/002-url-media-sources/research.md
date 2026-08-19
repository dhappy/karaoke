# Phase 0 Research: URL Media Sources

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-08-18

Eleven decisions. Each closes a Technical Context unknown or an approach fork that materially changes the design. No `NEEDS CLARIFICATION` markers remain after this document.

Two of these — D1 and D2 — are the ones that decide whether this feature complies with Constitution II. They are first for that reason.

---

## D1. Carry the shareable link in the URL fragment, never the query string

**Decision**: The shareable link encodes its payload in `location.hash` — `#v=<address>&l=<address>&o=<seconds>` — and never in the query string or the path.

**Rationale**:

- **A query string would transmit the person's content choice to our own server, which Constitution II prohibits.** Principle II forbids transmitting "their content, their filenames, or their usage anywhere they did not name". The site is served from `sing.gaian.church` via GitHub Pages. If the pairing rode in `?v=…&l=…`, then every time anyone opened a shared link, that address would travel in the HTTP request line to GitHub's servers and land in their access logs — a record of exactly what that person was about to sing, sent to a host the person never named. The fragment is the one part of a URL that the browser keeps to itself: it is not placed in the request line, not sent on redirects, and not included in the `Referer` header. FR-124 is therefore satisfiable only by the fragment.
- **It is also the only option that survives static hosting.** GitHub Pages serves files, not routes. A path-based link (`/watch/<address>`) would 404 without a redirect shim, and the shim would see the address.
- **Fragments are exempt from the URL-length pressure that matters here.** Servers impose request-line limits (commonly ~8KB); fragments never reach a server, so the only ceiling is the browser's own address limit, which is far above two media addresses.

**Consequences that the design must carry**:

- `history.replaceState` writing a fragment does **not** fire `hashchange`, so reflecting our own state cannot re-trigger our own loader. This is convenient rather than accidental, and D10 relies on it.
- A person editing the fragment by hand, or using back/forward across two of our own links, *does* fire `hashchange`. The loader listens for it so that navigation behaves.

**Alternatives considered**:

- *Query string* — rejected above. Directly violates Principle II.
- *Path segments with a 404-redirect shim* — rejected. Same disclosure as the query string, plus a GitHub-Pages-specific hack in the deploy.
- *Base64 or compression of the payload* — rejected for now. It obscures rather than protects (the fragment never travels anyway), and it makes a hand-editable link unreadable. Percent-encoding via `URLSearchParams` is enough. Revisit only if address length becomes a real complaint.

---

## D2. Widen exactly two CSP directives, and only in the shipped artifact

**Decision**: The production Content-Security-Policy gains `https:` on `media-src` and `connect-src`, and nothing else. Every other directive stays as it is; `frame-src 'none'` and `worker-src 'none'` are added explicitly rather than left to `default-src`. Local development and the integration tests get `http://localhost:*` on those same two directives through a Vite `transformIndexHtml` hook, so the relaxation never reaches `dist/`.

Shipped policy after this feature:

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' blob: data:; media-src 'self' blob: data: mediastream: https:;
connect-src 'self' blob: data: https:; font-src 'self'; object-src 'none';
frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'
```

**Rationale**:

- **The current policy blocks this feature outright.** `media-src 'self' blob: data: mediastream:` and `connect-src 'self' blob: data:` permit no third-party origin at all. Nothing in this feature works until they widen; this is the single change without which the rest is dead code.
- **Two directives is the whole widening, and it is inbound only.** `media-src` lets the video element play from an address the person named; `connect-src` lets us read a lyric file from one. Neither permits sending anything. `script-src` and `style-src` stay at `'self'`, so no fetched content can ever execute. `form-action 'none'` and `base-uri 'none'` already prevent outbound navigation. The capability being added is "retrieve these two kinds of file", not "talk to the internet".
- **`https:` only, in production.** An `http:` address from a secure page is blocked by the browser's mixed-content rules regardless of what CSP says, so adding `http:` to the shipped policy would buy no working case while widening the stated posture. The spec's mixed-content edge case is handled by detecting the scheme ourselves and explaining it (D4), not by permitting it.
- **Dev needs `http:` and production must not pay for it.** Playwright drives `pnpm dev` over `http://localhost:5173`, and the fixture server for remote-source tests is another localhost port — a different origin, so `'self'` does not cover it. Injecting `http://localhost:*` at dev time keeps the tests honest without loosening the artifact. `tests/unit/egress.test.ts` scans `dist/`, so it verifies the strict policy, which is the one that ships.

**Consequences for the egress test — verified, and worse than it looks.** The existing assertion is `expect(html).toMatch(/connect-src\s+'self'/)`. It is a *prefix* match, so it still passes against `connect-src 'self' blob: data: https:`. This was checked rather than assumed:

```
$ printf "connect-src 'self' blob: data: https:\n" | grep -qE "connect-src[[:space:]]+'self'" && echo MATCHES
MATCHES
```

So the widening does **not** trip the guard. The test stays green while the property it exists to protect quietly changes — the worst of the three possible outcomes, because nothing draws attention to it. A failing assertion would at least force someone to look.

The assertion must therefore be rewritten to pin the **whole directive value**, not a prefix: extract each directive up to its `;` and compare its token set exactly. `media-src` and `connect-src` may carry `https:` and nothing further; `script-src`, `style-src`, `object-src`, `frame-src`, `base-uri`, and `form-action` must remain exactly as they are. A prefix-matching test on a policy that grows by appending tokens is not a guard at all, and this is the mechanism the project relies on to keep Principle II falsifiable.

**Alternatives considered**:

- *Ship `http:` as well* — rejected. Buys nothing on a secure page, and weakens what the policy claims.
- *A single permissive `default-src https:`* — rejected outright. It would silently permit third-party scripts and styles, which is the exact hole the policy exists to close.
- *HTTP headers instead of the meta tag* — not available. GitHub Pages does not let us set response headers; the meta tag is the only mechanism this deployment has.
- *An origin allowlist* — rejected. The spec's Assumptions settle this: the product does not curate destinations, because the person typing the address is the authority. An allowlist would also be unmaintainable and would break the home-NAS case the primary story names.

---

## D3. Fetch the lyric file ourselves; let the video element fetch its own source

**Decision**: Lyrics are retrieved with `fetch()` and handed to the existing `parseWebVTT` as a string. The video is loaded by assigning the address straight to `<video src>`, exactly as an object URL is today. We never probe the video address with `fetch` first, and we never set the `crossorigin` attribute on the video element.

**Rationale**:

- **The two have genuinely different reachability rules, and this asymmetry is a feature.** A media element may load cross-origin *without* any CORS involvement — that is why `<img>` and `<video>` from other sites work everywhere. `fetch()` may not: reading a response cross-origin requires the host to send `Access-Control-Allow-Origin`. So a video address will usually just work, while a lyric address only works if its host permits cross-origin reads. The spec anticipates precisely this in its "cross-origin refusal on lyrics but not video" edge case, and the design must let each source report its own outcome rather than assuming they fail together.
- **Setting `crossorigin` would break working videos.** Adding the attribute *opts into* CORS, converting videos that play fine today into failures unless their host sends the header. We gain nothing from it — reading pixels into a canvas is not something this product does.
- **Probing the video address would manufacture false failures.** A `fetch`/HEAD probe to classify video errors more precisely would itself be subject to CORS, so it would report "refused" for a great many videos that then play perfectly. A diagnostic that is wrong more often than the thing it diagnoses is worse than none. Video failures are classified from `MediaError` instead (D4).
- **Lyrics must load independently of the video** (FR-103, and FR-022 from feature 001). A string-in, string-out fetch keeps that independence; routing lyrics through a media element would not.

**Alternatives considered**:

- *`XMLHttpRequest`* — rejected. No `AbortController` integration, no `referrerPolicy`, more code for less control.
- *Fetch the video as a blob, then play the blob* — rejected. It forces a full download before playback (breaking the spec's progressive-retrieval assumption), imposes CORS on videos that do not need it, and holds an entire film in memory.

---

## D4. Classify failures from what the platform will actually tell us

**Decision**: A closed `FailureCategory` union, assigned by a pure classifier. Categories are decided from information we genuinely have; where the platform is deliberately opaque, one category names both possibilities honestly rather than guessing.

| Category | How it is detected | Detected before any request? |
|---|---|---|
| `unusable-address` | `new URL(...)` throws, or scheme is not `http`/`https` | yes |
| `insecure-address` | page is `https:`, address is `http:` | yes |
| `streaming-page` | host matches the recognized-service list (D6) | yes |
| `refused-or-unreachable` | `fetch` rejects with `TypeError` | no |
| `not-found` / `forbidden` / `server-error` | `response.ok === false`, from `response.status` | no |
| `timed-out` | our own `AbortController` fired on the deadline (D8) | no |
| `unreadable-lyrics` | response arrived, `parseWebVTT` returned `ok: false` | no |
| `unplayable-video` | `MediaError` `SRC_NOT_SUPPORTED` or `DECODE` | no |
| `interrupted` | `MediaError.NETWORK`, or stall after playback began | no |

**Rationale**:

- **The browser will not tell us whether a cross-origin fetch was refused or the host was simply unreachable.** Both surface as a bare `TypeError` with no detail — deliberately, since distinguishing them would itself leak information about networks the page cannot see. Inventing a confident "the host refused your request" from a `TypeError` would be a guess presented as a fact. So `refused-or-unreachable` names both, and its message offers the action that resolves either: *"The lyric file could not be read from that address. The site may not allow other sites to read its files, or it may be unreachable. Try downloading the file and choosing it here instead."* That is honest, and it is the one suggestion that works in both worlds. It satisfies FR-110 without pretending to a precision the platform denies us.
- **Three categories are catchable before we touch the network at all**, which is what FR-105 requires and what makes the mixed-content and streaming-page edge cases answerable at all — neither would produce a distinguishable error after the fact.
- **HTTP status codes are available and worth spending**, since `401`/`403` versus `404` is the difference between "you need permission" and "check the address", and those are different actions for the person.
- **Video keeps its existing `MediaError` mapping**, extended rather than replaced. `VideoStage.describe()` already turns the four `MediaError` codes into plain language; remote sources need those messages to be origin-aware ("the address may be wrong or the file may have moved" reads differently from "try choosing another file"), so `describe()` takes the origin kind as an argument.

**Alternatives considered**:

- *A single generic failure message* — rejected. FR-110 requires distinguishing categories, and SC-105 measures whether a person can tell which source failed and why.
- *Guessing CORS from a same-origin-check heuristic* — rejected. Cannot distinguish a refusing host from a dead one, and would be confidently wrong.
- *Surfacing `response.statusText` or body text* — prohibited. FR-111 and Constitution IV forbid rendering untrusted fetched content as a user-facing message.

---

## D5. Normalize the copied-address artifacts, and only those

**Decision**: A pure `normalizeAddress(raw: string): string` applied before validation. It trims surrounding whitespace, strips one layer of wrapping `<…>`, and strips trailing `.,;:!?` and an unbalanced trailing `)`. Nothing else — no scheme guessing, no autocorrect.

**Rationale**:

- **These three are artifacts of the transport, not of the address.** Chat clients and mail readers wrap bare URLs in angle brackets (a convention old enough to be in RFC 3986's appendix), and a URL pasted from the end of a sentence carries the sentence's punctuation. FR-106 exists because rejecting these makes the product look broken when the person did nothing wrong.
- **The unbalanced-paren rule is the one that needs care.** Wikipedia-style addresses legitimately end in `)`, so stripping it unconditionally would corrupt working addresses. Counting parens and stripping only an unmatched trailer handles "(see https://ex.com/a)" and leaves "https://en.wikipedia.org/wiki/Foo_(bar)" alone.
- **Scheme guessing is deliberately excluded.** Prepending `https://` to bare `example.com/x` is tempting and is the kind of helpfulness that silently sends a request somewhere unintended. FR-105 wants unusable text reported, not repaired into a guess.

**Alternatives considered**:

- *Strip all trailing punctuation* — rejected; corrupts legitimate paths.
- *A permissive URL-detection regex* — rejected. `new URL()` is the platform's own parser and the authority on what the browser will actually fetch (Principle V prefers it on those grounds).

---

## D6. Recognize streaming services by bare hostname, and store them without a scheme

**Decision**: A small first-party list of host suffixes — `youtube.com`, `youtu.be`, `vimeo.com`, `dailymotion.com`, `twitch.tv`, `soundcloud.com`, `spotify.com`, `tiktok.com`, `instagram.com`, `facebook.com` — matched against the parsed hostname. Entries are stored as bare hostnames, never as full URLs.

**Rationale**:

- **This is the single most likely wrong input.** People think of "the URL of a video" as the page they watch it on. Feature 001 already places streaming-service integration out of scope, so the product's job is to explain the distinction rather than fail generically (FR-114). The message names the actual fix: use a direct address to a media file.
- **Bare hostnames keep the egress test meaningful.** `tests/unit/egress.test.ts` fails the build on any absolute third-party URL in the bundle, matching `https?://[\w.-]+`. Writing the list as `https://youtube.com` would trip that guard — correctly, since the guard cannot tell an identifier from an endpoint. Storing `youtube.com` keeps the list as data and the guard intact. This constraint is why the decision is recorded rather than left to implementation taste.
- **Suffix matching, not equality**, so `www.youtube.com` and `m.youtube.com` are covered.
- **The list is a courtesy, not a gate.** A miss costs a less specific message, not a broken load; an address on the list that is nonetheless a direct media file is still worth a check of the path extension before refusing. The list never prevents a load the person insists on.

**Alternatives considered**:

- *No detection at all* — rejected by FR-114.
- *A large maintained list* — rejected. Ten hosts cover essentially all of the real cases; a hundred is a maintenance burden with no measurable gain.

---

## D7. One request token per slot, plus `AbortController`

**Decision**: Each source slot (video, lyrics) holds a monotonically increasing sequence number. Starting a load increments it, captures the value, and aborts the previous attempt's controller. Every asynchronous continuation re-checks its captured token against the current one and returns without committing if they differ.

**Rationale**:

- **FR-108 and SC-107 are a correctness requirement, not a nicety.** Without it, a slow first address that resolves after a fast second one overwrites newer content with older — the classic stale-response bug, and one that is invisible in manual testing precisely because it needs a race to appear.
- **`AbortController` alone is insufficient.** Aborting stops the network work but does not by itself protect against a continuation that was already scheduled. The token is what makes the commit step safe; the controller is what stops the wasted transfer. Both, not either.
- **It generalizes to the video slot**, where there is no `fetch` to abort: assigning a new `src` supersedes the old load, and the token still guards the `loadedmetadata` and `error` handlers that may fire late for the replaced source.

**Alternatives considered**:

- *A single global "loading" flag* — rejected. The two slots load independently (FR-103); one flag conflates them.
- *Ignoring the race* — rejected by SC-107, which is stated as a verifiable claim under rapid successive submissions.

---

## D8. State the bounds: 20 seconds for lyrics, 30 seconds of no progress for video

**Decision**: A lyric fetch is aborted 20 seconds after it starts. A video reports a stall when 30 seconds pass with no `progress` event and it has not buffered enough to play. Both surface as `timed-out` with a plain-language message.

**Rationale**:

- **SC-106 requires a bounded *and stated* time**, so the numbers belong in a document rather than only in the source.
- **The two need different rules because their sizes differ by orders of magnitude.** A lyric file is tens of kilobytes; if it has not arrived in 20 seconds, something is wrong. A video is legitimately hundreds of megabytes and may stream for an hour, so a total deadline would be absurd — the meaningful failure is *no progress*, which is what `progress`/`stalled` report.
- **This is also the FR-120 mechanism.** A video that stops arriving mid-song is the same no-progress condition observed after playback began, and it must leave already-parsed lyrics untouched.

**Alternatives considered**:

- *Rely on the browser's own network timeout* — rejected. It is unspecified, varies by browser, and can be minutes, which is exactly the indefinite-loading state SC-106 forbids.
- *A shorter deadline (5–10s)* — rejected as hostile to slow connections and to a home NAS waking a spun-down disk.

---

## D9. Pure logic in `src/lib/sources/`; retrieval takes `fetch` as a parameter

**Decision**: Address normalization, validation, failure classification, streaming-host recognition, and share-link encode/decode are pure modules in `src/lib/sources/`. The one function that performs I/O, `retrieveText`, also lives there but receives its `fetch` implementation as an injected parameter defaulting to `globalThis.fetch`. Slot orchestration — tokens, state transitions, committing results — lives in `src/state/`, next to the runes it updates.

**Rationale**:

- **Principle I's rationale is testability without a browser, and this arrangement delivers it.** Every module in `src/lib/sources/` imports no Svelte, touches no DOM, and references no media element. The classifier and the link codec are total functions over plain values, which is what makes the failure taxonomy and the round-trip guarantee (SC-110) provable in Vitest rather than through a browser harness.
- **`retrieveText` deserves an explicit ruling rather than a quiet placement.** It performs I/O, which no other `src/lib/` module does. It is placed there because it satisfies the letter of the principle (no Svelte, no DOM, no `HTMLMediaElement`) *and* its purpose: injecting `fetch` makes every branch — abort, timeout, non-`ok` status, `TypeError` — reachable from a node test with a stub, no network and no browser required. The principle's media-element limit is untouched: `clock.ts` remains the only module in `src/lib/` that references a live `HTMLMediaElement`, and this feature adds no second one.
- **The video path adds no `src/lib/` module at all.** It is the existing impure edge: `VideoStage.svelte` already owns the element and its error surface, which Constitution v1.0.1 explicitly carves out for `src/components/`.

**Alternatives considered**:

- *Put `retrieveText` in `src/state/`* — a defensible alternative, rejected because it would drag the classifier along with it or split one concern across two layers, and because the state layer is where runes live rather than where logic is proved.
- *A new top-level `src/net/`* — rejected. A directory holding one function, introduced to dodge a question this decision answers directly.

---

## D10. Reflect sources with `history.replaceState`

**Decision**: Whenever a slot commits an address-backed source or the offset settles, the fragment is rewritten with `history.replaceState`. Never `pushState`. An incoming `hashchange` (back/forward, or a hand-edited fragment) is treated as a fresh link to load.

**Rationale**:

- **`replaceState` is what FR-131 describes.** It updates the address without a navigation: no reload, no interruption to a playing video, no history entry. `pushState` would fill the back stack with an entry per source change, so pressing back after loading two sources would step backwards through the session instead of leaving the app — the behaviour scenario 3 of User Story 4 rules out, and what SC-112 measures.
- **It does not fire `hashchange`**, so our own writes cannot re-enter the loader. Only genuine navigation does, which is exactly when re-reading the link is correct.
- **The offset is debounced before it is written.** Dragging an offset slider changes it continuously; rewriting the fragment on every input event is pointless churn. It settles first, then the link updates.

**Alternatives considered**:

- *`location.hash = …`* — rejected. It fires `hashchange`, creating a self-trigger loop that then needs a suppression flag.
- *`pushState`* — rejected above.
- *Only writing the link when the copy action is pressed* — rejected. The address bar is then wrong for anyone who bookmarks directly, which is half of what the person asked for.

---

## D11. Test remote sources against a second local origin

**Decision**: Integration tests serve fixture files from a second HTTP origin — a small static server on a different localhost port, started by the Playwright config alongside `pnpm dev`. CORS-refusal, 404, timeout, and redirect cases are produced by that server. Unit tests cover normalization, classification, and link round-tripping with no network at all.

**Rationale**:

- **A different port is a different origin**, which is what makes these tests real: `'self'` does not cover it, so the CSP widening (D2) and the CORS asymmetry (D3) are genuinely exercised rather than assumed.
- **The failure taxonomy needs a server that misbehaves on demand.** Withholding `Access-Control-Allow-Origin`, returning 404/403, and hanging past the deadline are all trivial to arrange in a fixture server and impossible to arrange against a real host reliably.
- **The bulk of the logic needs no browser.** Normalization rules, the classifier's mapping, and link encode/decode are pure, so they belong in Vitest where they run in milliseconds — the Principle I payoff again.
- **No test may reach the public internet.** A suite that fetched a real remote URL would be flaky, would be a form of egress, and would fail offline. The fixture origin is the only remote in the tests.

**Alternatives considered**:

- *Playwright `page.route()` interception* — rejected as the primary mechanism. It intercepts before the browser applies CORS and CSP, so it would test our code while stubbing out the two platform behaviours this feature is most exposed to. Acceptable for narrow cases; not the foundation.
- *Reaching a real public URL* — rejected. Flaky, offline-hostile, and contrary to the project's own posture.

---

## Resolved Technical Context

| Unknown | Resolution |
|---|---|
| Link transport | Fragment, never query string (D1) |
| Content policy | `https:` on `media-src` + `connect-src` only; dev-only localhost via Vite hook (D2) |
| Lyric retrieval | `fetch` with injected implementation (D3, D9) |
| Video retrieval | Direct `src` assignment; no probe, no `crossorigin` (D3) |
| Failure taxonomy | Nine categories, three pre-network; `TypeError` names both possibilities (D4) |
| Address cleanup | Trim, unwrap `<>`, strip trailing punctuation and unbalanced `)` (D5) |
| Streaming detection | Ten bare host suffixes (D6) |
| Cancellation | Per-slot token + `AbortController` (D7) |
| Timeout bounds | 20s lyrics; 30s no-progress video (D8) |
| Module placement | `src/lib/sources/` pure + injected I/O; orchestration in `src/state/` (D9) |
| History behaviour | `replaceState`, listen for `hashchange` (D10) |
| Test strategy | Second local origin for integration; Vitest for pure logic (D11) |

No runtime dependency is added by this feature. `URL`, `URLSearchParams`, `fetch`, `AbortController`, and `history` are all platform built-ins, which is what Principle V asks for before anything is written by hand.
