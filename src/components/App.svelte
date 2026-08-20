<script lang="ts">
  import { tick, onMount } from 'svelte';
  import { media } from '../state/media.svelte.js';
  import { lyrics } from '../state/lyrics.svelte.js';
  import { prefs } from '../state/prefs.svelte.js';
  import { sources } from '../state/sources.svelte.js';
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
  import ShareLinkBar from './ShareLinkBar.svelte';
  import LinkAnnounce from './LinkAnnounce.svelte';
  import { loadDevFixture } from '../state/devFixture.js';

  // The video src moved to SourcesState so a failed replacement can be undone
  // (FR-112). Reading it here keeps the template unchanged in shape.
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

  // --- loading (FR-022 / FR-103: the two sources are independent) -----------
  //
  // All four paths — file or address, video or lyrics — now run through
  // SourcesState, which owns the per-slot tokens that make a slow first address
  // unable to overwrite a fast second one (SC-107).

  /**
   * FR-123 — restore a pairing from an incoming link on boot, and on
   * back/forward.
   *
   * `onMount`, NOT `$effect`, and the distinction is load-bearing. `reflect()`
   * reads `media.origin`, `lyrics.origin` and `media.offset` — all reactive. In
   * an `$effect` those reads register as dependencies, so the first successful
   * load re-ran the effect, which saw the hash `reflect()` had just written and
   * re-entered the loader, which loaded again... The symptom was a slot stuck
   * on "Loading" forever, which reads like a network problem rather than a
   * reactivity one.
   *
   * Boot is a one-shot. It has no business being reactive.
   */
  onMount(() => {
    const stop = sources.listen();
    if (location.hash.length > 1) void sources.restoreFromLink(location.hash);
    else sources.reflect();
    return stop;
  });

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
    sources.setVideoDirect(f.mediaUrl);
    lyrics.load(f.vttText, { kind: 'file', name: f.vttName });
  }

  // Test seam. Integration tests drive the app through this rather than
  // simulating a native file dialog.
  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__karaoke = {
      loadFixture,
      loadLyrics: (text: string, name: string) =>
        lyrics.load(text, { kind: 'file', name }, media.duration ?? undefined),
      loadMedia: (url: string) => sources.setVideoDirect(url),
      // Feature 002 seams — address loading, link restore, and the link itself.
      loadVideoAddress: (url: string) => sources.loadVideoFromAddress(url),
      loadLyricsAddress: (url: string) => sources.loadLyricsFromAddress(url),
      restoreFromLink: (fragment: string) => sources.restoreFromLink(fragment),
      shareUrl: () => sources.shareUrl,
      state: { media, lyrics, prefs, sources },
    };
  }
</script>

<main>
  <div class="stage-wrap" bind:this={stageEl}>
    <VideoStage
      {media}
      src={sources.mediaSrc}
      onfail={(code, hasPlayed) => sources.videoFailed(code, hasPlayed)}
      onsucceed={() => sources.videoSucceeded()}
      onelement={(el) => (videoEl = el)}
    >
      <LyricOverlay index={lyrics.index} {render} {prefs} bind:el={overlayEl} />
    </VideoStage>
  </div>

  <div class="chrome">
    <PlaybackControls {media} oncommand={onCommand} />

    <div class="tools">
      <SourcePicker {media} {lyrics} {sources} compact={!!sources.mediaSrc} />
      <OffsetControl offset={media.offset} onchange={(v) => sources.offsetChanged(v)} />
      <DisplaySettings {prefs} />
      <ShareLinkBar {sources} />
    </div>

    <LinkAnnounce addresses={sources.announcing} />
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
