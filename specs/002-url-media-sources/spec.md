# Feature Specification: URL Media Sources

**Feature Branch**: `master`

**Created**: 2026-08-18

**Status**: Draft

**Input**: User description: "Allow the video & webvtt to be specified as URLs as well as via files."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sing to a video and lyrics that live on the web (Priority: P1)

A person has a music video and a matching WebVTT file hosted somewhere they can reach — their own web server, a file host, a repository, a home NAS. Instead of downloading both files and then picking them out of a downloads folder, they paste each address into the application and press play.

**Why this priority**: This is the whole request. Everything else in this feature is a refinement of it. A person who can paste two addresses and sing has received the entire value, even if nothing else here is built.

**Independent Test**: Paste an address for a playable video and an address for a valid WebVTT file, confirm both load, and confirm karaoke plays with the same word-by-word highlighting a locally chosen pair produces.

**Acceptance Scenarios**:

1. **Given** the application is open with nothing loaded, **When** the person supplies a reachable address for a playable video and a reachable address for a valid WebVTT file, **Then** both are accepted and the player becomes ready to play.
2. **Given** a video and lyrics loaded from addresses, **When** playback runs, **Then** highlighting, seeking, offset, and every display preference behave exactly as they do for locally chosen files.
3. **Given** an address has been supplied, **When** the application is loading it, **Then** the person sees that loading is in progress and can tell which of the two sources is still pending.
4. **Given** an address that points at something that is not lyrics, **When** the application reads it, **Then** a plain-language message explains that the address did not yield readable lyrics and the previously loaded content is left untouched.

---

### User Story 2 - Mix a local file with a remote address (Priority: P2)

A person has the video on their laptop but found the lyrics online — or the reverse. They supply one source as a file and the other as an address, in either order, and the pair works.

**Why this priority**: This is the common real case rather than the tidy one: video files are large and local, lyric files are small and shared. Supporting only all-file or all-address pairs would leave the most likely combination unserved. It ranks below P1 only because P1 must exist first.

**Independent Test**: Choose a video file from the device, paste an address for a WebVTT file, and confirm karaoke plays; then reverse the two and confirm it plays again.

**Acceptance Scenarios**:

1. **Given** a video file has been chosen from the device, **When** the person supplies a lyric address, **Then** the lyrics load and pair with the already-loaded video without the video reloading.
2. **Given** lyrics have been loaded from an address, **When** the person chooses a video file from the device, **Then** the video loads and pairs with the already-loaded lyrics without the lyrics reloading or losing the applied timing offset.
3. **Given** a source was loaded from an address, **When** the person replaces just that source with a local file, **Then** the replacement succeeds and the other source is unaffected.

---

### User Story 3 - Understand and recover when an address does not work (Priority: P3)

A person pastes an address that is mistyped, unreachable, requires permission, points at a web page rather than a media file, or is refused by the browser. Instead of a blank screen or a silent nothing, they are told in plain language what went wrong and what they can try, and whatever was already playing keeps working.

**Why this priority**: Addresses fail in far more ways than local files do, and every one of those failures is invisible to the person without being named. This is what makes the feature usable rather than merely present, but P1 can be demonstrated with addresses that work.

**Independent Test**: Supply, in turn, a mistyped address, an address that returns "not found", an address that the browser refuses to load cross-origin, and an address for an ordinary web page; confirm each produces a distinct plain-language explanation and that previously loaded content still plays.

**Acceptance Scenarios**:

1. **Given** the person supplies text that is not a usable address, **When** they submit it, **Then** the application says so before attempting any network request.
2. **Given** an address that cannot be reached or returns an error, **When** loading is attempted, **Then** a plain-language message names the problem and invites the person to check the address or try another, without exposing raw error codes or response bodies.
3. **Given** an address the browser refuses to load because the host does not permit it, **When** loading fails, **Then** the message explains that the host is not allowing the file to be read by another site and suggests downloading the file and choosing it locally instead.
4. **Given** a song is already playing, **When** any address fails to load, **Then** the current video, lyrics, and playback position are untouched and playback continues.
5. **Given** an address points at a page on a video-hosting or streaming service rather than at a media file, **When** loading is attempted, **Then** the message explains that a direct address to a media file is required, rather than failing generically.

---

