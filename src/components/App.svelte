<script lang="ts">
  import { tick } from 'svelte';
  import { media } from '../state/media.svelte.js';
  import { lyrics } from '../state/lyrics.svelte.js';
  import { prefs } from '../state/prefs.svelte.js';
  import { createClock, type Clock } from '../lib/timing/clock.js';
  import { resolve } from '../lib/timing/lookup.js';
  import type { RenderState } from '../lib/timing/types.js';
  import { applyRenderState } from './applyRenderState.js';
  import VideoStage from './VideoStage.svelte';
  import LyricOverlay from './LyricOverlay.svelte';
  import SourcePicker from './SourcePicker.svelte';
  import PlaybackControls, { type PlaybackCommand } from './PlaybackControls.svelte';
  import OffsetControl from './OffsetControl.svelte';
  import DisplaySettings from './DisplaySettings.svelte';
  import ErrorBanner from './ErrorBanner.svelte';
  import { loadDevFixture } from '../state/devFixture.js';

  let mediaSrc = $state<string | null>(null);
  let objectUrl: string | null = null;
  let overlayEl = $state<HTMLElement | null>(null);
  let videoEl = $state<HTMLVideoElement | null>(null);
  let stageEl = $state<HTMLElement | null>(null);

  /**
   * Reactive at LINE granularity only. `render` is replaced when the set of
   * visible lines changes; the per-frame fill never passes through here.
   * Constitution III — there is no `position` rune in this file, by design.
   */
  let render = $state<RenderState>({ active: [], preview: null, countdown: null });

  let clock: Clock | null = null;

  function sameLines(a: RenderState, b: RenderState): boolean {
    if (a.active.length !== b.active.length) return false;
    for (let i = 0; i < a.active.length; i++) {
      if (a.active[i]!.line.id !== b.active[i]!.line.id) return false;
      if (a.active[i]!.activeTokenIndex !== b.active[i]!.activeTokenIndex) return false;
    }
    return (a.preview?.id ?? null) === (b.preview?.id ?? null)
      && (a.countdown === null) === (b.countdown === null);
  }

  async function onFrame(position: number): Promise<void> {
    const next = resolve(lyrics.index, position, prefs, media.offset);

    if (sameLines(render, next)) {
      // Hot path: no structural change, no await, one property write.
      applyRenderState(overlayEl, next, false);
      return;
    }

    // Structure changed. Svelte batches DOM updates, so writing now would target
    // the PREVIOUS DOM and land the fill on the wrong line. Wait for the flush,
    // then write past the cache because those elements are new to us.
    render = next;
    await tick();
    applyRenderState(overlayEl, next, true);
  }

  // Rebuild the clock whenever the media element changes. Disposal is what stops
  // rAF loops and listeners leaking across source swaps (FR-022).
  $effect(() => {
    const el = videoEl;
    clock?.dispose();
    clock = null;
    if (!el) return;
    clock = createClock(el, onFrame);
    return () => { clock?.dispose(); clock = null; };
  });

  /** Keep the scheme attribute on <html> so tokens.css can switch palettes. */
  $effect(() => {
    document.documentElement.setAttribute('data-scheme', prefs.colorScheme);
  });

  // --- loading (FR-022: the two sources are independent) --------------------

  function setMediaFromUrl(href: string, origin: { kind: 'file'; name: string } | { kind: 'url'; href: string }) {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = href.startsWith('blob:') ? href : null;
    media.beginLoad(origin);
    mediaSrc = href;
  }

  function onVideoFile(file: File) {
    setMediaFromUrl(URL.createObjectURL(file), { kind: 'file', name: file.name });
  }

  async function onLyricsFile(file: File) {
    let text: string;
    try {
      text = await file.text();
    } catch {
      // Staged: nothing is committed, so previously loaded lyrics keep playing.
      lyrics.diagnostics = [{
        severity: 'error', code: 'empty-file', line: null,
        message: 'That file could not be read from disk. Try choosing it again.',
      }];
      return;
    }
    lyrics.load(text, { kind: 'file', name: file.name }, media.duration ?? undefined);
  }

  function onCommand(c: PlaybackCommand) {
    const v = videoEl;
    if (!v) return;
    switch (c.type) {
      case 'play': void v.play().catch(() => media.fail('Playback could not start. Try pressing play again.')); break;
      case 'pause': v.pause(); break;
      case 'seek': v.currentTime = c.to; break;
      case 'volume': v.volume = c.level; break;
      case 'mute': v.muted = c.on; break;
      case 'rate': v.playbackRate = c.value; break;
      case 'toggle-fullscreen':
        if (document.fullscreenElement) void document.exitFullscreen();
        else void stageEl?.requestFullscreen?.();
        break;
    }
  }

  function dismiss() {
    lyrics.dismissDiagnostics();
    media.clearError();
  }

  async function loadFixture() {
    const f = await loadDevFixture();
    setMediaFromUrl(f.mediaUrl, { kind: 'url', href: f.mediaUrl });
    lyrics.load(f.vttText, { kind: 'file', name: f.vttName });
  }

  // Test seam. Integration tests drive the app through this rather than
  // simulating a native file dialog.
  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__karaoke = {
      loadFixture,
      loadLyrics: (text: string, name: string) =>
        lyrics.load(text, { kind: 'file', name }, media.duration ?? undefined),
      loadMedia: (url: string) => setMediaFromUrl(url, { kind: 'url', href: url }),
      state: { media, lyrics, prefs },
    };
  }
</script>

<main>
  <div class="stage-wrap" bind:this={stageEl}>
    <VideoStage {media} src={mediaSrc} onelement={(el) => (videoEl = el)}>
      <LyricOverlay index={lyrics.index} {render} {prefs} bind:el={overlayEl} />
    </VideoStage>
  </div>

  <div class="chrome">
    <PlaybackControls {media} oncommand={onCommand} />

    <div class="tools">
      <SourcePicker onvideo={onVideoFile} onlyrics={onLyricsFile} compact={!!mediaSrc} />
      <OffsetControl offset={media.offset} onchange={(v) => (media.offset = v)} />
      <DisplaySettings {prefs} />
    </div>

    <ErrorBanner diagnostics={lyrics.diagnostics} error={media.error} ondismiss={dismiss} />
  </div>
</main>

<style>
  main {
    height: 100%;
    display: grid;
    grid-template-rows: 1fr auto;
    background: #000;
  }

  .stage-wrap { position: relative; min-height: 0; }

  .chrome {
    display: flex;
    flex-direction: column;
    background: var(--ui-bg);
  }

  .tools {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
    justify-content: space-between;
    padding: 0.4rem 0.6rem;
    border-top: 1px solid rgb(255 255 255 / 0.08);
  }
</style>
