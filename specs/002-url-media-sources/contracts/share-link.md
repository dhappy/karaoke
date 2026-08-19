# Contract: Share Link

**Feature**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md) | **Data model**: [../data-model.md](../data-model.md)

Module `src/lib/sources/link.ts`. Pure, total, and framework-free — it takes and returns strings and plain values, and touches neither `location` nor `history` (the caller does that, per D10).

---

## Transport

The payload lives in the **URL fragment** and nowhere else:

```
https://sing.gaian.church/#v=<encoded>&l=<encoded>&o=<seconds>
```

**This is a Constitution II requirement, not a formatting choice.** The fragment is the only part of a URL that browsers do not put in the request line and do not send in `Referer`. A query string would deliver the person's chosen addresses — a record of what they are about to sing — into the access logs of GitHub Pages, a host they never named. See [research.md](../research.md) D1.

**MUST NOT**: move any part of this payload into the query string, the path, a cookie, `localStorage`, or any request. FR-124, SC-111.

---

## Grammar

Fragment body is `URLSearchParams` syntax. Three recognized keys, all optional:

| Key | Meaning | Format | Absent means |
|---|---|---|---|
| `v` | video address | percent-encoded absolute `http`/`https` URL | no video in the link |
| `l` | lyrics address | percent-encoded absolute `http`/`https` URL | no lyrics in the link |
| `o` | timing offset | signed decimal seconds, e.g. `-0.4` | `0` |

Unrecognized keys are **ignored**, not an error (FR-130). This keeps old links working if keys are ever added.

---

## `encodeLink(link: ShareLink): string`

Returns the fragment body **without** a leading `#`.

**Guarantees**:

1. Omits `v` and/or `l` when null — a file-backed slot contributes nothing (FR-126).
2. Omits `o` when the offset is `0`, so the common link stays short and readable.
3. Percent-encodes via `URLSearchParams`, so an address containing `&`, `#`, or spaces round-trips intact.
4. Emits keys in the order `v`, `l`, `o` — stable output, so an unchanged pairing does not produce a churning address bar.
5. Returns `''` for an empty link. The caller clears the fragment rather than writing `#`.
6. Never includes a file name, playback position, or any display preference (FR-125, FR-126).

## `decodeLink(fragment: string, pageProtocol: string): ShareLink`

Accepts the fragment with or without a leading `#`. `pageProtocol` is threaded to `validateAddress` (see [source-loading.md](./source-loading.md)) so a link cannot smuggle in a scheme the app would refuse from a text field.

**Guarantees**:

1. **Total.** Any input — empty, truncated, binary garbage, hostile — yields a valid `ShareLink`. Never throws. This is the parser-totality rule of Constitution IV applied to the second untrusted entry point.
2. A `v` or `l` that fails `validateAddress` decodes to `null` rather than failing the whole link — one bad half must not cost the good half (FR-130).
3. `o` that is absent, non-numeric, or non-finite decodes to `0`.
4. `o` is clamped to a sane range (±600s). A link claiming a ten-minute offset is a mistake or a joke, and an unclamped value would push every cue outside the media and blank the overlay.
5. Repeated keys: the **first** wins, deterministically.
6. Addresses decoded here are **untrusted input**, identical in standing to typed text, and re-enter `validateAddress` before any request (FR-129).

## Round-trip guarantee

```
decodeLink(encodeLink(x)) deeply equals x
```

for every `x` whose addresses are valid and whose offset is finite and within the clamp. This is **SC-110** and is a unit test, not an aspiration.

The reverse (`encode(decode(s)) === s`) does **not** hold and is not claimed: an incoming link may carry unrecognized keys, different key order, or a redundant `o=0`, all of which normalize away on re-encode. Normalizing is correct; asserting the reverse identity would forbid it.

---

## Completeness reporting

**The copy action itself is required** (FR-132): sharing must be something the person deliberately does, not something that happens to them — the address bar updates on its own, but nothing reaches a clipboard without an explicit press.

`linkCompleteness(link: ShareLink): 'complete' | 'partial' | 'empty'`

| `v` | `l` | Result | UI obligation |
|---|---|---|---|
| set | set | `complete` | copy silently |
| set | null | `partial` | copy, and say the lyrics are not included |
| null | set | `partial` | copy, and say the video is not included |
| null | null | `empty` | **refuse to copy**, and say there is nothing to share |

FR-127 and SC-113. The `empty` case is the two-local-files pairing, where offering a link that silently restores nothing would be worse than refusing.

---

## Length

`encodeLink` imposes no length limit; fragments never reach a server, so the only ceiling is the browser's own address limit (well above two ordinary addresses).

The caller checks the assembled absolute URL against a conservative threshold (**2000 characters**, the historically safe limit) and, when exceeded, tells the person the pairing plays but the link is too long to share — the spec's long-address edge case. **The pairing must keep working**; only shareability degrades. Silent truncation is prohibited: a truncated address is a different address, and following one would contact a host nobody chose.
