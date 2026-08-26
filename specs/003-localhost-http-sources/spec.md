# Feature Specification: Sources on Your Own Machine

**Feature Branch**: `master`

**Created**: 2026-08-19

**Status**: Draft

**Input**: User description: "When a user specifies a localhost URL, the program should still try to use it even though it isn't served over HTTPS."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sing to a file served from your own machine (Priority: P1)

A person has a video and a matching WebVTT file on their own computer, and something on that computer already serves them over the local network loopback — a one-line static file server pointed at a folder, a home media server, a development server, a tunnel to a machine elsewhere. They open the karaoke application in their browser, paste `http://localhost:8080/song.mp4` and `http://localhost:8080/song.vtt`, and press play.

Today the application refuses both addresses before it tries anything, telling them the address is not secure. That refusal is wrong here: the browser itself treats an address on the person's own machine as trustworthy, so the load would have worked. The person is being stopped from reaching their own files by a rule written for the open internet.

**Why this priority**: This is the entire request. A person with a local server and no way to use it has received nothing; a person who can paste a local address and sing has received everything this feature offers.

**Independent Test**: Serve a playable video and a valid WebVTT file from a loopback address on the tester's own machine, open the published application, paste both addresses, and confirm karaoke plays with the same word-by-word highlighting a locally chosen file pair produces. Delivers full value with nothing else in this feature built.

**Acceptance Scenarios**:

1. **Given** a video and a WebVTT file served from `http://localhost:<port>/` on the person's own machine, **When** they paste both addresses into the published application, **Then** both load and play with synchronized highlighting, exactly as an `https:` pair would.
2. **Given** the same files served instead from `http://127.0.0.1:<port>/`, **When** the person pastes those addresses, **Then** the behaviour is identical — the loopback address is recognized by its numeric form as readily as by name.
3. **Given** a loopback address on a non-default port, or on a subdomain of `localhost`, **When** it is supplied, **Then** it is attempted rather than refused.
4. **Given** a loopback address where nothing is listening on that port, **When** the person supplies it, **Then** the attempt is actually made and the failure is reported in plain language, leaving any previously loaded source untouched.
5. **Given** the person supplies one loopback address and one ordinary `https:` address, **When** both load, **Then** the pairing behaves identically to any other pairing — seeking, offset, playback rate, and every display preference work as before.

---

### User Story 2 - Still be told when an insecure address genuinely will not work (Priority: P2)

A person pastes `http://someones-server.example/song.mp4` — an ordinary insecure address out on the internet — into the application running at its published, secure address. Their browser will refuse to load it no matter what the application does. They need to be told that plainly, before anything is attempted, exactly as they are told today.

**Why this priority**: The value of Story 1 is that a real capability is unblocked. The value of this story is that nothing *else* is unblocked with it. Widening the exception past the person's own machine would produce loads that silently fail with a confusing error instead of a clear refusal, and would quietly enlarge the set of places the application is willing to contact. This story is what keeps Story 1 honest, but it is not what the person asked for, so it ranks second.

**Independent Test**: Supply insecure addresses drawn from outside the loopback set — a public hostname, a private network address such as `192.168.1.10`, an mDNS `.local` name — to the published application and confirm each is refused without a request being made and with an explanation naming a next step.

**Acceptance Scenarios**:

1. **Given** the application is running at a secure address, **When** an insecure address on a public host is supplied, **Then** it is refused before any request, with a plain-language explanation and a suggested next step.
2. **Given** the application is running at a secure address, **When** an insecure address on a private network — a `192.168.x.x`, `10.x.x.x`, or `.local` name — is supplied, **Then** it is refused the same way, because the browser would block it regardless.
3. **Given** an address using a scheme that is neither ordinary web retrieval nor secure web retrieval, **When** it is supplied, **Then** it is refused as unusable exactly as it is today, with no new exception carved for it.

---

### User Story 3 - Know that a link to your own machine only works on your own machine (Priority: P3)

A person has a pairing loaded from addresses on their own machine and copies the shareable link, meaning to send it to a friend. On the friend's computer nothing is listening at that address, so the link resolves to nothing. Before they send it, the application tells them the link points at their own machine and will not work for anyone else.

