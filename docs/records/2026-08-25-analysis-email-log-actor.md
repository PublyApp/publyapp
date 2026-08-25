# Chantier #866 — email_log §4.4 provider-evidence transitions: the actor-less audit defect (K-6) — design

Date: 2026-08-25. Lane `lane/wt-866`, worktree `.worktrees/wt-866`. Closes #866 (K-6 of the
#852 jobs design §11). Refs #852, #194, #809, #863 (R10-3/O30 precedent).

## 1. The decisive fact: §4.4's specified audit write is unbuildable

Jobs-infra design §4.4 ("Permitted evidence transitions", R3-8/O14) specifies that
`EmailLogWriter.ApplyProviderEvidenceAsync` performs, in one transaction, a conditioned update
plus "an immutable existing `AuditLog` entry" containing the transition's ids, outcomes,
evidence source and actor/system identity. The shipped `audit_logs` table cannot carry that
entry: `user_id` is `NOT NULL` with an FK to `users` (`FK_audit_logs_users_user_id`), and a
provider webhook (or a reconciliation import) has **no user**. Any `audit_logs` insert
specified for those transitions is unconstructible — exactly the defect R10-3 identified for
the terminal classification path, and fixed there with the actor-less evidence table
`job_dead_letter_events` (O30; landed by the sibling lane as `db86cd814`). §11 K-6 names the
same defect for §4.4 and directs: "apply O30's pattern … under a
`email_log_evidence_events` table."

Like #863, the downstream machinery does not exist yet on develop: there is no
`ApplyProviderEvidenceAsync`, no webhook outcomes (`Delivered/Bounced/Complained`),
no webhook endpoint. The defect therefore lives in the **contract** the next packet will
build against. This chantier closes it at the contract level, additively.

## 2. Scope ruling

### In scope

1. **Schema (expand-only migration `AddEmailLogEvidenceEvents`)**: new append-only evidence
   table `email_log_evidence_events` mirroring `job_dead_letter_events` — uuidv7 PK
   (`pk_email_log_evidence_events`), FK CASCADE to `email_log`
   (`fk_email_log_evidence_events_email_log_id`), covering index
   `ix_email_log_evidence_events_email_log_id (email_log_id, occurred_at)`, columns:
   `event` (vocabulary), `actor_kind`, `actor_id`, `prior_outcome`, `new_outcome`,
   `details` jsonb, `occurred_at` (DB `now()`, F11). **No actor column may be nullable and no
   column maps a user id**: a transition without a human actor still names its author
   (`actor_kind`/`actor_id` — e.g. `provider_webhook` / the provider event id), never a null
   and never a fabricated `users.id`. No FK to `users` anywhere on the table.
