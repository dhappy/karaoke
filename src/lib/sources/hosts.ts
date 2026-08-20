/**
 * Recognizing streaming-service PAGES so we can explain them (FR-114).
 *
 * People think of "the URL of a video" as the page they watch it on. Feature 001
 * put streaming-service integration out of scope, so the product's job is to
 * name the distinction rather than fail generically.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * HARD CONSTRAINT (research D6): entries are BARE HOSTNAMES, never full URLs.
 *
 * tests/unit/egress.test.ts fails the build on any absolute third-party URL in
 * the bundle, matching /https?:\/\/[\w.-]+/. It cannot tell an identifier from
 * an endpoint, and it is right not to try. Writing 'https://youtube.com' here
 * would trip that guard correctly. Keep these as data.
 * ────────────────────────────────────────────────────────────────────────────
 */

/** Ten hosts cover essentially every real case; a hundred is maintenance. */
export const STREAMING_HOSTS: readonly string[] = [
  'youtube.com',
  'youtu.be',
  'vimeo.com',
  'dailymotion.com',
  'twitch.tv',
  'soundcloud.com',
  'spotify.com',
  'tiktok.com',
  'instagram.com',
  'facebook.com',
] as const;

/** Extensions that mean "this really is a file", overriding a host match. */
const DIRECT_MEDIA = /\.(mp4|webm|ogg|ogv|m4v|mov|mp3|m4a|aac|flac|wav|opus|vtt|srt)$/i;

/**
 * Dot-boundary suffix match: `www.youtube.com` and `m.youtube.com` match,
 * `notyoutube.com` does not. A substring test would produce the latter.
 */
export function isStreamingHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  return STREAMING_HOSTS.some((s) => h === s || h.endsWith(`.${s}`));
}

/**
 * The list is a courtesy, not a gate. A direct media file hosted on one of these
 * domains is still a direct media file, and refusing it would be the product
 * insisting it knows better than the person.
 */
export function looksLikeDirectMedia(pathname: string): boolean {
  return DIRECT_MEDIA.test(pathname);
}
