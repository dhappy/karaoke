<!--
SYNC IMPACT REPORT
==================
Version change: 1.0.0 -> 1.0.1
Bump rationale: PATCH. Principle I's media-element clause is scoped to `src/lib/`, which is
a clarification of what the principle always meant, not a change to what compliance requires.
No design that complied with v1.0.0 under the intended reading becomes non-compliant, and none
that violated it becomes compliant. Per this document's own versioning policy, a clarification
that does not change the meaning of compliance is a PATCH.

Modified principles:
  - I. Pure Core, Impure Edge - media-element clause scoped to `src/lib/`; added an explicit
    carve-out for `src/components/`. Title, rationale, and the other two paragraphs unchanged.

Added sections: none
Removed sections: none

Trigger: /speckit-analyze finding D1 (CRITICAL). Read literally, v1.0.0's "exactly one seam is
permitted to touch a live HTMLMediaElement" was violated by `VideoStage.svelte`, which must own
the <video> element to apply play/pause/seek/fullscreen. That reading contradicted the
principle's own title ("Impure Edge") and its rationale (keeping the pure core browser-testable).
specs/001-webvtt-karaoke-overlay/plan.md had recorded the ambiguity as an open item rather than
resolving it in the design's own favour; this amendment resolves it in the only place it could
legitimately be resolved.

Compliance status of existing artifacts at v1.0.1:
  - specs/001-webvtt-karaoke-overlay/plan.md: COMPLIANT under all five principles. Its
    Constitution Check carries an "Open item for the constitution itself" section that this
    amendment closes, and its Complexity Tracking note about VideoStage is now moot. Both are
    stale text, not violations. Re-run /speckit-plan to refresh them.
  - specs/001-webvtt-karaoke-overlay/tasks.md: COMPLIANT. T024 (VideoStage) is now
    unambiguously permitted. T004's import-boundary rule already enforces the scoped reading.

Follow-up TODOs: none. No placeholders were deferred.
-->

# Karaoke Constitution

## Core Principles

### I. Pure Core, Impure Edge

Parsing, timing, lookup, and fill logic MUST be pure TypeScript with no imports from
Svelte, no DOM access, and no media-element references. Every claim of correctness the
project makes MUST be provable by a test that runs without a browser.

The framework layer MAY read from the core. The core MUST NOT read from the framework.
This dependency arrow points one way and is not negotiable per-file.

Within `src/lib/`, exactly one module is permitted to touch a live `HTMLMediaElement`, and
it MUST be named, isolated, and disposable. Today that module is `src/lib/timing/clock.ts`.
Adding a second such module inside `src/lib/` is an amendment to this constitution, not an
implementation detail.

This limit scopes to `src/lib/` and nowhere else. Components under `src/components/` are the
impure edge this principle's title names: they own the media element, its controls, and its
error surfaces by design, and are not counted against the limit.

**Rationale**: This project's hardest guarantees are about time - drift over ten minutes,
onset within 100ms, correct state after a scrub. Those are unaffordable to verify through
a browser harness and trivial to verify against a pure function. The boundary is what
makes the test suite fast enough to actually run.

### II. The Device Is the Boundary

User media and lyric content MUST NOT leave the person's device. The application MUST
NOT require or offer accounts, sign-in, uploads, cloud storage, or sync. There MUST be no
analytics, telemetry, crash reporting, or beaconing of any kind.

Fetching a media or lyric file from an address the person typed is permitted - that is
the person directing their own browser. Transmitting their content, their filenames, or
their usage anywhere they did not name is prohibited.

The built artifact MUST remain fully functional with the network disconnected after first
load.

**Rationale**: People karaoke to recordings they own, in their homes, badly. The product
is trustworthy precisely because it is incapable of reporting on that, and capability is
the only guarantee that survives a change of maintainer.

### III. Frame Budget Is Correctness

Playback position MUST be read from the media element on every frame. It MUST NOT be
integrated, accumulated, extrapolated, or mirrored into a second clock. Any design that
advances a local time value by a frame delta is prohibited.

Per-frame work MUST be O(1) in the size of the lyric file. Per-frame DOM mutation MUST be
bounded by a small constant and MUST NOT scale with line length.

The playhead MUST NOT be held in reactive framework state. Frame-rate values are written
imperatively; reactive state changes at the granularity of which lines are on screen.

