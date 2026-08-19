# Phase 1 Data Model: URL Media Sources

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

All times are **seconds**, matching `HTMLMediaElement.currentTime` and the convention feature 001 set. All types are immutable unless marked otherwise.

This feature adds no new reactive-state hot path. Constitution III is untouched: nothing here is read per frame, and the playhead does not appear in any entity below.

---

## Existing types this feature reuses unchanged

### `Origin` — already defined, already sufficient

```ts
// src/state/lyrics.svelte.ts — EXISTING, no change
export type Origin =
  | { kind: 'file'; name: string }
  | { kind: 'url'; href: string };
```

Feature 001 defined both variants but only ever constructed `'file'` from the UI (`devFixture` constructs `'url'`). This feature makes the `'url'` variant reachable through the interface. **No change to the type is required**, which is why it is listed here rather than under additions — the data model anticipated this feature.

`LoadStatus` (`'empty' | 'loading' | 'ready' | 'failed'`) is likewise reused as-is.

---

## New types

### `SourceSlot`

```ts
export type SourceSlot = 'video' | 'lyrics';
```

The two independently loadable positions (FR-103). Every attempt, token, and failure is scoped to one slot; nothing in this feature operates on "the pair" as a single loadable unit.

---

### `FailureCategory`

```ts
export type FailureCategory =
  // Decidable before any network request (FR-105)
  | 'unusable-address'      // not a URL, or scheme is not http/https
  | 'insecure-address'      // http address requested from an https page
  | 'streaming-page'        // host is a recognized streaming service (D6)
  // Decidable only from the attempt
  | 'refused-or-unreachable' // fetch TypeError — CORS refusal and network failure are indistinguishable (D4)
  | 'not-found'              // 404, 410
  | 'forbidden'              // 401, 403
  | 'server-error'           // 5xx and other non-ok statuses
  | 'timed-out'              // our deadline fired (D8)
  | 'unreadable-lyrics'      // arrived, but parseWebVTT returned ok: false
  | 'unplayable-video'       // MediaError SRC_NOT_SUPPORTED | DECODE
  | 'interrupted';           // MediaError NETWORK, or stall after playback began (FR-120)
```

**Closed set.** Adding a member is an interface change, not an implementation detail — the same rule `DiagnosticCode` carries in feature 001.

Each category maps to exactly one plain-language message and one suggested next step (FR-110). The mapping is a pure total function; see [contracts/source-loading.md](./contracts/source-loading.md).

**Invariant**: no message derived from a `FailureCategory` may contain any part of a fetched response — no status text, no body, no header. FR-111 and Constitution IV. The category is the *only* thing that crosses from the network into the message.

---

### `AddressLoadAttempt`

One attempt to fill one slot from one address. Mutable, short-lived, and never rendered directly.

```ts
export interface AddressLoadAttempt {
  readonly slot: SourceSlot;
  /** Monotonic per slot. Guards late commits (D7). */
  readonly token: number;
  /** Normalized and validated. Never the raw input. */
  readonly href: string;
  state: 'validating' | 'loading' | 'succeeded' | 'failed' | 'abandoned';
  /** Present only while state === 'loading'; null for the video slot, which has no fetch to abort. */
  controller: AbortController | null;
  /** Set exactly when state === 'failed'. */
  failure: FailureCategory | null;
}
```

**State transitions** — the only legal paths:

```
validating ──▶ failed                  (pre-network: unusable / insecure / streaming-page)
validating ──▶ loading ──▶ succeeded
                       ├─▶ failed      (network, status, timeout, or content)
                       └─▶ abandoned   (a newer attempt claimed the slot)
```

**Invariants**:

1. `abandoned` and `succeeded` are terminal; nothing may leave them.
2. An attempt may commit to state only if `token === currentToken[slot]`. This is the whole of SC-107, and the single most regression-prone line in the feature.
3. `failed` and `abandoned` MUST NOT mutate the slot's loaded content, origin, or status — Constitution IV, FR-112.
4. At most one attempt per slot is in `loading` at any time.

---

### `ShareLink`

The decoded contents of the application's own fragment. Purely a value; it holds no element, no promise, and no state.

```ts
export interface ShareLink {
  /** Address for the video slot, or null when absent or unusable. */
  readonly video: string | null;
  /** Address for the lyrics slot, or null when absent or unusable. */
  readonly lyrics: string | null;
  /** Signed seconds. Defaults to 0 when absent or unparseable. */
  readonly offset: number;
}
```

**Completeness** is derived, not stored:

| `video` | `lyrics` | Completeness | Copy action behaviour |
|---|---|---|---|
| set | set | `complete` | copies the link |
| set | null | `partial` | copies, and says which half is missing (FR-127) |
| null | set | `partial` | copies, and says which half is missing (FR-127) |
| null | null | `empty` | refuses, and says there is nothing to share (spec edge case) |

**Invariants**:

1. A slot loaded from a **file** contributes `null`. File names never appear in a link — FR-126, and they would not work for a recipient anyway.
2. `offset` is included (FR-125). Display preferences are **not** — they belong to the reader, not the pairing.
3. Playback position is **not** included. Out of scope, deliberately.
4. Decoding is **total**: any fragment, including hostile or truncated ones, yields a valid `ShareLink` rather than throwing. Unrecognized keys are ignored (FR-130). This mirrors the parser totality rule in Constitution IV.
5. An address decoded from a link is exactly as untrusted as a typed one and re-enters the same validation path (FR-129).

