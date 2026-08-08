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

Through B3 the identity is transported end-to-end, but remote Runtime readers are intentionally not wired yet. Remote resolution is B4.

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

The following commits form the remote-publication path before B3:

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

Until B5:

- no production publication endpoint is embedded;
- no write token is embedded in public JavaScript;
- the existing results endpoint must not be reused as an implicit publication-mutation credential path;
- remote configuration remains explicit and opt-in;
- live deployment is deferred.

## 12. Known limitation at B3

B3 transports exact publication identity but does not yet fetch that publication remotely in Runtime.

Therefore B3 alone does not complete cross-device student delivery.

B4 must inject remote Runtime readers and resolve the exact active publication without guessing or local-only fallback.

## 13. Forward dependency order

From B3:

1. B4 — Runtime remote publication readers.
2. B5 — teacher authorization and controlled Apps Script deployment.
3. B6 — real cross-device end-to-end validation and regressions.

The order matters for rollback: undo later dependencies before undoing their identity contract.

## 14. Temporary-file policy

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
