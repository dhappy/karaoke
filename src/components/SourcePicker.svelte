<script lang="ts">
  import type { MediaState } from '../state/media.svelte.js';
  import type { LyricsState } from '../state/lyrics.svelte.js';
  import type { SourcesState } from '../state/sources.svelte.js';
  import type { SourceSlot } from '../lib/sources/types.js';

  /**
   * FR-001/FR-022 (feature 001) plus FR-101/102/103/107/115/116 (feature 002):
   * each slot accepts a FILE or an ADDRESS, independently and in any order.
   *
   * Constitution II: files are read locally; an address is fetched only because
   * the person typed it. Nothing is uploaded either way.
   */
  interface Props {
    media: MediaState;
    lyrics: LyricsState;
    sources: SourcesState;
    compact?: boolean;
  }
  let { media, lyrics, sources, compact = false }: Props = $props();

  let dragging = $state(false);
  let videoAddress = $state('');
  let lyricsAddress = $state('');

  /** The last paste/drop we guessed a slot for, so the guess can be corrected. */
  let lastRouted = $state<{ slot: SourceSlot; address: string } | null>(null);

  const isVttFile = (f: File) => /\.vtt$/i.test(f.name) || f.type === 'text/vtt';
  const looksLikeLyrics = (s: string) => /\.(vtt|srt)(\?|#|$)/i.test(s);
  const looksLikeAddress = (s: string) => /^\s*<?\s*https?:\/\//i.test(s);

  function routeFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (isVttFile(file)) void sources.setLyricsFile(file);
      else sources.setVideoFile(file);
    }
  }

  function submit(slot: SourceSlot, address: string) {
    if (!address.trim()) return;
    if (slot === 'video') sources.loadVideoFromAddress(address);
    else void sources.loadLyricsFromAddress(address);
  }

  /** FR-116 — a pasted or dropped address routes itself, correctably. */
  function routeAddress(address: string) {
    const slot: SourceSlot = looksLikeLyrics(address) ? 'lyrics' : 'video';
    lastRouted = { slot, address };
    submit(slot, address);
  }

  /** FR-116 — the override, for when the guess was wrong. */
  function sendToOtherSlot() {
    if (!lastRouted) return;
    const other: SourceSlot = lastRouted.slot === 'video' ? 'lyrics' : 'video';
    const { address } = lastRouted;
    lastRouted = null;
    submit(other, address);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    const text = e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain') || '';
    if (e.dataTransfer?.files?.length) routeFiles(e.dataTransfer.files);
    else if (looksLikeAddress(text)) routeAddress(text);
  }

  function onPaste(e: ClipboardEvent) {
    // Only when no field has focus — otherwise the person is typing into one
    // deliberately and we must not steal it.
    const target = e.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
    const text = e.clipboardData?.getData('text') ?? '';
    if (looksLikeAddress(text)) {
      e.preventDefault();
      routeAddress(text);
    }
  }

  /** FR-115 — what is loaded, as text. Never a link: it is untrusted input. */
  function describeOrigin(origin: { kind: 'file'; name: string } | { kind: 'url'; href: string } | null) {
    if (!origin) return null;
    return origin.kind === 'file' ? origin.name : origin.href;
  }

  const videoOrigin = $derived(describeOrigin(media.origin));
  const lyricsOrigin = $derived(describeOrigin(lyrics.origin));
</script>

<svelte:window onpaste={onPaste} />

<div
  class="picker"
  class:compact
  class:dragging
  role="region"
  aria-label="Choose a video and lyric file, or paste their addresses"
  ondragover={(e) => { e.preventDefault(); dragging = true; }}
  ondragleave={() => (dragging = false)}
  ondrop={onDrop}
