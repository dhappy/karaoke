/**
 * Time formatting for the playback controls. Pure — no DOM, no framework.
 */

/** `m:ss`, widening to `h:mm:ss` past an hour. Never NaN, never negative. */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/**
 * Signed offset with its direction spelled out. FR-013 asks for the effect to be
 * legible; "+0.4s" does not say which way the lyrics moved, so this does.
 */
export function formatOffset(seconds: number): string {
  const v = Math.round(seconds * 100) / 100;
  if (v === 0) return 'in sync';
  const mag = Math.abs(v).toFixed(2).replace(/\.?0+$/, '');
  return v > 0 ? `lyrics ${mag}s late` : `lyrics ${mag}s early`;
}
