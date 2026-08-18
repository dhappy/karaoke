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
    onelement: (el: HTMLVideoElement | null) => void;
    children?: Snippet;
  }
  let { media, src, onelement, children }: Props = $props();

  let video = $state<HTMLVideoElement | null>(null);

  $effect(() => {
    onelement(video);
    return () => onelement(null);
  });

  /** FR-021: plain language, never a raw MediaError code. */
  function describe(el: HTMLVideoElement): string {
    switch (el.error?.code) {
      case MediaError.MEDIA_ERR_ABORTED:
        return 'Loading the video was cancelled. Try choosing it again.';
      case MediaError.MEDIA_ERR_NETWORK:
        return 'The video could not be read all the way through. Check the file and try again.';
      case MediaError.MEDIA_ERR_DECODE:
        return 'This video file is damaged, or uses a format this browser cannot decode. Try another file.';
      case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
        return 'This browser cannot play that video format. Try an MP4 or WebM file.';
      default:
        return 'That file could not be played. Try choosing another one.';
    }
  }

  function onError() {
    if (video) media.fail(describe(video));
  }

  function onLoadedMetadata() {
    if (!video || !media.origin) return;
    media.succeed(media.origin, video.duration);
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
      onplay={() => (media.playing = true)}
      onplaying={() => (media.playing = true)}
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
