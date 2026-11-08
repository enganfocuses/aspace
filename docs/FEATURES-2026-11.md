# Aspace: November 2026 UI release

Firebase remains the primary data store; the Cloudflare D1 standby router is staged separately in PR #5 and is **not** enabled for ordinary visitors. The current static Aspace main page includes:

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
- The Cloudflare fallback remains a separate staged module. Full real-board guest failover and Cloudflare signaling are not implemented in production.
- The offline course builder requires the browser to open the static HTML file; connected online audio embeds would still require internet (the supplied file does not use external sources).
