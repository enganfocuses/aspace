# Aspace psychology

A static Russian-language self-study course, linked from the owner's `#psychology` route. The static course URL is readable without an owner session; personal records are a separate, locally encrypted vault, not Firebase documents. This is education and skills practice, not assessment, treatment, professional qualification, or a replacement for individual clinical care.

## Content

- 24 modules, 96 original explanatory sections, 24 worked examples.
- 72 written practice prompts and 48 knowledge questions with explanations.
- 16 reusable worksheets and 12 fictional learning cases.
- Bibliographic mapping to the supplied PDFs, critical context for the defenses handout, and Vygotsky reading links/questions.

The provided ZIP was read locally. It contains Judith Beck's Russian third edition (translation 2024, 482 PDF pages), the Russian 2020 edition of *Cognitive Therapy for Challenging Problems* (436 PDF pages), and two byte-identical 18-page defenses handouts from “Литература для психологов 2.0”. Handout claims are not treated as validated diagnostic guidance. The course explanations and fictional examples are newly written adaptations; full copyrighted PDFs, extracted text, user notes and archive contents are not published.

Vygotsky's *Thinking and Speech* (1934) is linked to the MSUPE electronic library, with the edition cross-checked against the Russian State Library catalogue. The external book requires network access. Its historical theory is explicitly separate from CBT clinical guidance.

References checked 2026-11-09:
- https://psychlib.ru/mgppu/vmr-1934/vmr-001.htm
- https://search.rsl.ru/ru/record/01008656366
- https://beckinstitute.org/cbt-resources/resources-for-professionals-and-students/cbtresources/
- https://www.nice.org.uk/guidance/ng222/chapter/recommendations

## Local records

`vault.mjs` uses WebCrypto AES-GCM 256-bit encryption with random 16-byte salt, random 12-byte nonce per write and PBKDF2-SHA256 (250,000 iterations). The key is non-extractable and held in memory while unlocked; the passphrase is not stored. The serialized localStorage vault and JSON backup contain ciphertext. The app does not recover forgotten passphrases. Clearing browser data removes the local vault unless a backup exists.

An encrypted backup plus passphrase transfers the journal to another device. Import validates/decrypts before replacement; the UI asks before overwriting an existing vault. Entries move to a reversible trash. Saves are serialized. A failed local write leaves the previous ciphertext intact and shows an error; in-memory recovery export can include an unsaved draft even when localStorage is full. Draft saves are debounced, and explicit entry saving is provided. Save or wait for the saved indicator before closing or changing the surrounding Aspace view.

Only non-personal course module IDs/progress are stored unencrypted. Open journal content is visible to a person controlling the open tab. Encryption at rest does not protect against a compromised browser, host page, malicious same-origin scripts, extensions, screenshots, or someone who knows the passphrase. Automatic lock runs after ten minutes without page interaction, subject to browser timer scheduling; manual lock is available. Ordinary lesson navigation flushes the current draft. Beforeunload guards unsaved changes where browser policy allows.

No requests, analytics SDKs, LLM calls or provider keys are used by the psychology modules. The only automatic network access is loading/caching static assets on the same origin. External references open only when chosen. Local PDFs are session-only Blob URLs, not uploaded or persisted. The shared root service worker caches the six static psychology files for later offline use; external books still require internet. This does not add Firebase or Cloudflare data traffic for journal saves.

## Verification

Run `node --test tests/*.test.mjs cloudflare/tests/*.test.mjs` from the repository root. Tests cover content completeness, owner route integration, ciphertext-only persistence, wrong-password and tamper handling, serialized saves, local quota failure/recovery backup, locked backup export and offline assets.

Browser QA uses a separate preview with synthetic in-memory records; no personal journal or production Firebase account is opened. Covers course navigation, answer explanations, a saved synthetic worksheet, closed-vault guard, library links and a 390px viewport.
