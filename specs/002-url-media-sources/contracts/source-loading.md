# Contract: Source Loading

**Feature**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md) | **Data model**: [../data-model.md](../data-model.md)

Modules under `src/lib/sources/`. Per Constitution ("Contracts under `specs/*/contracts/` are the authority on module behaviour"), where this document and the code disagree, one of them is a bug and the disagreement must be resolved rather than tolerated.

Every function here is **total**: no input, including hostile or malformed input, may throw. This is the same rule feature 001 imposed on the parser, extended to a second untrusted entry point.

---

## `normalize.ts`

### `normalizeAddress(raw: string): string`

Strips the artifacts of a copied address (FR-106). Pure, total, idempotent.

All four steps run in a **loop until the string stops changing**, which is what makes the function idempotent:

1. Trim leading and trailing whitespace (including newlines, which survive multi-line pastes).
2. Strip wrapping angle brackets: `<https://x/y>` → `https://x/y`.
3. Strip trailing `.`, `,`, `;`, `:`, `!`, `?`.
4. Strip a trailing `)` **only if** the string contains more `)` than `(`.

> **Why a loop, and not one pass each.** Given `<https://x/y.vtt>.` the trailing `.` means the string does not end in `>`, so a one-shot bracket strip is skipped; step 3 then removes the `.`, leaving `<https://x/y.vtt>` — which a *second* call would strip further. That is a function whose result depends on how many times you call it. This was caught by the idempotence test rather than by review, and the loop is the fix.

| Input | Output | Why |
|---|---|---|
| `"  https://x/y.vtt  "` | `https://x/y.vtt` | whitespace |
| `"<https://x/y.vtt>"` | `https://x/y.vtt` | mail/chat wrapping |
| `"https://x/y.vtt."` | `https://x/y.vtt` | end of sentence |
| `"https://x/y)"` | `https://x/y` | copied out of "(see https://x/y)" — unbalanced `)` is not part of the address |
| `"https://en.wikipedia.org/wiki/Foo_(bar)"` | unchanged | parens balanced — D5's load-bearing case |
| `""` | `""` | total |

**MUST NOT**: guess a scheme, lowercase the path, re-encode, resolve relative addresses, or alter the query or fragment of the address being loaded.

### `validateAddress(normalized: string, pageProtocol: string): ValidateResult`

> `pageProtocol` is a **parameter**, not a read of `location.protocol`. Constitution I forbids navigation globals in `src/lib/`, and `eslint.config.js` now enforces `location`/`history` alongside `document`/`window`. Passing it in is also what makes the mixed-content branch testable in node. The caller (`SourcesState`) supplies it.

```ts
type ValidateResult =
  | { ok: true; url: URL }
  | { ok: false; failure: 'unusable-address' | 'insecure-address' | 'streaming-page' };
```

Order matters — the first failing check wins:

1. `new URL(normalized)` throws, or `protocol` is neither `http:` nor `https:` → `unusable-address`. (`file:`, `javascript:`, `data:`, and `blob:` all land here; a person-typed `data:` address is not a use case this feature serves, and `javascript:` must never reach a load path.)
2. Page is `https:` and address is `http:` → `insecure-address`. Detected here rather than after a failed request, because the browser's mixed-content block is not distinguishable after the fact (D4).
3. Host matches a recognized streaming suffix **and** the path does not end in a known media or subtitle extension → `streaming-page`.
4. Otherwise `{ ok: true, url }`.

**No network request is made by this function**, which is what FR-105 requires.

---

## `hosts.ts`

### `isStreamingHost(hostname: string): boolean`

Suffix match against the list in D6. `www.youtube.com` and `m.youtube.com` match `youtube.com`; `notyoutube.com` does not (the match is on a dot-boundary suffix, not a substring).

**MUST**: store entries as bare hostnames — `'youtube.com'`, never `'https://youtube.com'`. `tests/unit/egress.test.ts` fails the build on any absolute third-party URL in the bundle, and it cannot distinguish an identifier from an endpoint. This is a hard constraint on the source, not a style preference (D6).

