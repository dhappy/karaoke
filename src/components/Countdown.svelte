<script lang="ts">
  interface Props { seconds: number }
  let { seconds }: Props = $props();
  const pips = $derived(Math.max(1, Math.ceil(seconds)));
</script>

<div class="countdown" role="timer" aria-label={`${Math.ceil(seconds)} seconds until the next line`}>
  {#each { length: pips } as _, i}
    <span class="pip" class:dim={i >= seconds}></span>
  {/each}
</div>

<style>
  .countdown {
    display: flex;
    gap: 0.4em;
    justify-content: center;
    padding-bottom: 0.5em;
  }
  .pip {
    width: 0.6em;
    height: 0.6em;
    border-radius: 50%;
    background: var(--sung);
    box-shadow: 0 0 0.4em rgb(0 0 0 / 0.8);
  }
  .dim { opacity: 0.3; }
</style>
