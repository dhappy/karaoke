import { describe, it, expect } from 'vitest';
import { isStreamingHost, looksLikeDirectMedia, STREAMING_HOSTS } from '../../src/lib/sources/hosts.js';

describe('isStreamingHost', () => {
  it('matches the bare host and its subdomains', () => {
    expect(isStreamingHost('youtube.com')).toBe(true);
    expect(isStreamingHost('www.youtube.com')).toBe(true);
    expect(isStreamingHost('m.youtube.com')).toBe(true);
    expect(isStreamingHost('YOUTUBE.COM')).toBe(true);
    expect(isStreamingHost('youtu.be')).toBe(true);
  });

  it('does NOT match on a substring', () => {
    // A plain `includes` would match these, and would be wrong: they are other
    // people's domains.
    expect(isStreamingHost('notyoutube.com')).toBe(false);
    expect(isStreamingHost('youtube.com.evil.example')).toBe(false);
    expect(isStreamingHost('myvimeo.com')).toBe(false);
  });

  it('matches nothing for ordinary hosts', () => {
    for (const h of ['example.com', 'nas.local', 'sing.gaian.church', 'localhost']) {
      expect(isStreamingHost(h), h).toBe(false);
    }
  });

  /**
   * research D6 — the constraint that makes the egress guard meaningful.
   *
   * tests/unit/egress.test.ts fails the build on any absolute third-party URL in
   * the bundle and cannot tell an identifier from an endpoint. If someone
   * "helpfully" rewrites these as full URLs, this test names the reason before
   * the build failure has to.
   */
  it('stores entries as bare hostnames, with no scheme', () => {
    for (const entry of STREAMING_HOSTS) {
      expect(entry, entry).not.toContain('://');
      expect(entry, entry).not.toContain('/');
      expect(entry, entry).toBe(entry.toLowerCase());
    }
    expect(STREAMING_HOSTS.length).toBeGreaterThan(0);
  });
});

describe('looksLikeDirectMedia', () => {
  it('recognizes media and subtitle extensions', () => {
    for (const p of ['/a.mp4', '/a.webm', '/a.mp3', '/a.m4a', '/deep/path/b.vtt', '/A.MP4']) {
      expect(looksLikeDirectMedia(p), p).toBe(true);
    }
  });

  it('rejects page paths', () => {
    for (const p of ['/watch', '/watch/', '/video/12345', '/', '/index.html']) {
      expect(looksLikeDirectMedia(p), p).toBe(false);
    }
  });
});