### User Story 4 - Share a ready-to-play link (Priority: P4)

A person has a video and a lyric file paired up and the timing corrected. They copy the application's link and send it to a friend, or bookmark it for next week. Opening that link brings the pairing back exactly as it was — both sources loading, the timing correction already applied — and the only thing left to do is press play.

**Why this priority**: This is what makes addresses worth having over files: a pairing becomes something a person can keep and pass on. It ranks below failure handling because a link that fails silently is worse than no link at all, and above paste-speed because it is a capability rather than a convenience.

**Independent Test**: Load a pair from two addresses, apply a timing offset, copy the link, open it in a fresh window, and confirm the same two sources load with the same offset applied and no further input required beyond pressing play.

**Acceptance Scenarios**:

1. **Given** a video and lyrics have loaded from addresses, **When** the person copies the application's link and opens it fresh, **Then** both sources load from the same addresses and the pairing is ready to play.
2. **Given** a timing offset has been applied, **When** the link is opened, **Then** the same offset is already in effect, so the recipient's words colour in on beat without repeating the correction.
3. **Given** sources are loading or being replaced, **When** the application's address updates to match, **Then** playback is not interrupted, the application does not reload, and the person's back button is not filled with an entry per change.
4. **Given** the video is a local file and the lyrics came from an address, **When** the person copies the link, **Then** the link carries the lyric address, omits the local file entirely, and says plainly that it is incomplete.
5. **Given** a link is opened whose addresses fail to load, **When** loading is attempted, **Then** the same plain-language failures appear as for hand-typed addresses and the application remains usable rather than blank.
6. **Given** a link arrives from someone else, **When** it is opened, **Then** the application shows which addresses it is about to contact, so the person can see where their browser is being pointed.

---

### User Story 5 - Supply addresses quickly and repeatedly (Priority: P5)

A person moves between songs during a session, pasting new addresses each time. Supplying an address is as fast as picking a file: paste and go, with the option to drop or paste a link directly onto the application rather than hunting for the right input.

**Why this priority**: Comfort and speed, not capability. A single plain input satisfies P1 through P3; this is what stops the feature from feeling like a debug affordance.

**Independent Test**: Paste an address onto the application without first focusing an input, and confirm it is routed to the correct source and loaded.

**Acceptance Scenarios**:

1. **Given** the application is focused, **When** the person pastes or drops an address, **Then** it is routed to lyrics or to video according to what it appears to be, and the person can correct that routing if it guessed wrong.
2. **Given** an address is being entered, **When** the person submits it, **Then** the loading attempt starts without further confirmation steps.
3. **Given** a source is currently loading from an address, **When** the person supplies a different address for the same source, **Then** the earlier attempt is abandoned and only the newer one takes effect.

---

### Edge Cases