2. **The transition contract**: `IEmailLogWriter.ApplyProviderEvidenceAsync` — §4.4's single
   conditioned-update path, owning its transaction, enforcing the edge allowlist
   (`LegacySubmissionUnverified → Submitted` today; the `Submitted → Delivered|Bounced|
   Complained` rows arrive with the webhook packet's enum members), forward-only outcomes,
   `evidence_source`/`provider_event_id`/`updated_at` stamping, replay rejection via
   `ux_email_log_provider_event_id` — and recording history as an
   `email_log_evidence_events` row whose `actor_kind`/`actor_id` are REQUIRED arguments.
   **No `audit_logs` write.** The dashboard rebuilds history from the evidence table (the
   §4.4 sentence pointing at `AuditLog` is superseded by K-6's fix direction; a follow-up doc
   edit is out of this lane's additive-diff scope and noted in the PR).
3. **Architecture guard** (`Lib/Architecture/EmailEvidenceAuditActorGuard.Spec.cs`): pins, by
   reflection, that (a) the evidence-transition contract exists and every transition method's
   arguments carry a REQUIRED non-nullable `ActorKind`/`ActorId`; (b) the evidence entity
   carries no user-attributed column and stays `INoTenantEntity`. Vacuity-guarded so it fails
   loudly if the surface disappears.

### Out of scope (other lanes / later packets)

- `job_dead_letter*` anything (lanes #863/#864/#865 own that area): no edits to
  `DeadLetterRetentionHandler`, `JobQueueMonitorService`, or any Jobs-module file.
- The webhook endpoint, auth/idempotency envelope, and the `EmailLogOutcome` webhook members
  (the later §4.4 webhook build packet).
- Editing `docs/implementation-plans/jobs-worker-infrastructure.md` (records are dated, not
  retro-edited; the superseded §4.4 sentence is flagged in the PR instead).

## 3. Why an evidence table and not a system-user audit row

The brief rules out "a null or a fake user". A dedicated `system` user row in `users` would be
a fake user (it would leak into user-facing surfaces, sessions, retention, and the staff
directory); making `audit_logs.user_id` nullable would loosen a shipped integrity constraint
across every consumer for one future writer — a contract regression, and the brief forbids
loosening guards. O30's ruling stands: engine/provider-owned transitions get **their own**
append-only, actor-less-but-actor-NAMING evidence table with an FK to the row they describe.
`detected_by`/`actor_kind` is a controlled vocabulary string, not a user reference.

Why TWO columns here where O30 used one (`detected_by`) — deliberate, not drift: §4.4's
dashboard must distinguish WHO produced a transition (the kind: provider webhook vs
reconciliation import) from the correlation text it carries (provider event id / import
batch id) without parsing free text, and `actor_kind` alone backs the database CHECK
constraint `ck_email_log_evidence_events_actor_kind`, which a merged single column cannot
express cleanly. The split keeps both halves machine-checkable end to end
(`EmailLogActor` factories → column CHECKs); this paragraph is the recorded reason the
shape diverges from `job_dead_letter_events`.

## 4. Tests (TDD, paired proof)

1. RED (structural): the architecture guard — fails while no evidence-transition contract
   exists; pins the required actor identity afterwards.
2. RED (runtime, Testcontainers): `Migrations/AddEmailLogEvidenceEvents.Spec.cs` pins the
   shipped schema (NOT NULL actor columns, CASCADE to `email_log`, **zero** FKs to `users`);
   `Modules/Messaging/Services/EmailLogWriter.Spec.cs` drives real transitions: legacy-unverified
   → submitted with a provider actor (exactly one evidence row, `actor_kind='provider_webhook'`,
   **`audit_logs` count unchanged** — the #866 defect stated as a test), edge-rejection,
   event-replay rejection, unknown-target.
3. Paired proof: with the production writer hunk mutated back to the defective shape (skip the
   evidence row / write `audit_logs` instead), the spec goes RED; restoring it goes GREEN.
   Transcript in the PR body.

## 5. Gates

Under `~/ai-orchestration-playbook/tools/heavy.sh`: targeted API specs, then the full API
suite once. `just check-write`, `just ci-drift`. No front files touched; no local e2e
(captain policy 2026-08-23). Snapshot kept in sync via `just db-add`.

## 6. Round-1 review amendments (same day, pre-merge)

Applied during the fix round of PR #1389, before landing, so this record ships accurate:

- The actor became a real VALUE type (`EmailLogActor`, vocabulary-restricted Kind,
  non-empty bounded Id enforced in its constructor) carried by every
  `IEmailLogTransition` implementor; empty-string authors throw before any DB write.
- The same invariants were pushed into the schema as CHECK constraints
  (`ck_email_log_evidence_events_actor_kind/_id`), so raw-SQL writers are bound too.
- Replay rejection got its EXPLICIT artifact: `provider_event_id` on the evidence row
  itself with the partial unique index `ux_email_log_evidence_events_provider_event_id`
  (an earlier draft claimed this index existed without creating it — fixed).
- This file moved from `docs/analysis/…-design.md` to `docs/records/` (docs pruning,
  #1357/#1395).

### Scope honesty

As of this round there is **no provider-webhook endpoint on develop**: nothing in
production calls `IEmailLogWriter.ApplyProviderEvidenceAsync` yet. The method's only
callers are its specs, which drive the writer through a real scoped DI container over
Testcontainers Postgres — exactly how the future webhook packet will resolve it. The
transition path, its allowlist, its replay index, and its loud refusals are production
code exercised by integration tests; they become reachable in production when the
webhook endpoint lands (design §4.4's Submitted → Delivered/Bounced/Complained edges).
