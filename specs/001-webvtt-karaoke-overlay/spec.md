# Feature Specification: WebVTT Karaoke Overlay

**Feature Branch**: `master`

**Created**: 2026-08-17

**Status**: Draft

**Input**: User description: "I want a Svelte application that reads WebVTT file and overlays the text on top of a music video appropriate for karaoke, incrementally coloring in the words as they are sung."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sing along with word-by-word highlighting (Priority: P1)

A person opens the application, points it at a music video and a matching WebVTT lyric file, and presses play. The lyric line that is currently being sung appears over the video. As the singer moves through the line, each word fills with a highlight color at the moment it is sung, so the person always knows exactly where they are in the line.

**Why this priority**: This is the entire point of the product. Without synchronized word-level highlighting over a playing video, nothing else in the feature has value. Loading a pair of files and seeing the words color in on beat is the smallest slice that a person can actually sing to.

**Independent Test**: Provide one video file and one WebVTT file containing word-level timing, press play, and confirm the overlay shows the correct line and that each word changes color at its timed moment for the full duration of the song.

**Acceptance Scenarios**:

1. **Given** a video and a matching WebVTT file have been loaded, **When** the person starts playback, **Then** the lyric line whose time range contains the current playback position is displayed over the video.
2. **Given** a lyric line is displayed and playback is running, **When** playback passes the start time of a word in that line, **Then** that word is shown in the "already sung" color while the remaining words stay in the "not yet sung" color.
3. **Given** a word is currently being sung, **When** playback advances through that word's time range, **Then** the highlight color fills across the word progressively rather than switching all at once.
4. **Given** playback reaches a gap between lyric lines, **When** no line covers the current position, **Then** the previous line is cleared from the overlay and the video remains unobstructed.
5. **Given** playback reaches the end of the lyric file, **When** the video continues, **Then** the overlay clears and playback is unaffected.

---

### User Story 2 - Load my own video and lyric files (Priority: P2)

A person selects a video file and a WebVTT file from their own device (by file picker or by dragging them onto the window) and the application prepares them for karaoke without any upload, account, or setup step.

**Why this priority**: The highlighting engine is worthless without a way to get content in, but a working demonstration can be shown with a fixed pair of files. Making loading arbitrary and self-service is the first expansion beyond the core.

**Independent Test**: Drag an arbitrary video file and an arbitrary WebVTT file onto the application, confirm both are accepted, that the lyric line count matches the file, and that karaoke begins on play.

**Acceptance Scenarios**:

1. **Given** the application is open with nothing loaded, **When** the person selects a video file and a WebVTT file, **Then** both are accepted and the player becomes ready to play.
2. **Given** a video and lyric file are already loaded, **When** the person loads a different lyric file, **Then** the new lyrics replace the old ones without requiring the video to be reloaded.
3. **Given** the person selects a file that is not valid WebVTT, **When** the application attempts to read it, **Then** a plain-language message explains the file could not be read as lyrics and the previously loaded content is left untouched.
4. **Given** the person selects a media file the browser cannot play, **When** loading is attempted, **Then** a plain-language message names the problem and invites them to choose another file.

---

### User Story 3 - Control playback and correct the sync (Priority: P3)

A person pauses, resumes, scrubs backwards to re-sing a verse, and — when the lyric file runs slightly ahead of or behind the recording — nudges the lyric timing until words color in exactly on the beat.

**Why this priority**: Practising a song means repeating sections, and real-world lyric files are frequently offset from the recording they were written for. Both make the difference between a toy and something usable, but neither is required for a first demonstration.

**Independent Test**: While a song plays, scrub to an arbitrary point and confirm the overlay immediately shows the correct line with the correct words already colored; then apply a timing offset and confirm the highlighting shifts by that amount.

**Acceptance Scenarios**:

1. **Given** playback is running, **When** the person pauses, **Then** the overlay freezes with the highlight exactly where it was and does not continue advancing.
2. **Given** playback is paused mid-line, **When** the person resumes, **Then** highlighting continues from the frozen position without jumping or replaying words.
3. **Given** a song is playing, **When** the person scrubs to a position in the middle of a lyric line, **Then** the overlay immediately shows that line with all words before the position colored as sung and all words after it uncolored.
4. **Given** the lyrics are consistently early or late against the recording, **When** the person applies a timing offset, **Then** every lyric line and word shifts by that offset and the offset persists for the rest of the session.
5. **Given** playback speed has been changed, **When** the song plays, **Then** highlighting tracks the audible position at the new speed.

---

### User Story 4 - Read the words comfortably on any screen (Priority: P4)

A person adjusts how the lyrics are presented — larger text, a different highlight color, lyrics anchored at the bottom or top — and can see the upcoming line and a countdown before a line begins, so they can breathe in on time and never lose their place against a busy video background.

**Why this priority**: These qualities separate a usable karaoke screen from a technically correct one, but the core experience is demonstrable without them.