- **Address that redirects**: An address that redirects to the real file loads normally; the person is not asked to resolve redirects themselves.
- **Cross-origin refusal on lyrics but not video**: A host may allow a video to play while refusing to let its lyric file be read by another site. Each source reports its own outcome; one failing must never mark the other as failed.
- **Very large remote video**: A large file loading over a slow connection must show progress and must not appear frozen or failed while it is still arriving.
- **Address requiring credentials**: An address behind a login, or a signed address that has expired, produces a permission-related explanation, not a generic failure. The application never prompts for or stores credentials.
- **Insecure address from a secure page**: An address the browser will not load because it is not itself secure produces a message naming that as the reason rather than a generic network failure.
- **Address whose name or declared type is misleading**: Content is judged by whether it parses as WebVTT or plays as media, not by the address's file extension.
- **Address that returns an error page with a success status**: Must be reported as unreadable lyrics or an unplayable video, not accepted as content.
- **Slow or hanging address**: An attempt that makes no progress must eventually give up with an explanation rather than leaving the person waiting indefinitely.
- **Address supplied while a previous attempt is still running**: The newest request wins; a slow earlier response must never overwrite content loaded after it.
- **Local file and address supplied for the same source at once**: The most recent choice wins, and it is unambiguous which one is currently loaded.
- **Address containing spaces, non-ASCII characters, or an already-encoded path**: Loads if the browser can resolve it; the path is never silently corrupted.
- **Loss of connectivity mid-playback**: A remote video that stops arriving mid-song reports a plain-language interruption; lyrics already parsed remain loaded and correct.
- **Whitespace, wrapping angle brackets, or trailing punctuation on a pasted address**: Trimmed rather than rejected, since these are artifacts of copying from chat messages and documents.
- **An address supplied for a source that is mid-playback**: Replacing the video while a song plays is permitted; the overlay must not be left showing a line from the replaced pairing.
- **Shareable link carrying only one source**: Loads that source and waits for the other, rather than refusing the link or blanking the screen.
- **Shareable link opened with no connectivity**: Reports that the addresses could not be reached and leaves the application usable for locally chosen files.
- **A link-loaded source replaced by a local file**: The application's address drops that source, since a local file cannot be represented; the link remains valid for whatever is left.
- **A link carrying an offset but no sources**: The offset is held and applies to whatever is loaded next, rather than being discarded or causing a failure.
- **A link carrying parameters the application does not recognize**: Ignored silently; the recognized parts still load.
- **A link from an untrusted sender**: Opening it points the person's browser at addresses they did not choose. The application must name those addresses rather than contacting them invisibly, and must never treat any part of a link as markup or as an instruction.
- **Addresses too long for the browser's own address limit**: The pairing still plays; only the shareability of that particular link is affected, and the person is told rather than left with a silently truncated link.
- **A pairing whose sources are both local files**: There is nothing to share. The copy action must say so instead of offering an empty link.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-101**: The application MUST allow the video source to be supplied as an address, in addition to the existing local-file paths (picker and drag-and-drop).
- **FR-102**: The application MUST allow the WebVTT lyric source to be supplied as an address, in addition to the existing local-file paths.
- **FR-103**: The application MUST allow the video and the lyric source to be supplied independently and in any combination — both files, both addresses, or one of each — and in any order.
- **FR-104**: Content loaded from an address MUST be indistinguishable in behaviour from content loaded from a file once loaded: highlighting, seeking, pause and resume, playback rate, timing offset, and every display preference MUST work identically.
- **FR-105**: The application MUST validate that supplied text is a usable address before attempting to load it, and MUST report unusable text without making a network request.
- **FR-106**: The application MUST normalize the ordinary artifacts of a copied address — surrounding whitespace, wrapping angle brackets, and trailing sentence punctuation — rather than rejecting it.
- **FR-107**: The application MUST show, per source, that a load from an address is in progress, and MUST distinguish "still loading" from "loaded" and from "failed".
- **FR-108**: The application MUST abandon an in-flight load when a newer source is supplied for the same slot, and MUST guarantee that a late response from an abandoned attempt never replaces newer content.
- **FR-109**: The application MUST give up on an attempt that has made no progress within a bounded time, and MUST explain the timeout in plain language.
- **FR-110**: The application MUST report address-load failures in plain language that distinguishes, at minimum: an unusable address, an unreachable host, an error response, a refusal by the host to allow another site to read the file, a permission requirement, and content that could not be read as lyrics or played as video.
- **FR-111**: The application MUST NOT render raw error codes, exception text, response bodies, or any part of untrusted fetched content as a user-facing message.
- **FR-112**: A failed load from an address MUST leave previously loaded video, lyrics, playback position, timing offset, and display preferences untouched and usable.
- **FR-113**: The application MUST judge fetched content by whether it parses as WebVTT or plays as media, not by the address's file extension or declared type alone.
- **FR-114**: The application MUST recognize addresses that point at a page on a video-hosting or streaming service and explain that a direct address to a media file is required, rather than reporting a generic failure.
- **FR-115**: The application MUST record, for each loaded source, whether it came from a file or an address, and MUST show which address is currently loaded so the person can confirm the pairing.
- **FR-116**: The application MUST accept an address that is pasted or dropped onto it without a specific input being focused first, routing it to video or lyrics according to what it appears to be, and MUST let the person override that routing.
- **FR-117**: The application MUST contact an address only when the person has supplied it. It MUST NOT contact any address the person did not name, and MUST NOT transmit the person's addresses, filenames, or content anywhere.
- **FR-118**: The application MUST minimize what it discloses to a host it fetches from, sending no more than the request needed to retrieve the file and nothing identifying the person, the application, or the other source in the pair.
- **FR-119**: The application MUST NOT prompt for, transmit, or store credentials for any address.
- **FR-120**: A remote video that is interrupted mid-playback MUST report the interruption in plain language while leaving already-parsed lyrics loaded and correct.
- **FR-121**: Adding address support MUST NOT make any file-based path depend on a network request; locally chosen files MUST continue to work with the network disconnected.
- **FR-122**: The application MUST reflect the currently loaded addresses in its own address as sources load, so that the person can bookmark or copy a link that reproduces the pairing.
- **FR-123**: The application MUST restore a pairing from such a link when one is opened, loading each address it carries and reporting progress and failure exactly as it does for addresses supplied by hand.
- **FR-124**: The application MUST construct the shareable link so that the addresses it carries are never transmitted to the site's own host, to any other server, or attached to any onward request. The person's choice of content MUST remain on their device even though it is written into a link.
- **FR-125**: The shareable link MUST carry the applied timing offset, so that a corrected pairing arrives corrected. It MUST NOT carry display preferences, which belong to whoever is reading the screen rather than to the pairing.
- **FR-126**: The shareable link MUST NOT carry local file names or any part of local file content. A source loaded from a file MUST simply be absent from the link.
- **FR-127**: When only one source can be represented — because the other is a local file or has not loaded — the application MUST still produce a usable link carrying what it can, and MUST make plain that the link is incomplete.
- **FR-128**: The application MUST show which addresses an opened link is loading, so the person can see where their browser is being pointed rather than discovering it only from the result.
- **FR-129**: The application MUST treat an address arriving from a link as exactly as untrusted as one typed by hand — validated the same way, subject to the same failure reporting, and never rendered as markup or acted on as anything but an address to retrieve.
- **FR-130**: The application MUST ignore unrecognized or malformed parts of an opened link without failing the parts it does understand.
- **FR-131**: Reflecting sources in its own address MUST NOT reload the application, interrupt playback, or add a history entry per source change.
- **FR-132**: The application MUST provide an explicit action to copy the shareable link, so that sharing is something the person chooses rather than something that happens to them.

