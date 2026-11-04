<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Firestore is the source of truth: `users/{uid}` profiles, `users/{uid}/cases/{caseRef}`, `users/{uid}/events/{eventId}` (audit, linked by `caseId`) and `users/{uid}/uploads/{uploadId}` (metadata for evidence files in Cloud Storage at `users/{uid}/cases/{caseRef}/...`, see `src/lib/uploads.ts`). Model in `src/lib/domain.ts`, writes in `src/lib/cases.ts`, live reads via `WorkspaceProvider` in `src/lib/workspace.tsx`. No mock datasets — the prototype-to-MVP conversion removed `src/data/`.
- People enter only primary data (referral, OT assessment, WC position, applicant contribution, council decision). Everything derived — needs, layout, checks, schedule of works, funding, stage, status — comes from `processCase()` in `src/lib/engine`, is stored on the case under `derived`, and is recomputed on every write. Never compute those values in a page.
- Accounts use Firebase Authentication (email/password); `{uid}` is the Auth UID and `src/lib/session.ts` restores the session from Auth state. Never store passwords in Firestore or business data in localStorage.
- `firestore.rules` and `storage.rules` restrict everything under `users/{uid}` to that signed-in user; update them with any new collection or field they validate. Test against the emulators (`firebase.json`, `VITE_*_EMULATOR_HOST` in `.env.example`).
- The Firebase API key comes from the `GOOGLE_API_KEY` server secret via a server function (unless `VITE_FIREBASE_API_KEY` is set); other Firebase config lives in `.env` as `VITE_FIREBASE_*` — the user stored the key as a secret.
- Accessibility checks are deterministic functions in `src/lib/rules.ts`; never label them AI — the brief bans AI terminology. The engine must stay deterministic with no external AI/ML services.
- Bump `ENGINE_VERSION` in `src/lib/engine/index.ts` when engine output changes; stored `derived` data from an older version is recomputed on read.