**Independent Test**: Change each display setting in turn during playback and confirm the overlay updates immediately and remains legible over both dark and bright video content.

**Acceptance Scenarios**:

1. **Given** lyrics are displayed over a bright, high-detail section of video, **When** the person reads the overlay, **Then** the text remains legible without needing to change any setting.
2. **Given** a lyric line is displayed, **When** the next line is within the configured preview window, **Then** the upcoming line is shown in a secondary, clearly de-emphasized style.
3. **Given** a lead-in gap precedes the next line, **When** the gap exceeds the countdown threshold, **Then** a countdown indicator shows how long until singing begins and disappears exactly when the line starts.
4. **Given** the person increases the text size, **When** a long lyric line is displayed, **Then** the line wraps and remains fully visible within the video frame rather than being clipped.
5. **Given** the application is opened on a narrow screen, **When** lyrics are displayed, **Then** the overlay scales to remain readable and does not obscure playback controls.

---

### Edge Cases

- **Line with no word-level timing**: A WebVTT cue that carries no inline word timings must still highlight — the application distributes the line's duration across its words so the fill advances smoothly instead of the whole line flashing at once.
- **Overlapping cues**: Two lyric lines whose time ranges overlap (duets, backing vocals) must both be shown and highlighted independently rather than one silently replacing the other.
- **Zero-length or out-of-order timings**: A cue whose end time is at or before its start time, or a file whose cues are not in chronological order, must not stall or corrupt the highlighting of surrounding lines.
- **Timings past the end of the video**: Lyric lines timed beyond the video's duration must be ignored without error.
- **Empty or lyric-free file**: A valid WebVTT file with no cues loads successfully and simply shows no overlay.
- **Very long line**: A line too long to fit the frame at the current text size must wrap or scale rather than being cut off.
- **Non-Latin scripts and combining marks**: Word splitting and progressive fill must behave correctly for scripts that do not separate words with spaces and for characters composed of multiple code points.
- **Markup and speaker labels inside cues**: Styling tags, voice/speaker annotations, and positioning hints inside cues must not appear as literal text in the overlay.
- **Rapid scrubbing**: Dragging the playhead quickly back and forth must leave the overlay showing the correct state for wherever the playhead lands, with no stale or duplicated lines.
- **Tab hidden or window backgrounded**: On returning to the application, the overlay must match the actual playback position rather than resuming from where it left off.
- **Video with no audio track / silent video**: Playback and highlighting proceed normally; no audio analysis is required.
- **Mismatched pair**: Loading a lyric file that belongs to a different song is not detectable by the application; the person is responsible for the pairing, and the timing offset control is not a remedy for it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The application MUST accept a WebVTT lyric source and a video source chosen by the person, and begin karaoke playback without requiring an account, sign-in, or upload to any server.
- **FR-002**: The application MUST parse WebVTT content into an ordered set of timed lyric lines, preserving each line's start time, end time, and text.
- **FR-003**: The application MUST read word-level timing where the lyric file provides it, so that individual words within a line have their own start times.
- **FR-004**: The application MUST derive per-word timings for any line that lacks them, distributing the line's duration across its words so that highlighting still advances continuously through the line.
- **FR-005**: The application MUST display, over the video, the lyric line or lines whose time range contains the current playback position, and MUST clear the overlay when no line applies.
- **FR-006**: The application MUST render each displayed line with three visually distinct states — already sung, currently being sung, and not yet sung — using color as the primary distinction.
- **FR-007**: The application MUST fill the highlight progressively across the word currently being sung, in proportion to how far playback has advanced through that word's time range.
- **FR-008**: The highlight position MUST track the actual playback position continuously and smoothly, without visible stepping or drift over the course of a full-length song.
- **FR-009**: The application MUST keep the overlay correct across every playback state change — play, pause, seek, playback-rate change, and end of media — showing the state that corresponds to the playhead's actual position at all times.
- **FR-010**: The application MUST freeze the highlight while playback is paused and resume from the same point without replaying or skipping words.
- **FR-011**: The application MUST provide standard playback controls: play/pause, seek, volume/mute, and fullscreen.
- **FR-012**: The application MUST keep the lyric overlay correctly positioned and proportioned in fullscreen and at any window size, including narrow screens.
- **FR-013**: The application MUST let the person apply a timing offset that shifts all lyric timings earlier or later relative to the video, with the effect visible immediately and retained for the session.
- **FR-014**: The application MUST let the person adjust presentation of the overlay — at minimum text size, highlight color scheme, and vertical placement of the lyrics within the frame — with changes taking effect immediately.
- **FR-015**: The application MUST ensure lyric text stays legible over arbitrary video content, including bright and visually busy footage.
- **FR-016**: The application MUST show the upcoming lyric line in a de-emphasized style when it falls within the preview window, so the person can prepare for it.
- **FR-017**: The application MUST show a countdown indicator during lead-in gaps that exceed a defined threshold, ending exactly when the next line begins.
- **FR-018**: The application MUST strip WebVTT markup, speaker/voice annotations, and positioning hints from displayed text so that no markup is visible as literal characters.
- **FR-019**: The application MUST handle multiple simultaneously active lyric lines by displaying and highlighting each independently.
- **FR-020**: The application MUST tolerate malformed, out-of-order, zero-length, and out-of-range cues by skipping or repairing the affected entries while continuing to play the rest of the file.
- **FR-021**: The application MUST report load and parse failures in plain language that names what went wrong and what the person can do, and MUST leave any previously loaded content usable.
- **FR-022**: The application MUST let the person replace the lyric file or the video independently, without restarting the application or reloading the other.
- **FR-023**: The application MUST split lyric text into words in a way that is correct for non-Latin scripts and for characters composed of multiple code points, so that highlighting never splits a character.
- **FR-024**: The application MUST support lyric files and videos of full song length (at least 10 minutes) without degradation in highlighting accuracy or smoothness.