**Why this priority**: The sharing feature already ships, and this feature makes it newly possible to produce a link that is confidently broken for its recipient. Saying so costs one sentence at the moment of copying. It is genuinely useful and genuinely small, which is why it is last rather than absent.

**Independent Test**: Load a pairing from loopback addresses, invoke the copy-link action, and confirm the application states that the link points at the person's own machine before it is sent. Testable with nothing from Story 2 built.

**Acceptance Scenarios**:

1. **Given** at least one loaded source is an address on the person's own machine, **When** they invoke the action that produces a shareable link, **Then** they are told the link points at their own machine and will not resolve for anyone else, before sending it.
2. **Given** a link carrying a loopback address is opened on a machine where that address does serve the files, **When** it loads, **Then** the pairing is restored exactly as any other link restores.
3. **Given** a link carrying a loopback address is opened on a machine where nothing is listening there, **When** it fails, **Then** the failure is explained in plain language naming what to do, and the application is left usable rather than blank.

---

### Edge Cases

- **Nothing is listening, or the browser refused anyway.** Some browsers do not grant an address on the person's own machine the trust that others do, and a load refused for that reason is indistinguishable, after the fact, from a server that simply is not running. The failure message must therefore name both possibilities rather than asserting one, and must suggest an action that resolves either.
- **A private network address that is not loopback.** A person with a media server on their home network at `192.168.1.10` will reasonably expect this feature to cover it. It does not, and cannot — the browser blocks it. The refusal they get must remain useful rather than becoming misleading now that a nearby case is permitted.
- **A local server that is reachable but serves the wrong thing.** A loopback address that returns an HTML directory listing, a 404 page, or a file that is neither playable media nor parseable lyrics fails on its content, through the existing content-based judgement, not through anything new.
- **A local server that refuses cross-origin reads.** A file server on the person's own machine may not permit another site to read its files. This surfaces as the existing refusal-or-unreachable failure; the address being local changes nothing about it.
- **A local address supplied by a link rather than typed.** An address arriving in a shared link is exactly as untrusted as one typed by hand, whether or not it is local, and is validated identically.
- **The application itself served insecurely.** When the application is not running at a secure address, insecure addresses already work and must continue to; this feature must not introduce a new restriction on that path.
- **A local server using a self-signed certificate.** A secure address on the person's own machine whose certificate the browser rejects fails as unreachable and cannot be distinguished from any other unreachable address. It is out of scope here and unchanged by this feature.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-201**: The application MUST attempt to load a source from an insecure address when that address names the person's own machine, rather than refusing it before making a request.
- **FR-202**: The application MUST treat as naming the person's own machine exactly the set of addresses that browsers themselves treat as local: the name `localhost`, any subdomain of `localhost`, any address in the `127.0.0.0/8` range, and the IPv6 loopback address. Any port, or no port, MUST be accepted.
- **FR-203**: The application MUST continue to refuse, before making any request, every insecure address that does not name the person's own machine, with the plain-language explanation it gives today.
- **FR-204**: The set of addresses the application is willing to contact MUST grow by the person's own machine and by nothing else. No other scheme, host, or address class may become reachable as a consequence of this change.
- **FR-205**: Content loaded from an address on the person's own machine MUST be indistinguishable in behaviour from content loaded any other way once loaded — highlighting, seeking, pause and resume, playback rate, timing offset, and every display preference MUST work identically.
- **FR-206**: A failed load from an address on the person's own machine MUST be reported in plain language that names both possibilities the application cannot distinguish between — that nothing is serving files at that address, and that the browser declined to load an insecure local address — and MUST name an action that resolves either.
- **FR-207**: A failed load from an address on the person's own machine MUST leave previously loaded video, lyrics, playback position, timing offset, and display preferences untouched and usable.
- **FR-208**: The application MUST validate an address on the person's own machine by the same rules as any other address — normalization of copied-address artifacts, rejection of unusable schemes, and content-based judgement of what was fetched — with the security refusal as the single exception.
- **FR-209**: The application MUST apply this exception identically to video sources and lyric sources, and to addresses supplied by typing, by pasting, by dropping, and by opening a shared link.
- **FR-210**: When the application is not itself running at a secure address, insecure addresses MUST continue to be attempted as they are today; this feature MUST NOT narrow that path.
- **FR-211**: The application MUST NOT contact any address on the person's own machine that the person did not supply, and MUST NOT probe, scan, or guess local ports or hostnames under any circumstance.
- **FR-212**: Loading from an address on the person's own machine MUST work with the internet disconnected, once the application itself has loaded.
- **FR-213**: When a shareable link would carry an address on the person's own machine, the application MUST make plain, before the link is sent, that the link points at that machine and will not resolve for anyone else.
- **FR-214**: The application MUST NOT require the person to confirm, acknowledge, or opt in to using an address on their own machine. It is their own computer, and it MUST be no more effortful to use than any other address.
- **FR-215**: The application MUST NOT transmit the person's local addresses, port numbers, filenames, or content anywhere, including in the course of producing or opening a shareable link.

