# A3-003B7A — Campaign identity model

## Purpose

CRIOS Studio must assign every independently created campaign its own stable identity before publication.

## Product rule

A new Studio draft receives a generated `campaignId`.

The identifier:

- is generated automatically;
- is not entered by the user;
- remains stable while the draft is edited;
- is reused by later publications of that same campaign;
- is different for independently created campaigns;
- is not derived from campaign name, scenario or mission content.

Each publication still receives its own independent `publicationId`.

## Implementation

`js/studio/modelo/campaign-draft.js` creates the identifier when the draft is created.

Preferred source:

`window.crypto.randomUUID()`

Fallback:

timestamp plus random suffix when `randomUUID` is unavailable.

The public shape is:

`campaign-<generated suffix>`

The Studio publication adapter consumes the draft identifier instead of falling back to the historical demonstration campaign identity.

## Files

Production:

- `js/studio/modelo/campaign-draft.js`

Regression:

- `tests/studio-campaign-identity-node.test.js`

## Validation

Focused regression:

- 6/6 PASS

The test proves:

- a new draft receives an identity;
- compatibility snapshots preserve it;
- editing does not change it;
- defensive snapshots cannot mutate it;
- the publication adapter receives it;
- independent drafts receive different identities.

## Rollback

Before commit, the external A3-003B7A rollback payload can restore the previous `campaign-draft.js` and remove the added regression.

After commit, revert the commit containing A3-003B7A.

No stored campaign migration is required because the change only affects newly created Studio drafts.

## Relationship with B7B

B7A provides the stable campaign identity required by B7B direct immutable publication links.

A shared publication is therefore identified by:

`campaignId + publicationId`
