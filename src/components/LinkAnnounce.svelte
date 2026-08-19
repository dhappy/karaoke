<script lang="ts">
  /**
   * FR-128 — names the addresses an incoming link is about to contact.
   *
   * Opening a shared link points the person's browser at addresses THEY did not
   * choose. That is ordinary web behaviour and within what clicking a link
   * implies, but the sender picked the destination, so the person should be able
   * to see where they are being pointed rather than learn it from the result.
   *
   * FR-129: an address from a link is untrusted input. It is rendered as TEXT —
   * never as markup, never as an <a href>, so it cannot be followed by a
   * mis-click and cannot smuggle in a scheme the validator would refuse.
   */
  interface Props {
    addresses: readonly string[];
  }
  let { addresses }: Props = $props();
</script>

{#if addresses.length > 0}
  <div class="announce" role="status" data-testid="link-announce">
    <p class="lead">This link is loading from:</p>
    <ul>
      {#each addresses as address (address)}
        <li data-testid="announced-address">{address}</li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .announce {
    padding: 0.5rem 0.75rem;
    background: var(--ui-bg);
    border-top: 1px solid rgb(255 255 255 / 0.1);
    font-size: 0.85rem;
  }
  .lead { margin: 0 0 0.25rem; color: var(--ui-muted); }
  ul { margin: 0; padding-left: 1.1rem; }
  li {
    color: var(--ui-fg);
    /* Long addresses wrap rather than stretching the layout. */
    overflow-wrap: anywhere;
  }
</style>
