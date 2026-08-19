import tseslint from 'typescript-eslint';

/**
 * Constitution I — Pure Core, Impure Edge.
 *
 * `src/lib/` is pure TypeScript. It may not import the framework, may not reach
 * into the browser, and may not reference a media element. The one exception is
 * `src/lib/timing/clock.ts`, which the constitution names as the single module
 * inside `src/lib/` permitted to touch a live HTMLMediaElement.
 *
 * This is a build failure, not a code-review habit. T072 proves it fires.
 */
export default tseslint.config(
  {
    ignores: [
      'dist/',
      'build/',
      'coverage/',
      'node_modules/',
      'test-results/',
      'playwright-report/',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['src/lib/**/*.ts'],
    ignores: ['src/lib/timing/clock.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['svelte', 'svelte/*'],
              message: 'Constitution I: src/lib/ is pure — no framework imports.',
            },
            {
              group: ['**/components/*', '**/state/*'],
              message: 'Constitution I: the core must not read from the edge.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'document', message: 'Constitution I: src/lib/ has no DOM access.' },
        { name: 'window', message: 'Constitution I: src/lib/ has no DOM access.' },
        // link.ts encodes and decodes a fragment; it must never READ or WRITE
        // one. The caller owns navigation (research D10). Without this, the
        // codec would quietly grow a dependency on live browser state and stop
        // being provable in node.
        { name: 'location', message: 'Constitution I: src/lib/ does not touch navigation — the caller owns it.' },
        { name: 'history', message: 'Constitution I: src/lib/ does not touch navigation — the caller owns it.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSTypeReference > Identifier[name=/^HTML(Media|Video|Audio)Element$/]',
          message: 'Constitution I: only src/lib/timing/clock.ts may reference a media element.',
        },
      ],
    },
  },
);
