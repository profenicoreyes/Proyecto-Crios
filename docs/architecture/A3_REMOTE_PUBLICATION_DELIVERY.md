# A3 — Remote Publication Delivery, Launch Identity and Rollback

## 1. Purpose

This document records the architecture and rollback path for the A3 work that separates teacher Studio entry from student published entry and migrates published campaigns from same-browser local persistence toward cross-device remote delivery.

It is permanent project documentation. Patch files, runners, ZIP transport packages and transient validation outputs are disposable; this document is not.

## 2. Architectural goal

The normal/shared CRIOS entry opens Studio for the teacher.

A student enters the game only through a teacher-shared published link. A published launch is identified by the pair:

- `campaignId`
- `publicationId`

The URL intentionally does not carry `contentHash`. Runtime revalidates publication identity and content integrity.

An invalid or incomplete published link must fail closed. It must not fall back to Studio, legacy selection or another publication.

## 3. Authority boundaries

### Publication server

The remote publication backend is authoritative for:

- `publicationId`
- publication version
- `createdAt`
- immutable `PublishedCampaign`
- activation/deactivation result
- active publication reference

The server recomputes SHA-256 and validates publication identity.

### Studio

Studio owns the mutable draft and composes publication and activation services.

When remote publication configuration is absent, the existing local path is preserved.

When remote configuration is explicitly present but invalid or incomplete, composition fails closed. It must not silently return to local publication or activation.

Publication and activation share the same remote client instance.

### Local persistence

Local publication/activation persistence is a cache and Studio state aid only. It is not the cross-device transport authority.

A stale local activation cache must never override a remote result.

### Runtime

Runtime receives published launch identity at bootstrap.

From B4, Runtime may resolve the exact requested publication through explicit read-only remote readers. The reader composition is opt-in: when `CRIOS_RUNTIME_REMOTE_PUBLICATION_CONFIG` is absent, the existing local persistence path is preserved. When remote configuration is explicitly present but invalid, incomplete, missing required modules or unable to construct the remote readers, Runtime fails closed and does not silently fall back to local persistence.

The remote reader pair is bound to the launch `(campaignId, publicationId)`, shares one memoized remote GET snapshot per resolution, and delegates transport to the existing remote publication client. Runtime still revalidates the active reference, publication identity, content hash, execution manifest and handler compatibility before materializing missions.

Runtime remote configuration is read-only. It accepts only `endpoint` and optional `timeoutMs`; teacher write authorization is forbidden in the Runtime configuration.

## 4. Core contracts

### PublishedCampaign

Contains exactly:

- `campaignId`
- `publicationId`
- `version`
- `schemaVersion`
- `contentHash`
- `content`

No `createdAt` or `active` field belongs to `PublishedCampaign`.

### PublicationRecord

Contains:

- `publicationId`
- `campaignId`
- `version`
- `schemaVersion`
- `contentHash`
- `sourceDraftRevision`
- `createdAt`
- `status`

### ActivePublicationReference

Contains:

- `campaignId`
- `publicationId`
- `version`
- `contentHash`
- `activatedAt`

Activation is separate from the immutable publication.

## 5. Published launch identity after B3

Canonical student query:

`?source=published&campaignId=<campaignId>&publicationId=<publicationId>`

Required guarantees:

- both identifiers are present;
- both identifiers survive Studio link construction;
- both identifiers survive launch-contract parsing;
- both identifiers survive runtime-launch selection;
- both identifiers reach the Runtime bootstrap boundary;
- missing `publicationId` fails closed;
- invalid `publicationId` fails closed;
- `contentHash` is not exposed in the URL;
- normal main entry continues to Studio.

## 6. Implementation lineage

The following commits form the remote-publication path through B3:

| Commit | Purpose |
|---|---|
| `0ebae4d74950dea97304e0bce535a5eb6f0c9370` | Remote publication contract |
| `dacc667aae53aeb707354f18741d07b7bc58734d` | Version Apps Script baseline |
| `1b23e275b101aa345c0ffff0ddc0adca31419294` | Remote publication backend |
| `d2fefad2ae3238b90d51b23036e6c522d05ca5ec` | Remote publication client |
| `b64ef5089e57648980085f2084eb5ffd5bd59d55` | Studio remote publication service |
| `7b52ed3c51bda1625cb26b012606185f20f6f605` | Publication-service injection seam |
| `985efa3f25e0152428f29af5fafe4f0c5a718bad` | Studio remote publication wiring |
| `9e6ad0a376a3231bc4add25099b1362c8612d199` | Studio remote activation service |
| `203763beb40282b2a8cbf52d0739b197185890d1` | Async activation-service injection seam |
| `ec75b6286a5c31c391366a75f74974c207109ada` | Studio remote activation wiring |