### Key Entities

- **Address on the person's own machine**: The class of supplied addresses that reach only the machine the browser is running on. Membership is decided by the address's host alone — by name for `localhost` and its subdomains, by numeric range for the loopback ranges — and is independent of port, path, and everything else in the address. This class is the sole exception to the insecure-address refusal, and its boundary is the feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-201**: A person serving a video and lyrics from their own machine reaches synchronized karaoke playback at the published application in under 60 seconds and no more than four interactions, without downloading or re-selecting either file.
- **SC-202**: 100% of addresses naming the person's own machine — by name, by subdomain of that name, by IPv4 loopback, by IPv6 loopback, on any port — are attempted rather than refused unseen.
- **SC-203**: 100% of insecure addresses that do not name the person's own machine are still refused before any request is made, verified across public hosts, private network ranges, and mDNS names.
- **SC-204**: The set of addresses the application will contact grows by the person's own machine and by nothing else, verified by supplying addresses from every other class and observing no new one is reached.
- **SC-205**: A pairing served from the person's own machine loads and plays with the internet disconnected, in 100% of attempts.
- **SC-206**: Every failure of a load from the person's own machine produces a plain-language message naming a next step; none produces a blank screen, a silent failure, a raw code, or an assertion about a cause the application cannot actually distinguish.
- **SC-207**: In 100% of failed local loads, previously loaded content remains playable and the playback position is unchanged.
- **SC-208**: A shareable link carrying an address on the person's own machine is identified as such before it is sent, in 100% of cases.
- **SC-209**: Every behaviour that worked before this feature continues to work unchanged — locally chosen files, secure addresses, shared links carrying secure addresses, and every failure message for every other address class.
- **SC-210**: At least 9 of 10 people who have a file server running on their own machine succeed in loading from it without assistance, and among those who supply an address where nothing is listening, at least 9 of 10 correctly identify what to check from the message alone.

## Assumptions

- **This is about the published, secure application, not the development setup.** The development environment already permits local addresses; a change scoped to development would deliver nothing. The request is read as being about the application as people actually reach it.
- **The person's own machine means loopback, as browsers define it.** `localhost`, subdomains of `localhost`, `127.0.0.0/8`, and the IPv6 loopback address. Private network addresses are deliberately excluded: browsers block them from a secure page, so permitting them would produce failures rather than loads.
- **Not every browser grants local addresses the same trust.** Most treat an address on the person's own machine as trustworthy and load it from a secure page; at least one does not. The feature is written so that a browser refusing anyway is a reported failure with useful advice, not a blank screen — it is not written to assume universal support.
- **Contacting the person's own machine is not egress.** A request that never leaves the machine discloses nothing to anyone. This feature adds no destination outside the person's device and no transmission of anything about them.
- **The person is responsible for what they serve locally.** The application retrieves what it is pointed at and judges it by whether it plays or parses; it makes no claim about the local server's own security posture.
- **Every capability from the existing address-loading feature carries over unchanged** — normalization, progress reporting, cancellation of superseded loads, timeouts, content-based judgement, and failure reporting all apply to local addresses exactly as they apply to any other.
