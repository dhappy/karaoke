export type ColorScheme = 'classic' | 'high-contrast' | 'warm' | 'cool';
export type Placement = 'bottom' | 'center' | 'top';

/** Session-scoped. No persistence, per the spec's Assumptions. */
export class PrefsState {
  textScale = $state(1.0);
  colorScheme = $state<ColorScheme>('classic');
  placement = $state<Placement>('bottom');
  previewWindow = $state(4.0);
  countdownThreshold = $state(3.0);

  reset(): void {
    this.textScale = 1.0;
    this.colorScheme = 'classic';
    this.placement = 'bottom';
    this.previewWindow = 4.0;
    this.countdownThreshold = 3.0;
  }
}

export const prefs = new PrefsState();