### Key Entities

- **Lyric Source**: The WebVTT document supplied by the person. Has an origin (chosen file or address), a load status, and a collection of lyric lines.
- **Lyric Line**: One timed unit of lyrics — a start time, an end time, display text stripped of markup, and an ordered list of word tokens. May overlap other lines in time.
- **Word Token**: The smallest highlighted unit — its text, its start time, its end time, and its position within the line. Timings are either read from the lyric source or derived from the line's duration.
- **Media Source**: The music video supplied by the person — its origin, duration, and playability status.
- **Playback State**: The current position, whether playback is running, the playback rate, and the applied timing offset. This is the single source of truth that drives which line is shown and how far the highlight has filled.
- **Display Preferences**: Text size, highlight color scheme, vertical placement, preview window, and countdown threshold. Applies to the current session.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A person who arrives with a video file and a matching lyric file reaches synchronized karaoke playback in under 60 seconds and no more than three interactions.
- **SC-002**: For lyric files that carry word-level timing, a word begins coloring within one tenth of a second of the moment it is sung, judged against the file's own timings, for at least 99% of words in a full-length song.
- **SC-003**: The highlight advances smoothly enough that no stepping or stutter is perceptible during continuous playback on a typical laptop or phone from the last five years.
- **SC-004**: After any seek, the overlay shows the correct line and highlight position within a quarter of a second, with no stale line ever left on screen.
- **SC-005**: Highlighting remains as accurate at the ten-minute mark of a song as at the first line — accumulated drift is not observable.
- **SC-006**: 100% of lyric files that a standards-conformant WebVTT reader accepts are loaded and played; files that are not conformant produce an explanatory message rather than a blank screen or silent failure.
- **SC-007**: In observed use, at least 9 of 10 first-time users can start a song, pause, scrub back to re-sing a verse, and correct a timing offset without assistance.
- **SC-008**: Lyric text meets recognized contrast guidance against both the brightest and darkest footage tested, at every supported text size.
- **SC-009**: Lines with no word-level timing still highlight continuously across the line, with no line ever appearing fully colored at its start or fully uncolored at its end.

## Assumptions

These are reasonable defaults chosen where the feature description did not specify. Each is a candidate for revision during `/speckit-clarify`.

- **Content is supplied by the person, not by the product.** The application ships with no song catalog. The person provides both the video and the WebVTT file — primarily as local files (picker or drag-and-drop), with direct media/lyric addresses also accepted. Media never leaves the person's device.
- **The application runs entirely in the browser.** No server component, no account, no persistence beyond the current session. Display preferences and the timing offset last for the session only.
- **The lyric file is the authority on timing.** The application performs no audio analysis, pitch detection, or automatic lyric alignment; accuracy is exactly as good as the supplied file, modulated by the person's timing offset.
- **Word-level timing comes from the lyric file's inline timestamps where present.** Where a line has none, per-word timings are derived by distributing the line's duration across its words in proportion to their length. Syllable-level highlighting is not attempted beyond what the file expresses.
- **"Coloring in" means a progressive fill across the current word**, not a whole-word snap and not a per-letter jump — the visual convention people expect from commercial karaoke.
- **Two lyric lines are visible at most in normal operation**: the active line and a de-emphasized preview of the next. Overlapping simultaneous lines are the exception and are shown together.
- **Single person, single screen.** No shared or networked sessions, no second "singer" display.
- **Modern evergreen browsers on desktop and mobile** are the target; the video formats supported are whatever the person's browser can play.

## Out of Scope

- Authoring, editing, or re-timing lyric files within the application (beyond the whole-file timing offset).
- Automatic lyric transcription or forced alignment of lyrics to audio.
- Scoring, pitch detection, microphone input, or vocal removal.
- A song catalog, library management, playlists, or queueing.
- Integration with streaming or video-hosting services.
- Multi-user, networked, or remote-control sessions.
- Accounts, cloud storage, or cross-device sync.
- Subtitle formats other than WebVTT.
