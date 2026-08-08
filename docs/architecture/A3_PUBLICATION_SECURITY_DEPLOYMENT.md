# A3-B5 — Publication Security and Controlled Deployment

## Purpose

B5 turns the structurally complete remote publication path into a deployable path without embedding a teacher credential in public CRIOS source.

This document is permanent rollback and deployment documentation.

## Security model

Student publication reads are public and read-only.

Teacher mutations (`publishPublication`, `activatePublication`, `deactivatePublication`) require a bearer secret known only to the teacher/operator.

The browser never receives that secret from CRIOS source code, `config.js`, a URL, `localStorage`, `sessionStorage`, cookies or IndexedDB. Studio asks for it just-in-time when a write is attempted and returns it directly to the existing remote client.

The token is not cached by the CRIOS authorization module. A new teacher write requires a new prompt.

The Apps Script backend does not store the raw bearer secret. Script Properties stores only:

`CRIOS_PUBLICATION_WRITE_TOKEN_SHA256`

The value is the lowercase SHA-256 hex digest of the teacher token.

The raw teacher token must be at least 8 characters and at most 256 characters. CRIOS imposes no composition rules: uppercase, lowercase, digits and symbols are optional, and the token is matched exactly as entered.

### Teacher token policy

The operator-selected minimum is 8 characters. CRIOS does not trim or normalize the token and does not require any character class. Spaces, symbols and other characters are accepted and hashed exactly as entered. The 256-character ceiling is only a transport/input bound, not a composition rule. Security therefore depends on the teacher choosing a token that is not easy to guess.

This policy is enforced identically by Studio and the Apps Script backend. If it must be rolled back, revert the token-policy commit before deploying a backend that depends on a different minimum. No publication data migration is involved.

## Deployment endpoint

The publication endpoint is deliberately separate from the legacy `resultsEndpoint`.

`CRIOS_CONFIG.publicationEndpoint` is the only deployment endpoint consumed by the publication configuration bridge.

Before controlled deployment this value remains the empty string. With an empty value:

- Runtime remote publication configuration is not created;
- Studio remote publication configuration is not created;
- the existing local/offline path remains unchanged.

No production publication endpoint is committed by B5 security preparation.

## Browser configuration

`js/publication/remote/remote-publication-deployment-config.js` translates the public endpoint into two explicit configuration globals:

- Runtime: `CRIOS_RUNTIME_REMOTE_PUBLICATION_CONFIG`
- Studio: `CRIOS_STUDIO_REMOTE_PUBLICATION_CONFIG`

Runtime receives only:

- `endpoint`
- `timeoutMs`

Studio receives:

- `endpoint`
- `timeoutMs`
- `writeTokenProvider`

The provider is created by `js/studio/publication/studio-write-auth.js`.

The provider prompts at write time and does not persist or expose the token through a public property.

## Controlled deployment procedure

Do not reuse the URL in `CRIOS_CONFIG.resultsEndpoint`.

1. Confirm the repository is at the validated B5 security-preparation commit and its bundle verifies.
2. Choose a teacher token of at least 8 characters on the operator machine. CRIOS does not enforce composition rules; a random token is still preferable to an easily guessed phrase.
3. Compute its lowercase SHA-256 hex digest locally.
4. Store only that digest in Apps Script Script Properties under `CRIOS_PUBLICATION_WRITE_TOKEN_SHA256`.
5. Keep the raw token outside the repository and outside Google Apps Script source. Use a password manager or equivalent operator-controlled storage.
6. Deploy a new Apps Script web-app version containing the repository versions of `Code.gs` and `PublicationBackend.gs`.
7. The web app must allow the intended student population to perform anonymous/read access to `doGet`. If organizational policy does not permit that access mode, stop deployment rather than weakening the write-auth boundary.
8. Record the new deployment URL. It is public and may be committed as `CRIOS_CONFIG.publicationEndpoint`.
9. Before enabling CRIOS against it, run controlled health/read and unauthorized-write probes.
10. Verify an unauthorized write returns `WRITE_UNAUTHORIZED`.
11. Verify a valid teacher write succeeds only when the raw token is supplied interactively.
12. Verify Runtime GET uses no teacher credential.
13. Only after these checks update `CRIOS_CONFIG.publicationEndpoint`.
14. Run the B6 cross-device flow from a separate student browser/device.


## Pre-B5 recovery point

The verified recovery point immediately before B5 security preparation is:

`Proyecto-Crios-44ca2b70e28ba441-main.bundle`

Expected HEAD:

`44ca2b70e28ba4412629e739a855469dbd9bb38c refs/heads/main`

Expected SHA-256:

`a659e437f8f6bfec7b01efb2d108d10b73e11d961422bd455c3a5aa589292694`

Expected size:

`2958821` bytes

After the B5 security-preparation commit and its replacement bundle are verified, operational cleanup may remove this predecessor bundle. Git history plus this document remain the permanent rollback record.

The B5 security-preparation commit can be resolved later without relying on a copied hash:

`git log --format="%H %s" --diff-filter=A -- docs/architecture/A3_PUBLICATION_SECURITY_DEPLOYMENT.md`

## Token rotation

To rotate authorization:

1. generate a new raw token;
2. compute its SHA-256 locally;
3. replace `CRIOS_PUBLICATION_WRITE_TOKEN_SHA256` in Script Properties;
4. discard the old raw token;
5. reload Studio before the next write.

No source-code change is required for token rotation.

## Compromise response

If the teacher token is suspected to have leaked:

1. replace the Script Property hash immediately;
2. do not change the public student link merely for token rotation;
3. reload Studio;
4. audit publication/activation event records for unexpected writes;
5. generate a new bundle only if repository content changes.

## Rollback

B5 security preparation is source-only and does not migrate publication data.

Before live deployment, it can be reverted as one commit. The empty `publicationEndpoint` leaves B4 local compatibility intact.

After live deployment:

1. clear `CRIOS_CONFIG.publicationEndpoint` to disable client-side remote composition;
2. disable or supersede the Apps Script deployment if necessary;
3. rotate/remove `CRIOS_PUBLICATION_WRITE_TOKEN_SHA256`;
4. then revert the B5 source commit if required;
5. B4 may be reverted only after B5 deployment/configuration is no longer depended upon.

Never roll B4 back first while a live B5 configuration still expects its Runtime readers.
