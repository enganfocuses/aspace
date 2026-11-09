# Aspace: November 2026 UI release

Firebase remains the primary data store. The Cloudflare D1 standby router is available only in explicit lab sessions and is **not** enabled for ordinary visitors. Owner sessions use `?standby=lab` (plus `&standbywrite=lab` for D1 writes); guest sessions use `?gueststandby=lab` with the existing share fragment. The current static Aspace main page includes:

1. **Navigation:** Right-click or hold the mouse wheel and drag in the board area to pan without changing the selected drawing tool. Mouse wheel zoom and touch pinch still work.
2. **Colors:** Each selected fill shape/sticky note has a saved custom color palette, HTML spectrum picker, `+ Цвет` to retain colors, and optional native EyeDropper on supported secure Chromium browsers.
3. **External media:** The chain-link toolbar control adds YouTube/Vimeo iframe players, SoundCloud iframe player, direct HTTPS images and direct audio/video URLs as board objects. Media plays from providers instead of uploading bytes to Firebase/Cloudflare. Providers may block embedding or hotlinking, and content can become unavailable. Media platforms independently collect visitor data.
4. **Offline education:** `education/speakout-b1plus-builder.html` is copied verbatim from the teacher's supplied Speakout B1+ file. It has its own scripts and styles and requires no Firebase, Cloudflare, or fetch calls. The Education view is only an iframe and download/open shell around it; Aspace's service worker precaches the static file for offline reuse.
5. **Persistent call navigation:** From the call page an owner can select an indexed board or create a new board, create an editor sharing link if needed, and emit a board navigation event to other clients in the same call room. The underlying WebRTC call's window and tracks remain alive while the board view loads in the same page. Guest call landing can open without Firebase sign-in, but the Firebase security rules must independently permit guest signaling and appropriate share access; this was not confirmed by the static tests.
6. **Background:** The dotted/solid background is drawn on the board's scroll surface, not a scaled canvas, so zooming out won't reveal a different background or shrink the pattern.

## Limitations / pending live tests

- Static JavaScript syntax and structural checks do not prove all browser interactions work.
- The teacher and a guest should verify a single continuous video session while navigating to a chosen shared board and creating a new one. Some VPNs, STUN/TURN configurations and Firebase permissions may prevent media/signaling. Do not claim uninterrupted video under every network condition.
- The app's existing full-size media uploads remain available but can consume Firebase quotas; prefer external links where terms and hosting allow. Direct images and embeds are not mirrored to Cloudflare for offline playback.
- The Cloudflare fallback is opt-in. Recovery verifies provider versions and retains conflicting drafts. Continuous guest grant/role/revocation synchronization and Cloudflare video signaling are still required before enabling automatic fallback for ordinary visitors.
- The offline course builder requires the browser to open the static HTML file; connected online audio embeds would still require internet (the supplied file does not use external sources).

## Automatic board reserve release

Normal board sessions now use a single transport for the canonical shared or
private Firebase path and the existing D1 board key. This supersedes the
opt-in-only limitations above for board content. Durable drafts, provider CAS,
content ancestry and conservative object merging handle outages and return to
Firebase. Role checks and revocation are refreshed while the board is open.
The menu exports a full JSON copy for preserving a conflicting draft. See
`cloudflare/README.md` for exact scope and limits; media bytes, call signaling
and fresh owner authentication remain separate dependencies.


## Owner limits dashboard

`#usage` is owner-only and available from Home and the board menu. It shows the
actual 6 MiB upload and 700,000-byte reserve limits, per-board UTF-8 snapshots
measured during normal reads/saves, browser storage estimates, and local daily
request/body-size observations. Raw URLs, tokens and lesson bodies are not
stored by the observer or sent to an analytics service. Dashboard refresh does
not download lessons or media to measure them.

Provider-wide consumption remains unknown without provider management metrics.
Optional manually entered console readings show their timestamp and period;
expired readings become unknown, never zero. Remaining quota and 80% warnings
are calculated only from valid manual readings. Browser counters exclude other
users/devices, EventSource traffic, WebRTC media and protocol overhead; missing
response lengths are explicitly unmeasured. Free-plan quotas are reference
values checked on 2026-11-08, not confirmation of the account's billing plan.
Backblaze B2, Open Relay and independent owner login remain unconnected.

## Owner action metrics and screenshot readings

The owner limits screen accepts an optional `#usage?reading=YYYY-MM,storageMB,downloadsMB,connections` fragment. Values are strictly parsed and shown for explicit import before changing local readings. The fragment is removed from history on entering the screen and is not sent as a request parameter. No account usage measurements are embedded in the published source. Screenshot imports retain their source and import time, without inventing a verified capture timestamp or treating the values as live console metrics. Cloudflare “No data” stays unknown.

Own local calls to board persistence count as activity bursts, grouped by a 1.2-second idle gap. Remote signaling handlers explicitly opt out. Per-board local observations attribute Firebase requests for canonical board paths, registered shared paths, board signals and material requests while that board is open. Registered share-token paths exist only in memory. Successful board PUT/PATCH operations are distinct from failed attempts and reserve writes. These are operation/burst counts, not individual mouse-event or student action totals.

Received board SSE payloads are counted as UTF-8 bytes in a one-second buffer, flushed on snapshots, board exit and page hide. No message contents are stored and no extra service requests are made for analytics. These decoded SSE bytes and known HTTP Content-Length values are estimates rather than billed wire bytes. Other devices, video, unmeasured HTTP responses, compression effects and protocol overhead are excluded.

When a monthly download reading is entered/imported, the current local receive counters are captured as its baseline. A separate labelled local estimate adds only subsequent observed incoming bytes; uploads never increase the download estimate, and re-entering a console value rebases it to avoid counting the same local traffic twice. The estimate expires across UTC months and does not replace the provider reading or promise an actual remaining quota. Storage is not incremented by the size of each save: board versions overwrite existing data.

The limits screen now always shows a Firebase readings form on the ordinary owner route, without requiring a fragment import link. Fragment readings only prefill it. Decimal commas are accepted; blank/invalid submissions do not overwrite readings. The form lives outside the periodically replaced stats body so unfinished input survives refresh. The versioned view module and service worker shell refresh stale clients.

## Psychology self-study

The owner navigation, board menu and Home now include Psychology (`#psychology`). A static course provides 24 modules, 72 written tasks, 48 explained knowledge questions, 16 worksheet types and 12 fictional cases, adapted from the supplied Beck textbooks. A critical handout discussion and Vygotsky 1934 reading links are included. Personal notes use a local WebCrypto encrypted vault with backup/restore, autosaved drafts, reversible trash and print; no journal data is sent to Firebase or Cloudflare. Original uploaded PDFs are not public assets; the reader opens device-selected PDFs only for the current session. See psychology/README.md for sources, boundaries and storage details.

## Verbatim psychology theory

Replaced all 24 modules’ editorial theory with 112 directly sourced PDF-page excerpts, each citing its book, chapter and physical PDF page. The ten scanned pages also display original facsimiles, with OCR text collapsed and labelled. Editorial examples, practice prompts and answer explanations are explicitly distinguished from the book text. Removed the previous theory paragraphs from both reading and search. Source hashes and the excerpt manifest support verification; diary storage and encryption are unchanged.



Two supplied digital PDF pages (303 and 401) are completely blank and excluded. Three other pages (304, 340 and 402) contain rasterized material or diagrams and are preserved as original facsimiles. Thirteen original-page facsimiles are included in total.