The B3 commit is the commit that first contains this document together with `tests/published-launch-identity-node.test.js`. It can always be resolved without relying on a copied hash:

`git log --format="%H %s" --diff-filter=A -- docs/architecture/A3_REMOTE_PUBLICATION_DELIVERY.md`

B3 is:

`1814ad679a65d01a847251fb708d5b6bdd985d49` — `feat(runtime): bind published launch identity`

The B4 commit is the later commit that modifies this document together with `js/runtime/publication/runtime-remote-publication-readers.js` and `js/runtime/publication/runtime-remote-publication-bootstrap.js`. It can be resolved with:

`git log --format="%H %s" --all -- js/runtime/publication/runtime-remote-publication-readers.js`

## 7. B3 exact scope

B3 changes the published-link identity boundary only.

Production files:

- `js/crios.js`
- `js/runtime/launch/runtime-entry-gate.js`
- `js/runtime/launch/runtime-launch-contract.js`
- `js/runtime/launch/runtime-launch-selection.js`
- `js/studio/publication/studio-runtime-launch.js`

Regression/characterization files updated:

- `tests/mvp-e2e-characterization.test.js`
- `tests/mvp-visual-acceptance.test.js`
- `tests/published-entry-surface.test.js`
- `tests/published-launch-operational-e2e.test.js`
- `tests/runtime-entry-gate.test.js`
- `tests/runtime-launch-contract.test.js`
- `tests/runtime-launch-selection.test.js`
- `tests/studio-runtime-launch.test.js`

New B3 test:

- `tests/published-launch-identity-node.test.js`

Permanent documentation:

- `docs/architecture/A3_REMOTE_PUBLICATION_DELIVERY.md`

## 8. B3 validation evidence

Before commit, B3 passed:

- published launch identity: 80/80
- runtime launch contract regression: 53/53
- runtime launch selection regression: 55/55
- runtime entry gate regression: 11/11

Total focal result: 199/199, 0 failures.

No browser, live network, deployment, Copilot or push was required for B3 validation.

## 9. Pre-B3 recovery point

The verified recovery bundle immediately before B3 is:

`Proyecto-Crios-ec75b6286a5c31c3-main.bundle`

Expected bundle HEAD:

`ec75b6286a5c31c391366a75f74974c207109ada refs/heads/main`

Expected SHA-256:

`c1077e791439f185074198997ec3793e228e6c9135333e712d7bf4c464f474e2`

This bundle is the direct recovery point for returning to the exact state before B3.

After a new B3 bundle is created and verified, operational cleanup may remove the predecessor bundle under the project backup policy. Git history remains the permanent rollback source.

## 10. Rollback rules

### Revert B3 before B4 exists

B3 can be reverted as one commit.

Expected semantic result:

- published links return to the prior campaign-only identity behavior;
- Runtime no longer requires/preserves `publicationId` at the B3 boundary;
- normal main entry to Studio remains governed by A3-003A;
- remote Studio publication/activation wiring remains intact.

After revert, rerun the launch-contract, launch-selection, entry-gate and Studio runtime-launch regressions.

### Revert B3 after B4 or later

Do not revert B3 first.

Later Runtime remote readers depend on the `(campaignId, publicationId)` identity. Revert dependent changes in reverse order:

1. B6 cross-device validation/closure changes, if any;
2. B5 deployment/security changes, where applicable;
3. B4 Runtime remote reader wiring;
4. then B3 published launch identity.

Re-run the validation set associated with every reverted boundary.

### Restore from bundle

If Git working state is unavailable, verify the recovery bundle first:

- `git bundle verify <bundle>`
- `git bundle list-heads <bundle>`

Restore only into a separate recovery clone/worktree or according to the project recovery procedure. Do not use destructive `reset`/`checkout` merely to make the active synced workspace convenient.

## 11. Security constraints

After B5B:

- the production publication endpoint is explicit in `CRIOS_CONFIG.publicationEndpoint`;
- no write token is embedded in public JavaScript;
- the existing results endpoint remains separate and is not reused for publication transport;
- Runtime receives no teacher credential;
- Studio obtains the teacher token only through its just-in-time provider;
- the live Apps Script deployment has passed public-read and authorization-boundary probes before endpoint enablement.

## 12. B4 Runtime remote reader boundary

