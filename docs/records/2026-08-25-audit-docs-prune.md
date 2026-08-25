# Audit — docs/ prune inventory (#1357)

Date: 2026-08-25. Generated evidence for the #1357 docs prune; regenerate with
`node packages/scripts-ts/src/audit-docs-prune.ts` (`--check` enforces byte equality).
The audit reads the youngest origin/develop first-parent tree that still carries every
decision-table source (the pre-prune tree — normally the merge-base of origin/develop
and HEAD; once the prune has landed, the walk steps back over pruned commits), so the
evidence stays reproducible after the prune lands; `--rev <sha>` overrides. The decision
table lives in that script, so the prune is mechanical rather than hand-curated.

Scope: every tracked file under `docs/` outside `guides/`, `deployment/`, `assets/`.
`docs/README.md` appears once below (kept; rewritten as the filing page in this change).

Survival rule (mechanical, from #1357): a record survives only if referenced by
`AGENTS.md`, `DESIGN.md`, `docs/guides`, `docs/deployment`, `apps/`, `packages/`,
`.github` or the justfile; the root README.md is deliberately NOT a surface.
References inside `docs/README.md`, the archive
indexes, and the archive-records guard manifest (`ci-gate-manifest.json`) do NOT count.
A reference is either the exact repo-relative path appearing verbatim in a surface file
or a resolvable relative markdown link from one.

Counts: 94 candidate file(s) — 11 moved to `docs/records/`, 1 kept in place, 82 deleted.

## Notes

- PR #1355 added `docs/superpowers/specs/2026-08-25-paid-modules-design.md` to develop
  while this lane was in flight, so it appears above once the merge-base includes it.
  No survival surface references it, but the lane deliberately preserves work develop
  already merged instead of deleting it in the prune: it lands at
  `docs/records/2026-08-25-spec-open-core-paid-modules.md` (explicit `topic`:
  deriveTopic() alone would name it `-paid-modules`, not what landed). `--check`
  cross-validates every row against git rename detection, so this mapping cannot
  drift from what actually moved.
- The same applies to `docs/superpowers/specs/2026-08-25-820-bulk-actions-design.md`,
  which #1385 merged into develop mid-flight: no surface references it, and it is
  preserved on the same precedent, landing at
  `docs/records/2026-08-25-spec-820-bulk-actions.md` (default topic derivation).
  Likewise `docs/analysis/2026-08-24-dlq-unclassified-triage-design.md`, modified
  on develop after this lane pruned it: it stays DELETED per the mechanical rule
  (unreferenced by any survival surface; its history remains in git).
- From this change on, the superpowers skills write specs/plans/reviews into `docs/records/`
  (`YYYY-MM-DD-<type>-<topic>.md`), not into `docs/superpowers/`.
- Guards that enumerated the pruned trees (`check-archive-records*`, the docs-archive
  workflow's archive steps, their manifest entries) are removed or retargeted in the
  following commits — a guard left asserting an empty set would pass vacuously.
- Dates for records without a date in their filename are the git first-add date
  (`git log --reverse --diff-filter=A`), so the flattening renames carry provenance.

## Inventory

| File | Referenced by (survival surfaces) | Decision |
| --- | --- | --- |
| `docs/README.md` | AGENTS.md, justfile | keep (rewritten in place) |
| `docs/analysis/2026-08-24-dlq-unclassified-triage-design.md` | _(nothing)_ | delete |
| `docs/archive/2025/incidents/HTTPONLY_COOKIE_ISSUE_SUMMARY.md` | _(nothing)_ | delete |
| `docs/archive/2025/incidents/secure-httponly-cookie-clearing.md` | _(nothing)_ | delete |
| `docs/archive/2026/assets/logo-idea.svg.md` | _(nothing)_ | delete |
| `docs/archive/2026/checklists/tenant-module-smoke-test-checklist.md` | _(nothing)_ | delete |
| `docs/archive/2026/designs/2026-03-28-typescript-6-native-imports-design.md` | _(nothing)_ | delete |
| `docs/archive/2026/designs/2026-04-06-status-model-unification-design.md` | _(nothing)_ | delete |
| `docs/archive/2026/designs/2026-04-06-tenant-users-global-suspension-visibility-design.md` | _(nothing)_ | delete |
| `docs/archive/2026/designs/2026-04-09-staff-user-profiles-permissions-design.md` | _(nothing)_ | delete |
| `docs/archive/2026/designs/2026-04-10-sync-language-preference-across-tabs-design.md` | _(nothing)_ | delete |
| `docs/archive/2026/designs/2026-04-13-staff-profile-users-drawer-search-design.md` | _(nothing)_ | delete |
| `docs/archive/2026/designs/2026-04-13-table-first-column-neutral-icons-design.md` | _(nothing)_ | delete |
| `docs/archive/2026/designs/2026-04-14-staff-user-details-layout-and-profile-preview-design.md` | _(nothing)_ | delete |
| `docs/archive/2026/designs/2026-04-22-tenant-profiles-module-completion-design.md` | _(nothing)_ | delete |
| `docs/archive/2026/designs/2026-04-25-staff-users-table-full-upgrade-design.md` | _(nothing)_ | delete |
| `docs/archive/2026/designs/2026-04-26-issue-190-full-service-attribute-cutover-design.md` | _(nothing)_ | delete |
| `docs/archive/2026/designs/2026-04-28-cross-tab-theme-sync-design.md` | _(nothing)_ | delete |
| `docs/archive/2026/designs/2026-04-30-marketing-supporting-pages-design.md` | _(nothing)_ | delete |
| `docs/archive/2026/designs/2026-05-01-marketing-pricing-design.md` | _(nothing)_ | delete |
| `docs/archive/2026/designs/2026-05-02-cursor-sort-field-handler-design.md` | _(nothing)_ | delete |
| `docs/archive/2026/designs/2026-05-02-marketing-legal-design.md` | _(nothing)_ | delete |
| `docs/archive/2026/designs/2026-05-03-marketing-blog-design.md` | _(nothing)_ | delete |
| `docs/archive/2026/designs/2026-05-03-marketing-company-trio-and-404-design.md` | _(nothing)_ | delete |
| `docs/archive/2026/designs/2026-05-04-issue-218-service-args-records-design.md` | _(nothing)_ | delete |
| `docs/archive/2026/designs/2026-05-06-marketing-changelog-design.md` | _(nothing)_ | delete |
| `docs/archive/2026/designs/2026-05-07-cross-surface-error-view-design.md` | _(nothing)_ | delete |
| `docs/archive/2026/designs/2026-05-07-staff-tenant-user-details-page-design.md` | _(nothing)_ | delete |
| `docs/archive/2026/designs/2026-05-08-dashboard-user-menu-prefs-design.md` | _(nothing)_ | delete |
| `docs/archive/2026/designs/2026-05-10-tenant-layout-access-gate-design.md` | _(nothing)_ | delete |
| `docs/archive/2026/designs/2026-05-11-issue-391-session-hard-delete-design.md` | _(nothing)_ | delete |
| `docs/archive/2026/designs/2026-05-12-audit-logs-filters-upgrade-design.md` | _(nothing)_ | delete |
| `docs/archive/2026/designs/2026-05-16-audit-log-detail-variants-design.md` | _(nothing)_ | delete |
| `docs/archive/2026/designs/2026-05-19-audit-log-list-inspect-drawer-design.md` | _(nothing)_ | delete |
| `docs/archive/2026/designs/2026-05-30-readme-premium-glow-up-design.md` | _(nothing)_ | delete |
| `docs/archive/2026/designs/2026-06-19-front-2-tanstack-heroui-migration-design.md` | _(nothing)_ | delete |
| `docs/archive/2026/designs/2026-06-20-front-2-phase-1-foundations-design.md` | _(nothing)_ | delete |
| `docs/archive/2026/designs/2026-06-20-openapi-deterministic-output-design.md` | _(nothing)_ | delete |
| `docs/archive/2026/designs/2026-07-09-front-2-gray-ui-stack-migration-design.md` | DESIGN.md | move → `docs/records/2026-07-09-spec-front-2-gray-ui-stack-migration.md` |
| `docs/archive/2026/designs/2026-07-09-front-2-navigation-registry-design.md` | _(nothing)_ | delete |
| `docs/archive/2026/designs/2026-07-15-front-2-mutation-toast-feedback-design.md` | _(nothing)_ | delete |
| `docs/archive/2026/designs/2026-07-15-gray-ui-form-control-outline-parity-design.md` | _(nothing)_ | delete |
| `docs/archive/2026/designs/2026-07-15-status-filter-multiselect-consistency-design.md` | _(nothing)_ | delete |
| `docs/archive/2026/designs/2026-07-22-front-2-runtime-env-and-analytics-hardening-design.md` | _(nothing)_ | delete |
| `docs/archive/2026/guides/deployment-guide.md` | docs/deployment/production-deployment-design.md | move → `docs/records/2026-07-29-spec-deployment-guide.md` |
| `docs/archive/2026/guides/error-views.md` | _(nothing)_ | delete |
| `docs/archive/2026/guides/frontend-architecture.md` | _(nothing)_ | delete |
| `docs/archive/2026/guides/frontend-coding-standards.md` | _(nothing)_ | delete |
| `docs/archive/2026/guides/frontend-route-file-organization.md` | _(nothing)_ | delete |
| `docs/archive/2026/guides/marketing-surface-conventions.md` | _(nothing)_ | delete |
| `docs/archive/2026/guides/tailwind-to-sx-mapping.md` | _(nothing)_ | delete |
| `docs/archive/2026/plans/2026-07-08-front-2-staff-admin-design-handoff.md` | _(nothing)_ | delete |
| `docs/archive/old-front/README.md` | _(nothing)_ | delete |
| `docs/archive/old-front/i18n-keys.md` | _(nothing)_ | delete |
| `docs/archive/old-front/routes.md` | _(nothing)_ | delete |
| `docs/archive/old-front/screens/marketing.md` | apps/front/src/lib/flags.ts | move → `docs/records/2026-08-22-review-old-front-marketing-screens.md` |
| `docs/archive/old-front/screens/staff-tenant-users.md` | docs/guides/bulk-action-ux-conventions.md | move → `docs/records/2026-08-22-review-old-front-staff-tenant-users-screens.md` |
| `docs/archive/old-front/screens/tenant-workspace.md` | _(nothing)_ | delete |
| `docs/audits/2026-07-31-kiota-cross-origin-redirect-header-leak.md` | apps/front/src/lib/api-client/client-manager.redirect-scrub.test.ts, docs/guides/dependency-health.md | move → `docs/records/2026-07-31-audit-kiota-cross-origin-redirect-header-leak.md` |
| `docs/front-migration/artboard-assertion-registry.md` | _(nothing)_ | delete |
| `docs/front-migration/parity-contract.md` | apps/front/src/routes/authed/staff/staff-users.tsx, apps/front/src/routes/authed/staff/tenant-users/$userId-organizations.tsx, docs/guides/front/conventions.md | move → `docs/records/2026-07-29-spec-front-parity-contract.md` |
| `docs/front-migration/parity-status.md` | _(nothing)_ | delete |
| `docs/front-migration/staging-deploy.md` | _(nothing)_ | delete |
| `docs/front-migration/tenants-design-002-gap-analysis.md` | _(nothing)_ | delete |
| `docs/implementation-plans/di-strategy.md` | _(nothing)_ | delete |
| `docs/implementation-plans/identity-scoped-tenant-cookie.md` | packages/shared-ts/src/lib/constants.ts | move → `docs/records/2026-01-31-plan-identity-scoped-tenant-cookie.md` |
| `docs/implementation-plans/jobs-worker-infrastructure.md` | _(nothing)_ | delete |
| `docs/misc/bulk-seeding-utilities.md` | _(nothing)_ | delete |
| `docs/records/2026-08-25-analysis-email-log-actor.md` | _(nothing)_ | delete |
| `docs/reviews/jobs-infra-design-challenge/doc-challenge-r1-findings.md` | _(nothing)_ | delete |
| `docs/reviews/jobs-infra-design-challenge/doc-challenge-r10-findings.md` | _(nothing)_ | delete |
| `docs/reviews/jobs-infra-design-challenge/doc-challenge-r2-findings.md` | _(nothing)_ | delete |
| `docs/reviews/jobs-infra-design-challenge/doc-challenge-r3-findings.md` | _(nothing)_ | delete |
| `docs/reviews/jobs-infra-design-challenge/doc-challenge-r4-findings.md` | _(nothing)_ | delete |
| `docs/reviews/jobs-infra-design-challenge/doc-challenge-r5-findings.md` | _(nothing)_ | delete |
| `docs/reviews/jobs-infra-design-challenge/doc-challenge-r6-findings.md` | _(nothing)_ | delete |
| `docs/reviews/jobs-infra-design-challenge/doc-challenge-r7-findings.md` | _(nothing)_ | delete |
| `docs/reviews/jobs-infra-design-challenge/doc-challenge-r8-findings.md` | _(nothing)_ | delete |
| `docs/reviews/jobs-infra-design-challenge/doc-challenge-r9-findings.md` | _(nothing)_ | delete |
| `docs/roadmaps/customer-mvp/mvp-implementation-guide.md` | _(nothing)_ | delete |
| `docs/spikes/2026-06-07-spec-naming-guard.md` | _(nothing)_ | delete |
| `docs/superpowers/plans/2026-08-01-marketing-landing-bands.md` | _(nothing)_ | delete |
| `docs/superpowers/plans/2026-08-22-b2-posts-drafts-and-composer.md` | _(nothing)_ | delete |
| `docs/superpowers/plans/2026-08-22-c1bis-social-accounts-foundations.md` | _(nothing)_ | delete |
| `docs/superpowers/plans/2026-08-22-scripts-ts-workspace-package.md` | _(nothing)_ | delete |
| `docs/superpowers/reviews/2026-06-19-front-2-phase-0-findings.md` | _(nothing)_ | delete |
| `docs/superpowers/specs/2026-07-21-front-2-i18n-namespace-architecture-design.md` | _(nothing)_ | delete |
| `docs/superpowers/specs/2026-08-01-marketing-landing-bands-design.md` | DESIGN.md | move → `docs/records/2026-08-01-spec-marketing-landing-bands.md` |
| `docs/superpowers/specs/2026-08-22-b2-posts-drafts-and-composer-design.md` | _(nothing)_ | delete |
| `docs/superpowers/specs/2026-08-22-epic-c-social-accounts-design.md` | _(nothing)_ | delete |
| `docs/superpowers/specs/2026-08-22-epic-d-publishing-scheduling-design.md` | AGENTS.md, DESIGN.md | move → `docs/records/2026-08-22-spec-epic-d-publishing-scheduling.md` |
| `docs/superpowers/specs/2026-08-22-scripts-ts-workspace-package-design.md` | _(nothing)_ | delete |
| `docs/superpowers/specs/2026-08-25-820-bulk-actions-design.md` | _(nothing)_ | move → `docs/records/2026-08-25-spec-820-bulk-actions.md` |
| `docs/superpowers/specs/2026-08-25-paid-modules-design.md` | _(nothing)_ | move → `docs/records/2026-08-25-spec-open-core-paid-modules.md` |

(94 rows — end of inventory)