---

## `classify.ts`

### `classifyFetchFailure(e: unknown, response: Response | null, abortedByDeadline: boolean): FailureCategory`

Pure. Maps what the platform gave us onto the closed category set.

| Condition | Category |
|---|---|
| `abortedByDeadline` | `timed-out` |
| `e` is an `AbortError` and not our deadline | *(caller abandons; no category)* |
| `e instanceof TypeError` | `refused-or-unreachable` |
| `response.status` 401, 403 | `forbidden` |
| `response.status` 404, 410 | `not-found` |
| `response.status` >= 500 | `server-error` |
| any other non-`ok` status | `server-error` |

### `classifyMediaError(code: number | undefined, hasPlayed: boolean): FailureCategory`

| `MediaError` code | `hasPlayed` | Category |
|---|---|---|
| `MEDIA_ERR_NETWORK` | either | `interrupted` |
| `MEDIA_ERR_DECODE` | either | `unplayable-video` |
| `MEDIA_ERR_SRC_NOT_SUPPORTED` | either | `unplayable-video` |
| `MEDIA_ERR_ABORTED` | either | *(caller abandons; no category)* |
| absent / unknown | `false` | `unplayable-video` |
| absent / unknown | `true` | `interrupted` |

`hasPlayed` distinguishes "this never worked" from "this stopped working", which FR-120 requires and which changes what the person is told to do.

### `messageFor(category: FailureCategory, slot: SourceSlot): string`

Pure, total, and the **only** path from a failure to user-facing text.

**Guarantees** (each is a test, not a convention):

1. The returned string contains no response body, status text, header, exception message, or stack — FR-111, Constitution IV.
2. It names what went wrong **and** a next step — Constitution IV, FR-110.
3. It is phrased for the given slot: a person must be able to tell *which* source failed from the message alone (SC-105).
4. It never contains the address itself. The address is shown separately as data (FR-115); interpolating attacker-supplied text into a message is the injection this rule exists to prevent.