### Key Entities

- **Source Origin**: Which of two ways a loaded source arrived — a chosen local file, identified by its name, or an address, identified by the address itself. Every loaded source has exactly one origin, and the origin is visible to the person.
- **Address Load Attempt**: One attempt to retrieve one source from one address. Has a target slot (video or lyrics), a state (validating, in progress, succeeded, failed, abandoned), and, on failure, a failure category.
- **Shareable Link**: The application's own address, carrying whichever sources are held as addresses plus the applied timing offset. Carries no local file names, no file content, and no display preferences. Is complete when both sources are addresses, incomplete when only one is, and empty when neither is.
- **Failure Category**: The kind of thing that went wrong — unusable address, unreachable, error response, refused by host, permission required, timed out, unreadable as lyrics, unplayable as video, streaming-service page. Each maps to one plain-language explanation and a suggested next step.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-101**: A person holding two working addresses reaches synchronized karaoke playback in under 60 seconds and no more than four interactions, without downloading either file first.
- **SC-102**: A pair loaded from addresses produces highlighting indistinguishable from the same pair loaded as local files — identical line selection, identical word onsets, and identical behaviour after a seek.
- **SC-103**: Every failure category produces a distinct, plain-language message naming a next step; none produces a blank screen, a silent failure, or a raw code.
- **SC-104**: In 100% of failed address loads, previously loaded content remains playable and the playback position is unchanged.
- **SC-105**: At least 9 of 10 first-time users load a song from two addresses without assistance; among those given one deliberately broken address, at least 9 of 10 correctly identify which source failed and why from the message alone.
- **SC-106**: An address that makes no progress is abandoned with an explanation within a bounded, stated time in 100% of attempts — the interface is never left in an indefinite loading state.
- **SC-107**: A late response from an abandoned attempt never replaces newer content, verified under rapid successive submissions.
- **SC-108**: The application contacts zero addresses the person did not supply, verified over a full session including failed loads.
- **SC-109**: With the network disconnected, every locally chosen file loads and plays exactly as it did before this feature existed.
- **SC-110**: A link copied from a working pairing, opened in a fresh window, reproduces the same two sources and the same timing offset in 100% of attempts — the recipient's first and only required interaction is pressing play.
- **SC-111**: The contents of a shareable link — the addresses a person chose and their timing correction — reach no server, including the one hosting the application, verified across opening, editing, and sharing a link.
- **SC-112**: Reflecting sources in the application's address never interrupts playback and never adds more than one history entry per deliberate navigation, verified across a session of at least ten source changes.
- **SC-113**: Every incomplete or empty link is described as such before the person sends it, so no one shares a link that silently omits half the pairing.

