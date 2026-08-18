<script lang="ts">
  /**
   * FR-001 / FR-022 — file picker AND drag-and-drop, accepting video and lyrics
   * independently in either order.
   *
   * Constitution II: files are read with FileReader and object URLs. Nothing is
   * uploaded, and nothing about the file leaves the device.
   */
  interface Props {
    onvideo: (file: File) => void;
    onlyrics: (file: File) => void;
    compact?: boolean;
  }
  let { onvideo, onlyrics, compact = false }: Props = $props();

  let dragging = $state(false);

  const isVtt = (f: File) => /\.vtt$/i.test(f.name) || f.type === 'text/vtt';

  function route(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (isVtt(file)) onlyrics(file);
      else onvideo(file);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    route(e.dataTransfer?.files ?? null);
  }
</script>

<div
  class="picker"
  class:compact
  class:dragging
  role="region"
  aria-label="Choose a video and lyric file"
  ondragover={(e) => { e.preventDefault(); dragging = true; }}
  ondragleave={() => (dragging = false)}
  ondrop={onDrop}
>
  <label class="btn">
    <input
      type="file"
      accept="video/*,audio/*"
      data-testid="video-input"
      onchange={(e) => route((e.currentTarget as HTMLInputElement).files)}
    />
    <span>Choose video</span>
  </label>

  <label class="btn">
    <input
      type="file"
      accept=".vtt,text/vtt"
      data-testid="lyrics-input"
      onchange={(e) => route((e.currentTarget as HTMLInputElement).files)}
    />
    <span>Choose lyrics</span>
  </label>

  {#if !compact}
    <p class="hint">…or drop a video and a .vtt file anywhere here</p>
  {/if}
</div>

<style>
  .picker {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    justify-content: center;
    padding: var(--pad);
    border-radius: var(--radius);
    transition: outline-color 120ms;
    outline: 2px dashed transparent;
  }
  .dragging { outline-color: var(--ui-accent); background: rgb(255 210 63 / 0.08); }

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

  .hint { color: var(--ui-muted); margin: 0; flex-basis: 100%; text-align: center; }
</style>
