# Contract: Component API

**Modules**: `src/components/*.svelte` | Svelte 5 runes; props typed, no `any`

The UI contract. `src/lib/` never imports from here; the dependency arrow points one way, which is what keeps the core testable without a browser.

## `VideoStage`

Owns the media element and the stacking context the overlay lives in.

```ts
{ media: MediaSource; onstate: (s: PlaybackState) => void; onerror: (m: string) => void }
```

- Establishes a positioned container so the overlay scales with the video box at any window size and in fullscreen (FR-012).
- Surfaces media errors as plain language, never as raw `MediaError` codes (FR-021).
- Exposes the element to `createClock`; nothing else touches it.

## `LyricOverlay`

```ts
{ index: CueIndex | null; playback: PlaybackState; prefs: DisplayPreferences }
// NOTE: PlaybackState carries no `position`. Per-frame position arrives through the clock
// callback, not through props — see data-model.md and Principle III.
```

- Renders `RenderState.active` as independent stacked lines (FR-019), `preview` de-emphasized (FR-016), `countdown` when present (FR-017).
- **Reactive at line granularity only** (D4). It must not hold the playhead in `$state`. The per-frame `--p` write is done imperatively by the clock callback against the active `WordSpan`'s element.
- `index: null` or empty `active` renders nothing — the video stays unobstructed (FR-005).
- Keyed by `LyricLine.id` so overlapping lines never swap identity mid-render.

## `LyricLine` / `WordSpan`

```ts
// LyricLine
{ line: LyricLine; activeTokenIndex: number; emphasis: 'active' | 'preview' }
// WordSpan
{ token: WordToken; state: 'sung' | 'active' | 'unsung' }
```

- `WordSpan` renders two pixel-identical layers driven by `--p` (D3). It exposes its element for the imperative write.
- `LyricLine` MUST expose `data-emphasis="active" | "preview"` alongside `data-line-id`. Active
  and preview lines are simultaneously present in the DOM whenever a preview is showing, so
  `data-line-id` alone cannot identify what is being sung — anything selecting lines (the
  imperative writer, tests, assistive tooling) needs the distinction. (Added after the T029
  integration test read a preview line as a second active line.)
- Wrapping is the line's responsibility; the clip is per word, so wrapping needs no special handling (D3).

## `SourcePicker`

```ts
{ onvideo: (f: File | string) => void; onlyrics: (f: File | string) => void }
```

- File picker **and** drag-and-drop (FR-001).
- Accepts video and lyrics independently, in either order, replacing either without disturbing the other (FR-022).

## `PlaybackControls`

```ts
{ playback: PlaybackState; position: number; oncommand: (c: PlaybackCommand) => void }
// `position` here is the SCRUBBER's value, throttled to ~4Hz from `timeupdate` — deliberately
// NOT the per-frame playhead. A seek bar does not need 60Hz, and wiring it to the frame clock
// would reintroduce the Principle III violation through the back door.
```

`PlaybackCommand` = `{type:'play'|'pause'|'toggle-fullscreen'} | {type:'seek', to:number} | {type:'volume', level:number} | {type:'mute', on:boolean} | {type:'rate', value:number}`.

Covers FR-011. Controls stay reachable at narrow widths and are never occluded by the overlay (FR-012).

## `OffsetControl`

```ts
{ offset: number; onchange: (seconds: number) => void }
```

Signed, immediate, session-persistent (FR-013). Includes a reset to zero, and displays sign explicitly ("lyrics 0.4s early") rather than a bare number.

## `DisplaySettings`

```ts
{ prefs: DisplayPreferences; onchange: (p: Partial<DisplayPreferences>) => void }
```

Text size, color scheme, placement, at minimum (FR-014). Changes apply immediately, with no reload and no playback interruption.

## `ErrorBanner`

```ts
{ diagnostics: Diagnostic[]; error: string | null; ondismiss: () => void }
```

- Errors and warnings are visually distinct: a warning means the file loaded and is playing (FR-020); an error means it did not.
- Never blocks playback of already-loaded content (FR-021).
- Renders `Diagnostic.message` as text. It is derived from a user-supplied file and is never interpreted as markup.

## Cross-cutting

| Rule | Requirement |
|---|---|
| Overlay text scales with the video box, not the viewport | FR-012 |
| Scrim + shadow + outline on all lyric text | FR-015, SC-008 |
| Fill-boundary position is a second state channel alongside colour — colour is never the sole carrier | Constitution, Quality Standards |
| Interactive targets ≥ 44 px | FR-012 |
| No component holds the playhead in reactive state | D4, SC-003 |
| Every listener and rAF loop torn down on source swap | FR-022 |
| No network egress except to a user-named media/lyric address | Constitution, Principle II |
