/**
 * Second-origin fixture server (research D11).
 *
 * Integration tests for remote sources need an origin that is genuinely NOT the
 * app's own. A different port is sufficient: `'self'` in the CSP does not cover
 * it, so the widened `media-src`/`connect-src` and the CORS asymmetry between
 * `<video src>` and `fetch` are exercised for real rather than assumed.
 *
 * Node's built-in `http` only — Constitution V, no dependency for a test helper.
 *
 * Run: node --experimental-strip-types tests/fixtures/server.ts
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const PORT = Number(process.env.FIXTURE_PORT ?? 5174);
const ROOT = new URL('.', import.meta.url).pathname;

const TYPES: Record<string, string> = {
  '.vtt': 'text/vtt; charset=utf-8',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.txt': 'text/plain; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
};

/** Routes the tests drive. Each exists to produce one FailureCategory. */
const ROUTES = ['ok', 'no-cors', '404', '403', 'slow', 'delay', 'redirect', 'html'] as const;
type Route = (typeof ROUTES)[number];

function parse(url: string): { route: Route; file: string } | null {
  const [, head, ...rest] = decodeURIComponent(url.split('?')[0]!).split('/');
  if (!head || !ROUTES.includes(head as Route)) return null;
  return { route: head as Route, file: rest.join('/') };
}

/** Never let a crafted path escape the fixture directory. */
function resolveSafe(file: string): string | null {
  const full = normalize(join(ROOT, file));
  return full.startsWith(normalize(ROOT)) ? full : null;
}

function send(
  res: ServerResponse,
  status: number,
  body: Buffer | string,
  type: string,
  cors: boolean,
  extra: Record<string, string> = {},
): void {
  const headers: Record<string, string> = {
    'content-type': type,
    'content-length': String(Buffer.byteLength(body)),
    'cache-control': 'no-store',
    ...extra,
  };
  // The whole point of /no-cors/: this header is WITHHELD there, so `fetch`
  // cannot read the body while `<video src>` still plays it.
  if (cors) {
    headers['access-control-allow-origin'] = '*';
    headers['access-control-expose-headers'] = 'content-length, content-range';
  }
  res.writeHead(status, headers);
  res.end(body);
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const parsed = parse(req.url ?? '/');
  if (!parsed) {
    send(res, 404, 'no such route', 'text/plain; charset=utf-8', true);
    return;
  }
  const { route, file } = parsed;

  if (route === 'slow') {
    /**
     * Hangs past the 20s lyric deadline (D8) so the timeout is provable.
     *
     * Held for 25s, not 60: a browser allows only ~6 concurrent connections per
     * origin, so every socket parked here is one the rest of the suite cannot
     * use. At 60s, parallel workers queued their video loads behind these and
     * failed with "still loading" — a test-infrastructure failure that looks
     * exactly like a product bug. Use `/delay/` for anything that only needs to
     * be slow rather than hanging.
     */
    const timer = setTimeout(() => res.destroy(), 25_000);
    res.on('close', () => clearTimeout(timer));
    return;
  }

  if (route === 'delay') {
    // Briefly slow, then a normal success: enough to observe a loading state or
    // to lose a race, without parking a socket.
    await new Promise((r) => setTimeout(r, 1_500));
    if (res.destroyed) return;
  }

  if (route === '404') {
    send(res, 404, 'not found', 'text/plain; charset=utf-8', true);
    return;
  }

  if (route === '403') {
    send(res, 403, 'forbidden', 'text/plain; charset=utf-8', true);
    return;
  }

  if (route === 'html') {
    // 200 with an HTML body: proves content is judged by whether it PARSES as
    // WebVTT, not by the extension in the address (FR-113).
    send(res, 200, '<!doctype html><title>Error</title><p>Not found</p>', TYPES['.html']!, true);
    return;
  }

  if (route === 'redirect') {
    send(res, 302, '', 'text/plain; charset=utf-8', true, { location: `/ok/${file}` });
    return;
  }

  // 'ok', 'delay' and 'no-cors' all serve the real file; 'no-cors' differs only
  // in withholding the header.
  const cors = route !== 'no-cors';
  const full = resolveSafe(file);
  if (!full) {
    send(res, 403, 'forbidden', 'text/plain; charset=utf-8', cors);
    return;
  }

  let size: number;
  try {
    size = (await stat(full)).size;
  } catch {
    send(res, 404, 'not found', 'text/plain; charset=utf-8', cors);
    return;
  }

  const type = TYPES[extname(full).toLowerCase()] ?? 'application/octet-stream';
  const body = await readFile(full);

  // Media elements issue Range requests. Answering them keeps seeking honest;
  // without it some browsers refuse to scrub a remote video.
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  if (range && route !== 'no-cors') {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Number(range[2]) : size - 1;
    if (start >= size || end >= size || start > end) {
      send(res, 416, '', type, cors, { 'content-range': `bytes */${size}` });
      return;
    }
    send(res, 206, body.subarray(start, end + 1), type, cors, {
      'content-range': `bytes ${start}-${end}/${size}`,
      'accept-ranges': 'bytes',
    });
    return;
  }

  send(res, 200, body, type, cors, { 'accept-ranges': 'bytes' });
}

const server = createServer((req, res) => {
  handle(req, res).catch(() => {
    if (!res.headersSent) send(res, 500, 'server error', 'text/plain; charset=utf-8', true);
  });
});

server.listen(PORT, () => {
  console.log(`fixture origin listening on http://localhost:${PORT}`);
});
