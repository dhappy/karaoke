/**
 * Generates the deterministic fixture media used by the integration tests.
 *
 * Requires ffmpeg with libvpx. Two fixtures are produced:
 *
 *   tiny.webm  — a plain dark gradient with a moving timecode bar. The default
 *                source for sync tests: it must never be mistaken for the thing
 *                under test, so it stays visually quiet.
 *
 *   busy.webm  — deliberately hostile footage: bright, high-frequency, rapidly
 *                changing. FR-015 asks that lyric text stay legible over
 *                arbitrary video, and SC-008 names bright, visually busy content
 *                specifically. This is that content.
 *
 * Both are silent, exactly `seconds` long, and byte-reproducible for a given
 * ffmpeg build (fixed seed, fixed rate, no timestamp metadata).
 *
 * Usage: node scripts/make-fixture-media.mjs [seconds]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

const seconds = Number(process.argv[2] ?? 25);
const OUT_DIR = 'tests/fixtures';
const FPS = 30;
const SIZE = '640x360';
// Noise does not compress; the hostile fixture is smaller and shorter so it stays
// a reasonable thing to commit. It only has to cover the first few lyric lines.
const BUSY_SIZE = '320x180';
const BUSY_SECONDS = 10;

mkdirSync(dirname(`${OUT_DIR}/x`), { recursive: true });

/** Deterministic: no encode date, no random seed drift, constant quality. */
const COMMON = [
  '-y',
  '-loglevel', 'error',
  '-fflags', '+bitexact',
  '-flags:v', '+bitexact',
  '-c:v', 'libvpx',
  '-b:v', '0',
  '-crf', '40',
  '-deadline', 'good',
  '-cpu-used', '2',
  '-an',
];

function render(label, filters, out, { dur = seconds, crf = 40 } = {}) {
  execFileSync('ffmpeg', [
    '-f', 'lavfi',
    '-i', filters,
    '-t', String(dur),
    ...COMMON.map((a) => (a === '40' ? String(crf) : a)),
    out,
  ]);
  const kb = statSync(out).size / 1024;
  console.log(`${out}: ${label}, ${dur}s @ ${FPS}fps, ${kb.toFixed(0)} KiB`);
}

// Quiet source. A dark vertical gradient plus a bar that sweeps once per second,
// so a human scrubbing the fixture can see the timeline is real.
render(
  'quiet gradient + timecode sweep',
  `color=c=#0a0d14:s=${SIZE}:r=${FPS},` +
    `drawbox=x='mod(t\\,1)*iw':y=ih-12:w=6:h=12:color=#3a4d6b@1.0:t=fill,` +
    `drawbox=x=0:y=0:w=iw:h=ih:color=#101826@0.35:t=fill`,
  `${OUT_DIR}/tiny.webm`,
);

// Hostile source for SC-008: full-brightness rapidly-varying noise plus moving
// high-contrast bars. If lyrics stay legible here, the scrim is doing its job.
render(
  'bright high-frequency noise (SC-008 worst case)',
  `nullsrc=s=${BUSY_SIZE}:r=${FPS},` +
    `geq=` +
    `lum='255-40*sin((X+Y+T*90)/6)':` +
    `cb='128+120*sin((X-T*40)/9)':` +
    `cr='128+120*cos((Y+T*55)/7)'`,
  `${OUT_DIR}/busy.webm`,
  { dur: BUSY_SECONDS, crf: 50 },
);
