<script lang="ts">
  import type { SourcesState } from '../state/sources.svelte.js';

  /**
   * FR-132 — the copy action is EXPLICIT.
   *
   * The address bar reflects the pairing on its own, but nothing reaches a
   * clipboard without a deliberate press. Sharing is something the person does,
   * not something that happens to them.
   *
   * FR-127 / SC-113 — a partial link says which half is missing, and an empty
   * one refuses rather than handing over a link that silently restores nothing.
   */
  interface Props {
    sources: SourcesState;
  }
  let { sources }: Props = $props();

  let note = $state<string | null>(null);
  let noteTimer: ReturnType<typeof setTimeout> | null = null;

  function say(message: string) {
    note = message;
    if (noteTimer) clearTimeout(noteTimer);
    noteTimer = setTimeout(() => (note = null), 6000);
  }

  async function copy() {
    const completeness = sources.completeness;

    if (completeness === 'empty') {
      // Both sources are local files. There is genuinely nothing to share, and
      // a link restoring nothing would be worse than this refusal.
      say('Nothing to share yet — a link can only carry sources loaded from an address.');
      return;
    }

    if (sources.linkTooLong) {
      say('These addresses are too long to fit in a shareable link. The song still plays.');
      return;
    }

    const url = sources.shareUrl;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard access can be refused; the link is still correct and visible
      // in the address bar, so say that rather than pretending it worked.
      say('Could not reach the clipboard. The link is in your address bar — copy it from there.');
      return;
    }

    if (completeness === 'partial') {
      const missing = sources.missing;
      say(`Link copied — but the ${missing} is a local file, so it is not included.`);
    } else {
      say('Link copied.');
    }
  }
</script>

<div class="share">
  <button type="button" onclick={copy} data-testid="copy-link">Copy link</button>

  {#if sources.completeness === 'partial'}
    <span class="hint" data-testid="link-partial">
      Partial — {sources.missing} is a local file
    </span>
  {:else if sources.completeness === 'empty'}
    <span class="hint" data-testid="link-empty">Nothing to share</span>
  {/if}

  {#if note}
    <span class="note" role="status" data-testid="share-note">{note}</span>
  {/if}
</div>

<style>
  .share {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }

  button {
    min-height: var(--hit);
    padding: 0 0.9rem;
    border-radius: var(--radius);
    background: var(--ui-bg);
    color: var(--ui-fg);
    border: 1px solid rgb(255 255 255 / 0.15);
    cursor: pointer;
  }
  button:hover { border-color: var(--ui-accent); }

  .hint { color: var(--ui-muted); font-size: 0.8rem; }
  .note { color: var(--ui-accent); font-size: 0.8rem; }
</style>
