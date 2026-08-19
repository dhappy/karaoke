# Quickstart: URL Media Sources

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Contracts**: [source-loading](./contracts/source-loading.md), [share-link](./contracts/share-link.md)

How to run this feature and prove it works. Every scenario below maps to a numbered requirement or success criterion, so a failure here is traceable to something the spec promised.

---

## Prerequisites

```bash
pnpm install
```

Playwright needs a browser. On a machine without root, this repo already carries the workaround — `scripts/fetch-browser-libs.sh` extracts Chromium's shared libraries into a local prefix and records the path in `.env.test`, which `playwright.config.ts` prepends to `LD_LIBRARY_PATH`. Re-run it if the scratch directory has been cleared.

---

## Run

```bash
pnpm dev          # http://localhost:5173
pnpm test         # Vitest — pure logic, no browser
pnpm test:e2e     # Playwright — integration, needs the fixture origin
pnpm check        # svelte-check + tsc
pnpm lint
pnpm build        # required before the egress suite is meaningful
```

The `pnpm build` step matters: `tests/unit/egress.test.ts` scans `dist/` and **skips with an explicit message** rather than passing vacuously when the build is absent. A green run that never built proves nothing about the shipped policy.

---

## The fixture origin

Remote-source tests need a **second origin** — a different port is sufficient, and it is what makes CORS and CSP behave as they do in production (D11). Playwright starts it alongside `pnpm dev`; it serves from `tests/fixtures/` and offers deliberately misbehaving routes:

| Route | Behaviour | Exercises |
|---|---|---|
| `/ok/*` | serves the file with `Access-Control-Allow-Origin: *` | happy path |
| `/no-cors/*` | serves the file with **no** CORS header | `refused-or-unreachable` on lyrics; video still plays |
| `/404/*` | 404 | `not-found` |
| `/403/*` | 403 | `forbidden` |
| `/slow/*` | holds the connection open past the 20s deadline (then 25s) | `timed-out` |
| `/delay/*` | answers normally after 1.5s | observing a loading state; losing a race |
| `/redirect/*` | 302 to `/ok/*` | redirect edge case |
| `/html/*` | 200 with an HTML error page | `unreadable-lyrics` |

**No test may reach the public internet.** A suite that did would be flaky, offline-hostile, and a form of the egress this product exists to avoid.

> **Why `/slow/` is held to 25s and used exactly once.** A browser allows only ~6 concurrent connections per origin, so every socket parked on `/slow/` is one the rest of the suite cannot use. At 60s, parallel workers queued their *video* loads behind these and failed with "still loading" — a test-infrastructure failure that is indistinguishable from a product bug until you look. Anything that merely needs to be slow uses `/delay/`.
>
> Also note `reuseExistingServer` is on outside CI: after changing `server.ts`, kill the running fixture process or the suite will silently test the old one. A stale server returning 404 for a new route produces failures that look like application defects.

---

## Scenario 1 — a pair from two addresses (US1, FR-101/102, SC-101)

1. `pnpm dev`, open the app.
2. Paste the fixture origin's `/ok/tiny.webm` as the video.
3. Paste `/ok/word-timed.vtt` as the lyrics.
4. Press play.

**Expect**: both load, the overlay shows the active line, and words fill progressively — identical to choosing the same two files locally.

**Also check**: the address bar has grown a fragment, `#v=…&l=…`.

---

## Scenario 2 — a mixed pair (US2, FR-103)

Choose `tests/fixtures/tiny.webm` from disk, then paste `/ok/word-timed.vtt`.

**Expect**: lyrics pair with the already-loaded video, the video does not reload, and playback position survives.

Reverse the two and repeat. Then confirm the link is reported as **partial** — the local file cannot be shared (FR-127).

---

## Scenario 3 — every failure names itself (US3, FR-110, SC-103/104)

Load a working pair first, start playback, and *then* try each of these. The point is not only the message but that the song keeps playing (FR-112).

| Input | Expect |
|---|---|
| `not a url` | rejected with no network request (FR-105) |
| `http://…` while page is https | named as insecure, not a generic failure |
| `https://www.youtube.com/watch?v=…` | told a direct media address is needed (FR-114) |
| `/no-cors/word-timed.vtt` | named as refused-or-unreachable, suggests downloading |
| `/404/word-timed.vtt` | nothing at that address |
| `/403/word-timed.vtt` | needs permission |
| `/slow/word-timed.vtt` | gives up within 20s (SC-106) |
| `/html/word-timed.vtt` | not readable as lyrics |

**After every one**: the previously loaded pair is still playing, at the same position, with the same offset. That is SC-104, and it is the assertion most worth writing first.

