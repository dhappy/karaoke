<script lang="ts">
  import type { MediaState } from '../state/media.svelte.js';
  import type { Snippet } from 'svelte';

  /**
   * The impure edge (Constitution I as scoped by v1.0.1): this component owns the
   * media element and its error surfaces by design. src/lib/ stays pure.
   */
  interface Props {
    media: MediaState;
    src: string | null;
    /** Classification and reinstatement live in SourcesState (FR-112). */
    onfail: (code: number | undefined, hasPlayed: boolean) => void;
    onsucceed: () => void;
    onelement: (el: HTMLVideoElement | null) => void;
    children?: Snippet;
  }
  let { media, src, onfail, onsucceed, onelement, children }: Props = $props();

  let video = $state<HTMLVideoElement | null>(null);

  /**
   * Splits "this never worked" from "this stopped working" (FR-120). The same
   * absent MediaError code means different things either side of the first
   * frame, and the person needs a different action for each.
   */
  let hasPlayed = false;

  /** No `progress` for this long, with too little buffered, is a stall (D8). */
  const STALL_MS = 30_000;
  let stallTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    onelement(video);
    return () => onelement(null);
  });

  // A new source is a new load: reset the play history and the stall clock.
  $effect(() => {
    void src;
    hasPlayed = false;
    armStall();
    return clearStall;
  });

  function clearStall() {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = null;
  }

  function armStall() {
    clearStall();
    if (!src) return;
    stallTimer = setTimeout(() => {
      // HAVE_CURRENT_DATA or better means it is playable and simply idle;
      // anything less after 30s of silence means nothing is arriving.
      if (video && video.readyState < 2) onfail(undefined, hasPlayed);
    }, STALL_MS);
  }

  function onError() {
    clearStall();
    // MEDIA_ERR_ABORTED means WE replaced the source. Reporting it would accuse
    // the new, working source of a failure that belonged to the old one.
    if (video?.error?.code === MediaError.MEDIA_ERR_ABORTED) return;
    onfail(video?.error?.code, hasPlayed);
  }

  function onLoadedMetadata() {
    if (!video || !media.origin) return;
    clearStall();
    media.succeed(media.origin, video.duration);
    onsucceed();
  }
</script>

<div class="stage">
  {#if src}
    <!-- svelte-ignore a11y_media_has_caption -- lyrics are the overlay, not a track -->
    <video
      bind:this={video}
      {src}
      class="video"
      playsinline
      onerror={onError}
      onloadedmetadata={onLoadedMetadata}
      onprogress={armStall}
      onstalled={armStall}
      onwaiting={armStall}
      onplay={() => (media.playing = true)}
      onplaying={() => { media.playing = true; hasPlayed = true; clearStall(); }}
      onpause={() => (media.playing = false)}
      onended={() => (media.playing = false)}
      onseeking={() => (media.seeking = true)}
      onseeked={() => (media.seeking = false)}
      onratechange={() => video && (media.rate = video.playbackRate)}
      ontimeupdate={() => video && (media.scrubPosition = video.currentTime)}
      onvolumechange={() => {
        if (!video) return;
        media.volume = video.volume;
        media.muted = video.muted;
      }}
    ></video>
  {:else}
    <div class="placeholder">
      <p>Choose a video and a WebVTT lyric file to begin.</p>
    </div>
  {/if}

  {@render children?.()}
</div>

<style>
  .stage {
    position: relative;
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    background: #000;
    overflow: hidden;
  }

  /* The overlay scales with the video box, not the viewport (FR-012). */
  .video {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }

  .placeholder {
    color: var(--ui-muted);
    text-align: center;
    padding: 2rem;
  }
</style>