Representative mappings (exact wording is the implementation's, these fix the content):

| Category | Names | Next step |
|---|---|---|
| `unusable-address` | that is not a web address | check it and paste again |
| `insecure-address` | the address is not secure, so the browser will not load it | ask for an `https` address, or download the file |
| `streaming-page` | that is a page on a video site, not a video file | use a direct address to a media file |
| `refused-or-unreachable` | the site may not allow other sites to read its files, **or** it may be unreachable | download the file and choose it here |
| `not-found` | nothing is at that address | check the address |
| `forbidden` | the address needs permission we do not have | download the file and choose it here |
| `server-error` | the site had a problem | try again later |
| `timed-out` | it took too long and was given up on | check the connection and try again |
| `unreadable-lyrics` | it arrived but is not readable as lyrics | check it is a WebVTT file |
| `unplayable-video` | this browser cannot play that video | try an MP4 or WebM |
| `interrupted` | the video stopped arriving partway through | check the connection; lyrics are still loaded |

`refused-or-unreachable` deliberately names **both** possibilities. The browser will not tell us which it was, and stating one as fact would be a guess presented as a diagnosis (D4).

---

## `retrieve.ts`

### `retrieveText(url: URL, opts: RetrieveOptions): Promise<RetrieveResult>`

```ts
interface RetrieveOptions {
  signal: AbortSignal;
  /** Milliseconds. Default 20_000 (D8). */
  deadlineMs?: number;
  /** Injected for testability; defaults to globalThis.fetch (D9). */
  fetchImpl?: typeof fetch;
}

type RetrieveResult =
  | { ok: true; text: string }
  | { ok: false; failure: FailureCategory }
  | { ok: false; abandoned: true };
```

**Request shape — each property is a requirement, not a default**:

| Setting | Value | Why |
|---|---|---|
| `credentials` | `'omit'` | FR-119 — never send cookies or auth |
| `referrerPolicy` | `'no-referrer'` | FR-118 — the host learns nothing about us or the other source |
| `redirect` | `'follow'` | spec edge case — redirects resolve without troubling the person |
| `mode` | `'cors'` | the only mode that yields a readable body cross-origin |
| `cache` | `'default'` | no override; the browser's own policy is correct here |
| `signal` | caller's, plus deadline | FR-108, FR-109 |

**MUST NOT** add headers beyond what the browser sends. No `User-Agent` override, no custom header identifying the application — a custom header also forces a CORS preflight, converting simple working requests into failures.

**Guarantees**:

1. Never throws. Every rejection is mapped to a `RetrieveResult`.
2. Resolves within `deadlineMs` of being called, or with `timed-out`.
3. Clears its deadline timer on every exit path.
4. Returns `{ abandoned: true }` — never a failure — when aborted by the caller rather than the deadline, so an abandoned attempt cannot paint an error for content the person already replaced.
5. Performs no I/O other than the single `fetch` to the given URL. It never contacts a second address (FR-117, SC-108).

---

## Orchestration contract (`src/state/sources.svelte.ts`)

Not a pure module; stated here because the invariants are testable and load-bearing.

### Loading a slot from an address

```
1. normalizeAddress(raw)
2. validateAddress(...)          ── on failure: report, STOP. No request made. (FR-105)
3. token = ++tokens[slot]        ── abort the previous attempt's controller (D7)
4. mark slot loading             ── FR-107
5. retrieve (lyrics) / assign src (video)
6. if token !== tokens[slot]: return without committing   ── FR-108, SC-107
7. commit on success, or report a category on failure     ── FR-112 on failure: commit NOTHING
8. rewrite the fragment via replaceState                  ── FR-122, D10
```

**Step 6 is the invariant most likely to regress.** It must be re-checked after *every* `await`, not only the first — a `retrieveText` resolution and a subsequent parse are two separate suspension points.

**Step 7's failure branch must not touch** loaded content, `origin`, `status`, playback position, `offset`, or preferences. For lyrics this is already guaranteed by `LyricsState.load`'s staging; for video it must be arranged explicitly, because assigning `<video src>` is itself destructive — the previous source is gone the moment the assignment happens.

> **Design note.** Replacing a *working* video with an address that then fails cannot be undone by staging alone, since the element has already dropped the old source. The previous `src`, object URL, origin, and duration are snapshotted before assignment and reinstated on failure. The naive assignment reads as correct and quietly fails SC-104.
>
> **Two consequences found in implementation**, both now required:
>
> 1. **The old object URL must not be revoked at assignment time.** A revoked blob cannot be reinstated, so release is deferred until the *new* source succeeds.
> 2. **The failure message must outlive the recovery.** Reinstating puts the previous video back, and that video then loads normally — calling `media.succeed()`, which clears `error`. Without holding the message across that success, the explanation for the failed replacement flashes and vanishes, leaving the person watching their old video reappear with no reason given. `SourcesState` carries it in `#pendingFailure` and re-applies it in `videoSucceeded()`.
>
> After a reinstatement the slot's status is **`ready`, not `failed`** — the surviving source genuinely is usable, which is what FR-112 asks for. The error is the report on the address that was tried, not a verdict on the video now playing.

### `setVideoDirect(href: string)`

A same-origin seam for the dev fixture and the integration tests, which pass a **root-relative** path (`/tests/fixtures/tiny.webm`).

It deliberately bypasses `validateAddress`, because that function rejects relative input and **should**: a person typing an address gives an absolute one, and accepting relative text in the address field would let a typo resolve silently against our own origin instead of being reported (FR-105). This seam is the application loading its own asset, not the person directing the browser somewhere — a real distinction, not a convenience.

### Announcing an incoming link

On `hashchange` or first load with a non-empty fragment: decode, populate `announcing` with the addresses about to be contacted, render them, *then* begin loading (FR-128). The addresses are rendered as text, never as markup and never as a clickable link (FR-129).