B4 wires the existing Runtime publication resolver to an explicit remote reader pair without rewriting the resolver.

New production modules:

- `js/runtime/publication/runtime-remote-publication-readers.js`
- `js/runtime/publication/runtime-remote-publication-bootstrap.js`

Modified Runtime composition:

- `js/runtime/bootstrap/runtime-bootstrap-adapter.js`
- `js/crios.js`
- `index.html`

Modified regression harness:

- `tests/runtime-bootstrap-integration.test.js`

New permanent B4 tests:

- `tests/runtime-remote-publication-readers-node.test.js`
- `tests/runtime-remote-publication-bootstrap-node.test.js`
- `tests/runtime-remote-publication-integration-node.test.js`

### Reader behavior

The remote reader factory is constructed with the exact `campaignId` and `publicationId` from the student launch.

Its `activeReferenceReader` and `publicationReader` share a single memoized remote `getPublication(campaignId, publicationId)` snapshot. This avoids two independent network reads that could observe different activation states during one Runtime resolution.

The response is accepted only when:

- the returned publication matches the requested campaign and publication;
- the returned active reference matches the same campaign and publication;
- publication and active reference agree on version and `contentHash`;
- the remote contract shape is valid.

The existing Runtime resolver then independently validates publication identity, SHA-256 content integrity, executable publication contract, required handlers and mission materialization.

### Local/remote selection rule

Absence of `CRIOS_RUNTIME_REMOTE_PUBLICATION_CONFIG` preserves the local persistence path for compatibility and offline development.

Presence of that configuration is an explicit request for remote Runtime resolution. Any invalid config, missing module, creation failure or invalid reader interface fails closed; there is no local fallback.

The Runtime configuration accepts only:

- `endpoint`
- optional `timeoutMs`

`writeToken` and `writeTokenProvider` are explicitly rejected. Runtime GET reads do not carry teacher credentials.

### Pinned-session rule

A same-student, same-campaign session may be recovered only when its pinned `publicationId` also equals the `publicationId` in the current student link.

This prevents a new link for publication B from silently recovering publication A merely because both publications belong to the same campaign.

Pinned remote recovery still reads the pinned publication through the remote reader, so activation and availability are revalidated remotely rather than trusted from local session data.

## 13. B4 validation evidence

Before commit, the B4 candidate passed the following focal and relevant regression suites:

- remote Runtime readers: 54/54
- remote Runtime bootstrap composition: 103/103
- remote Runtime integration with fake transport: 47/47
- Runtime bootstrap integration: 159/159
- executable Runtime publication resolution: 121/121
- remote publication client regression: 71/71
- B3 published launch identity regression: 80/80
- Studio remote publication bootstrap regression: 149/149
- Studio remote activation wiring regression: 62/62
- Runtime launch contract/selection/entry-gate regressions: 119/119

Total checked: 965/965, 0 failures.

The integration suite uses a fake transport. No live publication endpoint, real network, deployment, Copilot or push is required for B4 validation.

## 14. Pre-B4 recovery point

The verified recovery bundle immediately before B4 is:

`Proyecto-Crios-1814ad679a65d01a-main.bundle`

Expected bundle HEAD:

`1814ad679a65d01a847251fb708d5b6bdd985d49 refs/heads/main`

Expected SHA-256:

`bc6220ceac8617a018d0a4f40c546cf98814653d3ded83e4054719e7bb648b93`

Expected size:

`2942740` bytes

This bundle is the direct recovery point for the exact state after B3 and before B4.

After a B4 commit and replacement bundle are both verified, cleanup may remove this predecessor bundle under the project backup policy. Git history and this documentation remain the permanent rollback source.

## 15. B4 rollback rules

### Revert B4 before B5/B6

B4 may be reverted as one commit.

Expected semantic result:

- B3 student links still carry `campaignId + publicationId`;
- Runtime returns to its pre-B4 local persistence reader path;
- cross-device student publication delivery is no longer available;
- Studio remote publication and activation wiring remain intact;
- no backend data migration needs to be undone because B4 performs reads only.

After revert, rerun the B3 identity suite, Runtime bootstrap integration, Runtime executable publication resolution and launch entry regressions.

### Revert after B5/B6

Do not remove B4 while later deployment/configuration or cross-device validation still depends on its Runtime remote reader contract.

Undo in reverse dependency order:

1. B6 cross-device closure/configuration that assumes remote Runtime reads;
2. B5 deployment/security/configuration changes that expose the publication endpoint to Runtime;
3. B4 Runtime remote readers;
4. B3 only if the launch identity contract itself must also be undone.