**Check the messages themselves**: no status codes, no exception text, no fetched content, and no address interpolated into the sentence (FR-111).

---

## Scenario 4 — the asymmetry is real (spec edge case, D3)

Load `/no-cors/tiny.webm` as the **video** and `/no-cors/word-timed.vtt` as the **lyrics**.

**Expect**: the video plays; the lyrics fail. A host may permit media playback while refusing to let another site read its files, and each slot must report its own outcome. If both fail together, the video path has wrongly acquired a CORS dependency — check that nothing sets `crossorigin` on the element.

---

## Scenario 5 — the link round-trips (US4, FR-122/123/125, SC-110)

1. Load a pair from two addresses.
2. Apply a timing offset of `-0.4`.
3. Copy the link; open it in a fresh window.

**Expect**: both sources load from the same addresses, the offset is already `-0.4`, and pressing play is the only remaining action.

**Then check** the offset did not come back as `0` — that regression is invisible unless the offset is deliberately non-zero, which is why step 2 is not optional.

---

## Scenario 6 — the link discloses nothing to a server (FR-124, SC-111) ⚠️

**The load-bearing privacy check.** With DevTools' Network panel open (preserve log on), open a shared link and reload.

**Expect**: the request for the page itself carries **no** part of the pairing — no `?v=`, nothing in the path, and no `Referer` disclosing it. The fragment must never appear in any request line.

If the payload has migrated to the query string, this feature violates Constitution II and must not ship. Automate it: assert against the built `index.html` and the encoder that no code path writes the payload anywhere but `location.hash`.

---

## Scenario 7 — the address bar behaves (FR-131, SC-112)

While a song plays, change sources several times.

**Expect**: playback never stops, the page never reloads, and pressing **back** leaves the application rather than stepping through every source tried. `replaceState`, never `pushState` (D10).

---

## Scenario 8 — the newest request wins (FR-108, SC-107)

Paste `/slow/word-timed.vtt`, then immediately paste `/ok/word-timed.vtt` for the same slot.

**Expect**: the fast one loads and *stays* loaded. When the slow one eventually resolves it must neither replace the content nor paint an error — it was abandoned, and an abandoned attempt is silent.

This is the bug that passes every manual test and fails under a race. Automate it.

---

## Scenario 9 — hostile and empty links (FR-129/130, edge cases)

Open the app with each fragment; none may throw, blank the screen, or execute anything:

```
#v=javascript:alert(1)
#l=%00%01%02
#v=&l=&o=NaN
#o=99999
#unknown=1&l=<fixture>/ok/word-timed.vtt
```

**Expect**: garbage decodes to nothing, the recognized half of the last one still loads, `o=NaN` becomes `0`, `o=99999` clamps, and `javascript:` is rejected by `validateAddress` before any load path sees it.

Also confirm the announced addresses (FR-128) render as **text**, not as a clickable link and not as markup.

---

## Scenario 10 — offline is unbroken (FR-121, SC-109)

```bash
pnpm build && pnpm preview
```

Disconnect the network. Load a local video and a local `.vtt` from disk.

**Expect**: everything works exactly as before this feature existed. Address support must be additive — if a file-backed path now waits on a network request, this fails.

---

## Unit-test checklist

Pure, fast, no browser — the Principle I payoff:

| Suite | Covers |
|---|---|
| `normalize.test.ts` | the D5 table, including the balanced-paren case; idempotence |
| `validate.test.ts` | scheme rejection, `javascript:`/`data:`, mixed content, streaming hosts, check order |
| `hosts.test.ts` | suffix matching; `notyoutube.com` does not match; **entries carry no scheme** |
| `classify.test.ts` | every `FailureCategory` reachable; `TypeError` → `refused-or-unreachable` |
| `messages.test.ts` | every category yields a message; none leaks response text; none embeds an address |
| `link.test.ts` | round-trip (SC-110), totality on garbage, clamping, key order, omissions |
| `retrieve.test.ts` | with a stubbed `fetch`: abort, deadline, non-ok statuses, `credentials`/`referrerPolicy` |
| `egress.test.ts` | **updated** — pins the widened CSP's exact shape (D2) |

---

## Definition of done

- [ ] `pnpm test`, `pnpm test:e2e`, `pnpm check`, `pnpm lint` all green
- [ ] `pnpm build` then `pnpm test` — egress suite runs rather than skipping, and passes
- [ ] Scenario 6 verified by hand at least once, and by an automated assertion thereafter
- [ ] Scenario 10 verified with the network genuinely disconnected
- [ ] Every `FailureCategory` reachable from the interface, not merely defined
