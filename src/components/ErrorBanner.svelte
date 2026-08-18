<script lang="ts">
  import type { Diagnostic } from '../lib/vtt/types.js';

  /**
   * Constitution IV — a warning means the file loaded and is PLAYING; an error
   * means it did not. Those must not look alike, and neither blocks playback of
   * content that already loaded (FR-021).
   *
   * Diagnostic text is derived from a user-supplied file. It is rendered as text,
   * never as markup, and the parser guarantees it never quotes file content.
   */
  interface Props {
    diagnostics: readonly Diagnostic[];
    error: string | null;
    ondismiss: () => void;
  }
  let { diagnostics, error, ondismiss }: Props = $props();

  const errors = $derived(diagnostics.filter((d) => d.severity === 'error'));
  const warnings = $derived(diagnostics.filter((d) => d.severity === 'warning'));
  const shown = $derived(error || errors.length > 0 || warnings.length > 0);
</script>

{#if shown}
  <div class="banner" role="status" data-testid="banner">
    {#if error}
      <p class="row error" data-testid="error">{error}</p>
    {/if}

    {#each errors as d}
      <p class="row error" data-testid="error">{d.message}</p>
    {/each}

    {#if warnings.length > 0}
      <p class="row warn" data-testid="warning">
        {warnings.length === 1
          ? warnings[0]!.message
          : `${warnings.length} lyric lines needed repair or were skipped. The rest of the file is playing normally.`}
      </p>
    {/if}

    <button class="dismiss" onclick={ondismiss} aria-label="Dismiss messages">×</button>
  </div>
{/if}

<style>
  .banner {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.5rem 3rem 0.5rem 0.75rem;
    background: var(--ui-bg);
    border-top: 1px solid rgb(255 255 255 / 0.1);
  }
  .row { margin: 0; font-size: 0.9rem; line-height: 1.4; }
  /* Errors and warnings are deliberately distinct: one means it is playing. */
  .error { color: var(--ui-danger); font-weight: 600; }
  .warn { color: var(--ui-warn); }
  .dismiss {
    position: absolute;
    top: 50%;
    right: 0.25rem;
    transform: translateY(-50%);
    font-size: 1.5rem;
    line-height: 1;
    color: var(--ui-muted);
  }
</style>