## 16. B5B deployment/configuration state

B5B completes the controlled deployment/configuration dependency that B4 intentionally deferred. The validated Apps Script web-app endpoint is now:

`https://script.google.com/macros/s/AKfycbwq4tKzIuPfJJ2tOEAHpEhLsg7tmWvPYQ5fJ8jLgo74lo1BT0Fw_eNgtE53VsMb_e33bA/exec`

Before committing that endpoint, the live probe confirmed public read access, rejection of an invalid teacher token and successful traversal of the valid teacher authorization boundary without creating any publication mutation. Runtime therefore has a deployable cross-device read path while remaining secret-free.

The remaining work is no longer architectural transport wiring: B6 must exercise the real teacher → published link → separate student browser/device flow end to end.

## 17. Forward dependency order

Current order:

1. B5A/B5A1 — teacher authorization and token policy: complete.
2. B5B — controlled Apps Script deployment and explicit Runtime/Studio publication endpoint configuration: complete once the endpoint-enable commit and replacement bundle are verified.
3. B6 — real cross-device end-to-end validation and final regressions.

Rollback remains reverse-order: undo B6 assumptions first, then B5B endpoint/configuration, then B5 authorization, then B4 Runtime readers.

## 18. Temporary-file policy

Files created only to transport or execute a tranche are temporary:

- `.patch`
- tranche-specific `.ps1`
- transport ZIPs
- transient JSON/results
- obsolete predecessor bundles

They may be deleted only after:

1. the change is applied;
2. required validation passes;
3. the commit is confirmed;
4. a current bundle is created and verified.

Permanent architecture/rollback documentation is never part of temporary cleanup.

## 19. B6A descriptive curriculum metadata boundary

A3-003B6A enriches `content.misiones` with pedagogical metadata without changing the remote transport or executable mission contract.

Each selected mission may now carry:

- a canonical `curriculum` reference defined by CRIOS;
- an optional campaign-specific `notaDocente`.

Mission difficulty and estimated duration already belong to the base mission metadata. Studio derives campaign duration as the sum of mission durations and campaign difficulty as the arithmetic mean of mission difficulties. The suggested ANEP reference is derived from the compatible intersection of mission curriculum references.

These fields are serialized inside publication content and therefore covered by the existing `contentHash`. They are not added to `runtimeExecutionManifest`, are not required by the declarative area handler and do not change `missionSpec`. The Runtime remote reader, publication identity contract and Apps Script persistence API remain unchanged.

This boundary is intentional: curriculum and teacher notes are descriptive/publication metadata, while `missionSpec + handler` remains the executable boundary. A pre-B6A Runtime may ignore the additional mission fields without needing a publication migration.

The permanent design and rollback contract is recorded in `docs/architecture/A3_CURRICULUM_METADATA_MODEL.md`.

### B6C — navegador LAN HTTP, SHA-256 y frontera segura de Studio

La validación cross-device B6 confirmó en Chrome 151 sobre Windows que un origen LAN `http://<ip>:<puerto>` no es un contexto seguro: `window.isSecureContext === false`, `crypto.subtle` no está disponible y `crypto.randomUUID` tampoco. En el mismo origen se verificó que tanto GET como POST hacia el Web App de Apps Script atraviesan correctamente la redirección a `script.googleusercontent.com` y que un POST con credencial deliberadamente inválida retorna `WRITE_UNAUTHORIZED` sin mutación.

CRIOS mantiene dos fronteras distintas:

- **Runtime/lectura publicada:** debe poder verificar `contentHash` también durante una validación cross-device sobre LAN HTTP. `publication-hash.js` conserva SHA-256 como algoritmo único, prefiere Web Crypto cuando está disponible y usa una implementación determinista equivalente solo cuando `crypto.subtle.digest` no existe.
- **Studio/escritura docente autenticada:** la clave docente no debe solicitarse desde un contexto inseguro. `studio-write-auth.js` falla cerrado con `INSECURE_CONTEXT` antes de mostrar el prompt cuando `window.isSecureContext === false`. Para desarrollo local, `localhost`/`127.0.0.1` o HTTPS son la frontera admitida para introducir la clave. Producción debe servirse por HTTPS.

El fallback SHA-256 no convierte HTTP en un canal seguro ni sustituye TLS. Solo preserva la verificación determinista de contenido donde el navegador no expone Web Crypto. La autoridad remota sigue recomputando `contentHash`, y las escrituras siguen requiriendo la clave docente efímera.