**Rationale**: In this product, being smooth *is* being correct - a highlight that stutters
or drifts has failed at the only job it has. Reading rather than accumulating makes
zero-drift structural instead of a tuning exercise, and keeping the playhead out of
reactivity is what keeps sixty frames a second affordable.

### IV. Never a Blank Screen

Malformed input MUST degrade, never abort. A file with usable cues MUST play, with the
unusable cues repaired or skipped and reported as warnings.

Every failure surfaced to a person MUST name what went wrong and what they can do about
it, in plain language. Raw error codes, stack traces, exception text, and untrusted file
content MUST NOT be rendered as user-facing messages.

A failed load MUST NOT destroy working state. Previously loaded content stays usable, and
new content is swapped in only on success.

Parsers MUST be total: no input, including binary garbage, may throw.

**Rationale**: The input is a text file of unknown provenance that the person did not
write and cannot debug. Every silent failure becomes "the app is broken" - which, from
where they are standing, it is.

### V. Earn Every Dependency

The runtime dependency budget is zero. Svelte and Vite are build-time and framework
infrastructure; anything that ships code into the bundle at runtime requires explicit
justification recorded in the feature's `research.md`.

Platform APIs MUST be preferred over reimplementation. Where the platform offers a
capability, the burden of proof lies on writing our own.

Where a platform API *is* rejected, the rejection MUST be documented as a decision with
its rationale and the alternatives considered. "We wrote our own" is an acceptable
outcome; "we wrote our own without saying why" is not.

**Rationale**: Both failure modes are real and they pull opposite ways - a dependency
adopted for one function becomes permanent surface area, and a platform API rejected on
reflex becomes a parser nobody can justify. The requirement is not a verdict either way;
it is that the reasoning survives in writing.

## Quality Standards

**Accessibility.** Lyric text contrast MUST be measured against a known composited
surface, never against video. Any design that makes legibility depend on unbounded footage
is untestable and therefore non-compliant. Colour is the primary sung/unsung distinction,
but it MUST always be accompanied by the horizontal position of the fill boundary as a
second channel - colour alone is never the sole carrier of state. Interactive targets MUST
be at least 44px.

**Browser floor.** The supported floor MUST be stated explicitly and MUST be justified by
a specific platform capability the product depends on. It is currently set by
`Intl.Segmenter`. Raising or lowering the floor requires updating the stated justification.

**Correctness of text handling.** Word and grapheme segmentation MUST be script-correct.
Splitting on whitespace or on code units is prohibited. A highlight boundary MUST NOT fall
inside a grapheme cluster.

**Performance.** Smoothness targets are acceptance criteria, not aspirations. A change that
drops frames during continuous playback is a regression regardless of what else it improves.

## Development Workflow

Features follow the Spec Kit flow: `/speckit-specify` -> `/speckit-clarify` (when needed) ->
`/speckit-plan` -> `/speckit-tasks` -> `/speckit-implement`.

The Constitution Check gate in `plan.md` MUST be evaluated against this document before
Phase 0 research and re-evaluated after Phase 1 design. A gate that passes because no
principles exist is not a pass; it is a blocked gate.

Design decisions that trade off against a principle MUST be recorded in the feature's
`research.md` with the alternatives considered, and any accepted violation MUST appear in
the plan's Complexity Tracking table with its justification. An unjustified violation
blocks the plan.

Pure-core modules MUST have unit tests. Behaviour a person can observe MUST have an
integration test. Contracts under `specs/*/contracts/` are the authority on module
behaviour; where code and contract disagree, one of them is a bug and the disagreement
MUST be resolved rather than tolerated.

## Governance

This constitution supersedes conflicting practice, convention, and preference. Where a
principle and a habit disagree, the principle wins until amended.

**Amendment procedure.** Amendments require a written rationale, an explicit version bump,
and an updated Sync Impact Report prepended to this file. Amendments are made through
`/speckit-constitution` so that the report and version stay consistent with the content.

**Versioning policy.** Semantic versioning applies to governance:

- **MAJOR** - a principle is removed or redefined in a way that invalidates prior compliance.
- **MINOR** - a principle or section is added, or existing guidance is materially expanded.
- **PATCH** - clarification, wording, or typo fixes that do not change what compliance means.

**Compliance review.** Every plan evaluates the Constitution Check gate. Every review
verifies that accepted violations are justified in Complexity Tracking rather than merely
present. Complexity is justified by a named problem it solves, never by preference.

**Version**: 1.0.1 | **Ratified**: 2026-08-17 | **Last Amended**: 2026-08-18
