/**
 * Development- and test-only source loader.
 *
 * Exists so User Story 1 is independently testable without the file picker,
 * which is User Story 2's deliverable. Without it, US1 could not be validated
 * before US2 shipped, inverting the priority order.
 */
const DEV_LYRICS = '/tests/fixtures/word-timed.vtt';
const DEV_MEDIA = '/tests/fixtures/tiny.webm';

export interface DevFixture {
  readonly vttText: string;
  readonly mediaUrl: string;
  readonly vttName: string;
}

export async function loadDevFixture(
  vttPath: string = DEV_LYRICS,
  mediaPath: string = DEV_MEDIA,
): Promise<DevFixture> {
  const res = await fetch(vttPath);
  if (!res.ok) throw new Error(`fixture ${vttPath} not reachable (${res.status})`);
  return {
    vttText: await res.text(),
    mediaUrl: mediaPath,
    vttName: vttPath.split('/').pop() ?? 'fixture.vtt',
  };
}