>
  <div class="slot">
    <label class="btn">
      <input
        type="file"
        accept="video/*,audio/*"
        data-testid="video-input"
        onchange={(e) => routeFiles((e.currentTarget as HTMLInputElement).files)}
      />
      <span>Choose video</span>
    </label>

    <form
      class="address"
      onsubmit={(e) => { e.preventDefault(); submit('video', videoAddress); }}
    >
      <input
        type="text"
        inputmode="url"
        placeholder="…or paste a video address"
        aria-label="Video address"
        data-testid="video-address"
        bind:value={videoAddress}
      />
      <button type="submit" data-testid="video-address-go">Load</button>
    </form>

    <p class="status" data-testid="video-status">
      {#if media.loading}
        <span class="loading">Loading video…</span>
      {:else if videoOrigin}
        <span class="origin" title={videoOrigin}>{videoOrigin}</span>
      {:else}
        <span class="muted">No video yet</span>
      {/if}
    </p>
  </div>

  <div class="slot">
    <label class="btn">
      <input
        type="file"
        accept=".vtt,text/vtt"
        data-testid="lyrics-input"
        onchange={(e) => routeFiles((e.currentTarget as HTMLInputElement).files)}
      />
      <span>Choose lyrics</span>
    </label>

    <form
      class="address"
      onsubmit={(e) => { e.preventDefault(); submit('lyrics', lyricsAddress); }}
    >
      <input
        type="text"
        inputmode="url"
        placeholder="…or paste a lyrics address"
        aria-label="Lyrics address"
        data-testid="lyrics-address"
        bind:value={lyricsAddress}
      />
      <button type="submit" data-testid="lyrics-address-go">Load</button>
    </form>

    <p class="status" data-testid="lyrics-status">
      {#if lyrics.loading}
        <span class="loading">Loading lyrics…</span>
      {:else if lyricsOrigin}
        <span class="origin" title={lyricsOrigin}>{lyricsOrigin}</span>
      {:else}
        <span class="muted">No lyrics yet</span>
      {/if}
    </p>
  </div>

  {#if lastRouted}
    <p class="routed" data-testid="routing-override">
      Sent that address to <strong>{lastRouted.slot === 'video' ? 'video' : 'lyrics'}</strong>.
      <button type="button" onclick={sendToOtherSlot}>
        Use as {lastRouted.slot === 'video' ? 'lyrics' : 'video'} instead
      </button>
    </p>
  {/if}

  {#if !compact}
    <p class="hint">Drop a video and a .vtt file here, or paste an address anywhere on the page</p>
  {/if}
</div>

<style>
  .picker {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: flex-start;
    justify-content: center;
    padding: var(--pad);
    border-radius: var(--radius);
    transition: outline-color 120ms;
    outline: 2px dashed transparent;
  }
  .dragging { outline-color: var(--ui-accent); background: rgb(255 210 63 / 0.08); }

  .slot { display: flex; flex-direction: column; gap: 0.35rem; min-width: 15rem; }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: var(--hit);
    padding: 0 1rem;
    border-radius: var(--radius);
    background: var(--ui-bg);
    color: var(--ui-fg);
    border: 1px solid rgb(255 255 255 / 0.15);
    cursor: pointer;
  }
  .btn:hover { border-color: var(--ui-accent); }

  input[type='file'] {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  .address { display: flex; gap: 0.25rem; }
  .address input {
    flex: 1;
    min-width: 0;
    min-height: var(--hit);
    padding: 0 0.5rem;
    border-radius: var(--radius);
    background: rgb(0 0 0 / 0.35);
    color: var(--ui-fg);
    border: 1px solid rgb(255 255 255 / 0.15);
  }
  .address input:focus { outline: 2px solid var(--ui-accent); outline-offset: 1px; }
  .address button {
    min-height: var(--hit);
    padding: 0 0.75rem;
    border-radius: var(--radius);
    background: var(--ui-bg);
    color: var(--ui-fg);
    border: 1px solid rgb(255 255 255 / 0.15);
    cursor: pointer;
  }
  .address button:hover { border-color: var(--ui-accent); }

  .status { margin: 0; font-size: 0.8rem; line-height: 1.3; }
  /* Long addresses must not stretch the layout; the full value is in `title`. */
  .origin {
    display: block;
    max-width: 22rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--ui-fg);
  }
  .muted { color: var(--ui-muted); }
  .loading { color: var(--ui-accent); }

  .routed { flex-basis: 100%; margin: 0; text-align: center; font-size: 0.85rem; }
  .routed button {
    min-height: var(--hit);
    padding: 0 0.6rem;
    background: transparent;
    color: var(--ui-accent);
    border: 1px solid transparent;
    border-radius: var(--radius);
    cursor: pointer;
    text-decoration: underline;
  }
  .routed button:hover { border-color: var(--ui-accent); }

  .hint { color: var(--ui-muted); margin: 0; flex-basis: 100%; text-align: center; }
</style>