**Encoding** is `URLSearchParams` inside `location.hash`; keys `v`, `l`, `o`. See [contracts/share-link.md](./contracts/share-link.md) for the grammar and round-trip guarantee.

---

## Changes to existing reactive state

### `MediaState` (`src/state/media.svelte.ts`)

```ts
  // ADDED
  /** True while an address-backed load is in flight for this slot (FR-107). */
  loading = $state(false);
  /** Set when the current failure has a category; null for file-path failures. */
  failure = $state<FailureCategory | null>(null);
```

`status`, `origin`, `duration`, and `error` already exist and carry the rest. The existing `fail(message)` gains a sibling that records the category alongside the message.

> **Constitution III guard, restated.** The class comment in `media.svelte.ts` warns that `position = $state(0)` appearing in that file re-diffs the overlay sixty times a second. This feature adds two fields that change at human frequency (a load starts, a load fails) and must not be read on the frame path. `loading` and `failure` are read by chrome components only.

### `LyricsState` (`src/state/lyrics.svelte.ts`)

```ts
  // ADDED
  loading = $state(false);
  failure = $state<FailureCategory | null>(null);
```

`load(source, origin, mediaDuration?)` is unchanged — it already accepts a `'url'` origin and already stages the parse so a failure cannot destroy working lyrics. That staging is what makes FR-112 free for the lyrics slot.

### New: `SourcesState` (`src/state/sources.svelte.ts`)

Owns what belongs to neither existing class: the per-slot tokens, the in-flight attempts, and the link.

```ts
export class SourcesState {
  /** Monotonic per slot (D7). Not reactive — read in async continuations, never rendered. */
  private tokens: Record<SourceSlot, number>;
  private attempts: Record<SourceSlot, AddressLoadAttempt | null>;

  /** The addresses currently reflected in the fragment. */
  link = $state<ShareLink>({ video: null, lyrics: null, offset: 0 });

  /** Addresses an incoming link is about to contact, shown before contact (FR-128). */
  announcing = $state<readonly string[]>([]);
}
```

---

## Equivalence: origin must not survive the load (FR-104, SC-102)

Once a source is loaded, **nothing downstream may branch on where it came from**. This is the property that makes SC-102 — identical line selection, identical word onsets, identical behaviour after a seek — structural rather than something to be verified by comparison.

It holds by construction, and the construction is worth naming:

| Stage | What it consumes | Origin visible? |
|---|---|---|
| `parseWebVTT` | a `string` | no — it never sees an origin |
| `buildIndex` / `resolve` / `fill` | `LyricLine[]`, a position | no |
| `<video src>` | a URL string | no — an object URL and an `https:` URL are the same kind of value |
| `clock.ts` | an `HTMLMediaElement` | no |

`Origin` is recorded once, on the slot, for two purposes only: telling the person what is loaded (FR-115) and deciding what a link can carry (FR-126). It is **read by chrome components and the link encoder, and by nothing else**.

**Invariant**: no module in `src/lib/timing/` or `src/lib/vtt/` may import `Origin`, and no conditional anywhere may test `origin.kind` to decide parsing, timing, or rendering behaviour. A branch on origin in the render path is the regression that would make SC-102 false, and it would be invisible until someone compared a local and a remote load of the same file side by side.

The one deliberate exception is **error phrasing**: `VideoStage.describe()` takes the origin kind so that a remote failure can suggest checking the address rather than choosing another file (D4). That is a message-layer branch, not a behaviour branch, and it happens only on the failure path where no playback is occurring.

---

## Entity relationships

```
SourceSlot ─┬─▶ AddressLoadAttempt ──▶ FailureCategory ──▶ message + next step
            │        (0..1 in flight)      (on failure)
            │
            └─▶ Origin ──▶ ShareLink contribution
                 file → null
                 url  → the href

MediaState.offset ──▶ ShareLink.offset        (carried, FR-125)
Prefs.*           ──▶ (nothing)                (deliberately not carried, FR-125)
```

---

## Requirement coverage

| Entity / field | Requirements |
|---|---|
| `Origin` (`url` variant reachable) | FR-101, FR-102, FR-115 |
| `SourceSlot` | FR-103 |
| `AddressLoadAttempt.state` | FR-107 |
| `AddressLoadAttempt.token` | FR-108, SC-107 |
| `AddressLoadAttempt.controller` | FR-108, FR-109 |
| `FailureCategory` | FR-110, FR-113, FR-114, FR-120 |
| Message-mapping invariant | FR-111 |
| Transition invariant 3 | FR-112, SC-104 |
| `ShareLink` | FR-122, FR-123 |
| `ShareLink` fragment transport | FR-124, SC-111 |
| `ShareLink.offset` | FR-125 |
| `ShareLink` invariant 1 | FR-126 |
| Completeness table | FR-127, SC-113 |
| `SourcesState.announcing` | FR-128 |
| `ShareLink` invariants 4–5 | FR-129, FR-130 |
