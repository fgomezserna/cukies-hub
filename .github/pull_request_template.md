## Summary

- What changes:
- Why:
- Validation:

## Release mode

- [ ] Regular feature/fix targeting `staging`
- [ ] Normal promotion from `staging` to `main`
- [ ] Formal hotfix from `hotfix/*` to `main`

For a PR targeting `main`, create or update `.github/release/promotion.json` in the PR head after
the PR number is known. That file—not this mutable body or the labels—is the authorization source.
It must follow `.github/release/promotion.schema.json` and bind both the exact PR number and current
`main` base SHA. Any manifest change creates a new candidate SHA and invalidates earlier evidence.

## Informational release notes

- Candidate/head SHA:
- Staging deployment and QA URLs (normal promotion):
- Incident and production impact (hotfix):
- Why staging cannot wait (hotfix):
- Rollback:

## Checklist

- [ ] No secrets, generated env files or unrelated changes are included.
- [ ] Tests and checks for the touched area are recorded above.
- [ ] A normal promotion has the exact candidate deployed and approved in protected `Staging`.
- [ ] A hotfix has an incident, urgency, exception reason and rollback in the immutable manifest.
- [ ] Every merge to `main` will return through `sync/main-*`; that PR is reviewed, merged with a merge commit and never auto-merged.
