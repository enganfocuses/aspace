# Read-only Yonote connection

The embedded Yonote app returns `X-Frame-Options: SAMEORIGIN`. Aspace therefore reads published pages and the owner's drafts through the server API, rather than embedding a logged-in Yonote browser session.

1. In the existing `aspace-fallback-api` Worker, add **Secret** `YONOTE_API_TOKEN` in Settings → Variables and Secrets. Do not add it to `config.js`, a board, a URL, a GitHub workflow input, or a normal environment variable committed to Git.
2. Deploy `cloudflare/worker.js` from the current `main` revision, with existing D1, `OWNER_UID` and `FIREBASE_PROJECT_ID` bindings unchanged. No database migration is required.
3. Owner: open a board → split-screen icon → accept the configured Yonote workspace address.

The owner authenticates with the existing Firebase ID token. A student authenticates with the existing board share token: the server checks its active D1 grant and the saved board's workspace hostname against the Yonote account before exposing any material. A revoked grant or a board without this workspace cannot read the library. The owner should open/save the board once after adding the workspace so the reserve mirror and share grant are current.

The server offers only list/read routes. It never sends the Yonote API key to a browser and never logs provider error bodies. The reader shows text, code and public HTTPS images, and links to originals for interactive databases or private attachments. It is not an editor or a replacement for Yonote's interactive views. Each reader request rechecks access. Pagination covers the entire accessible library, not just the first page.

Do not reuse the older workflow's foundation branch: deploy the current main revision to include `yonote.js`. Configure the secret in the Cloudflare dashboard, rather than passing it as a workflow input. An unset secret returns `yonote_not_configured` after access checks.