## Assumptions

These are reasonable defaults chosen where the feature description did not specify. Each is a candidate for revision during `/speckit-clarify`.

- **"URL" means a direct address to the file itself.** The person supplies an address that resolves to the video bytes or to the WebVTT text. Page addresses on hosting services are recognized and explained, not resolved — extracting media from such pages stays outside this product's stated exclusion of streaming-service integration.
- **Any address the person types is permitted.** The product does not curate, allowlist, or gate destinations. Fetching from an address the person named is that person directing their own browser; the boundary this product defends is against destinations the person did *not* name.
- **Widening the shipped content policy is in scope for this feature.** The application currently permits no third-party origin at all, which would block this feature entirely. Widening that policy to permit media and lyric retrieval from person-supplied addresses is expected — and it must be widened no further than that. Script, style, frame, and form destinations stay closed, and nothing may be sent outward.
- **Secure addresses are the norm.** An address the browser refuses to load from a secure page is explained rather than worked around. The product does not weaken its own security to accommodate an address.
- **No proxying, ever.** When a host refuses to let its file be read by another site, the answer is to tell the person and suggest downloading the file. Routing their content through an intermediary would send it somewhere they did not name.
- **The link is the only thing that outlives the session.** The application itself stores nothing between visits — no history, no favourites, no recent-address list. A person who wants to keep a pairing keeps it as a link, held by their own bookmarks or wherever they sent it. The product remembers nothing on their behalf.
- **The offset belongs to the pairing; display preferences belong to the person.** A timing correction describes how a particular lyric file sits against a particular recording, so it travels with the link and saves the recipient from rediscovering it. Text size, colour scheme, and placement describe whoever is looking at the screen, so they do not.
- **A shared link starts at the beginning.** Playback position is not carried. "Resume where I left off" is a different feature from "here is a song you can sing".
- **Updating the address replaces rather than accumulates.** Loading a new source rewrites the application's address in place, so the back button steps out of the application rather than backwards through every source the person tried.
- **Opening a link contacts the addresses it names.** This is how every link on the web behaves and is within what a person expects when they click one, but because the addresses came from the sender rather than the recipient, the application names them rather than contacting them invisibly.
- **The address bar is visible.** Reflecting sources there means a person screen-sharing or presenting exposes what they are singing to whoever is watching. This is judged an acceptable and conventional trade for shareability, and is the reason the copy action is explicit rather than automatic.
- **Progressive retrieval, not download-then-play.** A remote video begins playing as it arrives rather than requiring the whole file first; a lyric file is small enough to be retrieved whole before parsing.
- **The lyric file is still the authority on timing.** Where a file came from changes nothing about how it is parsed, tokenized, repaired, or timed.
- **Only the ways in are new.** No change to highlighting, playback controls, display preferences, offset behaviour, or malformed-file handling is intended by this feature.
- **Modern evergreen browsers on desktop and mobile**, unchanged from the existing target. Playable formats remain whatever the person's browser supports.

## Out of Scope

- Resolving, scraping, or extracting media from video-hosting or streaming service pages.
- Adaptive-streaming manifests and any playback the browser cannot perform natively.
- Authentication to protected addresses — sign-in flows, tokens, API keys, or credential storage.
- Proxying, mirroring, or relaying content through an intermediary to work around a host's cross-origin refusal.
- Caching, downloading, or otherwise persisting fetched content beyond the current session.
- A catalog, search, discovery, history, or bookmarks of addresses held by the application.
- Link shortening, or any service that stores a pairing on a person's behalf and hands back a shorter link.
- Carrying playback position in a link, or resuming a session where it was left off.
- Carrying display preferences in a link, or any other personalization of what a recipient sees.
- Automatically finding a lyric file for a given video, or the reverse.
- Any change to lyric parsing, highlighting, playback control, or display behaviour.
