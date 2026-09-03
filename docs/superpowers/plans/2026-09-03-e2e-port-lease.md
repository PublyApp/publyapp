# E2E Port-Band Lease Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace persistent E2E port-band lock files with OS-owned loopback TCP leases that cannot survive their owning process.

**Architecture:** `e2e-compose-env.mts` asynchronously binds one exclusive loopback lease port per candidate band and returns the Compose environment plus an awaited, idempotent release function. `run-e2e-front.mts` installs signal handling before acquisition, owns the lease through teardown, and surfaces release failures without hiding an earlier primary failure.

**Tech Stack:** Node.js 24 ESM, TypeScript `.mts`, `node:net`, `node:test`, pnpm, Docker Compose, GitHub PR closure gate.

---

## File Map

- Modify `apps/front/scripts/e2e-compose-env.mts`: preserve naming and service-port inspection; replace the entire disk-lock API with the TCP lease API.
- Modify `apps/front/scripts/e2e-compose-env.test.mts`: replace stale-lock tests with real lease, crash, partial-failure, and runner tests.
- Modify `apps/front/scripts/run-e2e-front.mts`: register signals before reservation and await cleanup.
- Modify `apps/front/scripts/run-e2e-front.signal.test.mts` and `apps/front/scripts/run-e2e-front.signal-harness.mts`: prove socket release and process-tree cleanup with real POSIX signals.
- Preserve `apps/front/scripts/run-e2e-front.launch.test.mts`: retain Windows `taskkill /T` unit coverage, adapting types only if necessary.
- Modify `justfile`: describe unconditional teardown accurately.
- Update the PR body through `gh api`; do not add another repository document or guard.

### Task 1: Lock the new lease contract with RED tests

**Files:**
- Modify: `apps/front/scripts/e2e-compose-env.test.mts`
- Test: `apps/front/scripts/e2e-compose-env.test.mts`

- [ ] **Step 1: Replace lock-only imports and scaffolding**

Import the future public seam and remove private lock-root/file helpers:

```typescript
import {
  bandPortsFor,
  deriveProjectName,
  findOccupiedBandPorts,
  normalizeComposeName,
  reserveE2EComposeEnv,
  type E2EComposeEnv,
  type E2EComposeReservation,
} from './e2e-compose-env.mts';
```

Keep a test helper that closes a real `Server` by awaiting its close callback.

- [ ] **Step 2: Prove two live reservations cannot share a band**

```typescript
const first = await reserveE2EComposeEnv();
const second = await reserveE2EComposeEnv();
assert.notEqual(
  first.env.E2E_PORT_TRAEFIK_WEB,
  second.env.E2E_PORT_TRAEFIK_WEB,
);
await first.release();
await second.release();
```

Wrap acquisition in `try/finally`. Add a second test proving a released first band can be acquired again.

- [ ] **Step 3: Prove an occupied lease port is skipped**

Bind `127.0.0.1:14000` with a real server, reserve an environment, and assert `E2E_PORT_TRAEFIK_WEB === '8090'`. Close both resources in `finally`.

- [ ] **Step 4: Prove setup exceptions release partial acquisition**

Inject `deriveProjectName: () => { throw new Error('derivation failed'); }`, assert rejection, then bind port 14000 independently. The final bind succeeding proves cleanup.

- [ ] **Step 5: Run the test and observe RED**

```bash
pnpm --filter front exec node --test scripts/e2e-compose-env.test.mts
```

Expected: module-load failure because `reserveE2EComposeEnv` and `E2EComposeReservation` do not exist.

- [ ] **Step 6: Commit**

```bash
git add apps/front/scripts/e2e-compose-env.test.mts
git commit -m "test(e2e): define port lease contract"
```

### Task 2: Replace disk locks with a single deep lease API

**Files:**
- Modify: `apps/front/scripts/e2e-compose-env.mts`
- Modify: `apps/front/scripts/e2e-compose-env.test.mts`

- [ ] **Step 1: Delete the persistent-lock subsystem**

Remove lock-related crypto/fs/os imports; `DEFAULT_LOCK_ROOT`; owner records; PID, timestamp, token, marker, stale and reclaim functions; release aliases; the direct CLI; and setup/teardown compatibility wrappers. Retain only filesystem APIs required by repository-root discovery.

- [ ] **Step 2: Add the lease range and public types**

```typescript
import { createServer, type Server } from 'node:net';

const LEASE_HOST = '127.0.0.1';
const LEASE_BASE_PORT = 14000;

export type E2eComposeReservation = {
  env: E2eComposeEnv;
  release: () => Promise<void>;
};
```

Keep `E2eComposeEnv` closed and remove `E2E_LOCK_PATH` and `E2E_LOCK_TOKEN`. Add a normal module invariant asserting ports 14000–14499 do not overlap the maximum derived published-service port; do not add a guard or manifest.

- [ ] **Step 3: Implement an awaited bind primitive**

```typescript
const bindLease = async (port: number): Promise<Server | null> =>
  await new Promise((resolveBind, rejectBind) => {
    const server = createServer();
    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') resolveBind(null);
      else rejectBind(error);
    });
    server.once('listening', () => resolveBind(server));
    server.listen({ host: LEASE_HOST, port, exclusive: true });
  });
```

Make the actual implementation single-settlement: remove the opposite listener after either event and close any unexpectedly listening server on the losing/error path.

- [ ] **Step 4: Implement awaited idempotent release**

```typescript
const createRelease = (server: Server): (() => Promise<void>) => {
  let releasePromise: Promise<void> | undefined;
  return () => {
    releasePromise ??= closeLeaseServer(server);
    return releasePromise;
  };
};
```

`closeLeaseServer` must reject callback errors. Never convert release to a boolean.

- [ ] **Step 5: Implement abort-safe reservation**

```typescript
export const reserveE2EComposeEnv = async (
  abortSignal?: AbortSignal,
  dependencies: ReservationDependencies = {},
): Promise<E2EComposeReservation> => {
  // check abort; scan bands; bind; recheck abort; inspect; derive; return
};
```

After a successful bind, create `release` before service-port inspection or name derivation. Wrap all subsequent work in `try/catch`; on any error, await release before rethrowing. `EADDRINUSE` skips a band, other bind errors fail, and exhaustion retains the actionable all-bands-in-use message.

- [ ] **Step 6: Make focused tests GREEN**

```bash
pnpm --filter front exec node --test scripts/e2e-compose-env.test.mts
```

Expected: all retained naming/holder/service-port tests and all lease tests pass.

- [ ] **Step 7: Add a real crash proof**

Spawn a Node child that binds 14000, prints `READY`, and waits. Kill it without application cleanup, await exit, then bind 14000 in the parent. The parent bind must succeed; mocks do not satisfy this test.

- [ ] **Step 8: Commit**

```bash
git add apps/front/scripts/e2e-compose-env.mts apps/front/scripts/e2e-compose-env.test.mts
git commit -m "refactor(e2e): use OS-owned port leases"
```

### Task 3: Make the runner own acquisition through cleanup

**Files:**
- Modify: `apps/front/scripts/run-e2e-front.mts`
- Modify: `apps/front/scripts/e2e-compose-env.test.mts`
- Modify if required: `apps/front/scripts/run-e2e-front.launch.test.mts`

- [ ] **Step 1: Write RED acquisition-window tests**

Change dependency injection to this seam:

```typescript
type RunE2EFrontDependencies = {
  reserveEnv?: (signal: AbortSignal) => Promise<E2EComposeReservation>;
  runCommand?: RunCommand;
  writeError?: (message: string) => void;
};
```

Use a fake `reserveEnv` that observes abort and rejects with the abort reason. Assert signal handlers are active before reservation and no lifecycle command runs.

- [ ] **Step 2: Write RED release-precedence tests**

A fake reservation has `release: async () => { throw new Error('release failed'); }`. Assert release failure rejects an otherwise successful run. When Playwright fails with `test failed`, assert that remains primary and `writeError` additionally reports `release failed`.

- [ ] **Step 3: Run RED**

```bash
pnpm --filter front exec node --test scripts/e2e-compose-env.test.mts
```

Expected: failure because the runner still acquires synchronously before installing handlers and consumes lock path/token.

- [ ] **Step 4: Register signals before awaiting reservation**

```typescript
const abortController = new AbortController();
// install SIGINT/SIGTERM listeners here
let reservation: E2EComposeReservation | undefined;
try {
  reservation = await reserveEnv(abortController.signal);
  const commandEnv = { ...process.env, ...reservation.env };
  // execute lifecycle using commandEnv
} catch (error) {
  lifecycleError = error;
}
```

Only build the command step after the environment exists. Remove all lock-field dependencies.

- [ ] **Step 5: Await teardown and release with explicit precedence**

Attempt Compose teardown only when reservation succeeded, and keep the lease until teardown ends. Store `cleanupError` and `releaseError` independently. Final precedence is: lifecycle/acquisition error, cleanup signal, Compose teardown error, lease release error. Before throwing a higher-priority error, report lower-priority cleanup failures through `writeError`.

- [ ] **Step 6: Run GREEN**

```bash
pnpm --filter front exec node --test   scripts/e2e-compose-env.test.mts   scripts/run-e2e-front.launch.test.mts
```

Expected: all runner, lease, launch, and Windows plan tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/front/scripts/run-e2e-front.mts   apps/front/scripts/e2e-compose-env.test.mts   apps/front/scripts/run-e2e-front.launch.test.mts
git commit -m "fix(e2e): own lease through teardown"
```

### Task 4: Convert real signal proofs from files to sockets

**Files:**
- Modify: `apps/front/scripts/run-e2e-front.signal.test.mts`
- Modify: `apps/front/scripts/run-e2e-front.signal-harness.mts`

- [ ] **Step 1: Make the harness expose a real lease**

Replace its lock-file argument with an available loopback port. The injected `reserveEnv` binds the port, publishes readiness only after binding, and returns an awaited release. Add an `acquiring` mode that pauses after runner handlers are installed but before reservation resolves.

- [ ] **Step 2: Probe the lease from the parent**

Before signalling, a parent bind on the lease port must fail with `EADDRINUSE`. After harness exit, the same bind must succeed. Replace `lockReleased` names and file-existence assertions with `leaseReleased` and socket probes.

- [ ] **Step 3: Add the acquisition-window real-signal proof**

Start `acquiring` mode, wait for its readiness marker, send `SIGINT`, assert exit 130, and prove the lease port is bindable. Keep the suite's existing POSIX-only skip.

- [ ] **Step 4: Preserve child/grandchild proofs**

For normal SIGINT, SIGTERM, and cleanup-window SIGINT, retain the real descendant-liveness assertion. Do not weaken readiness synchronization.

- [ ] **Step 5: Run**

```bash
pnpm --filter front exec node --test scripts/run-e2e-front.signal.test.mts
```

Expected on POSIX: every signal/process-tree/socket proof passes. Expected on Windows: intentional platform skip.

- [ ] **Step 6: Commit**

```bash
git add apps/front/scripts/run-e2e-front.signal.test.mts   apps/front/scripts/run-e2e-front.signal-harness.mts
git commit -m "test(e2e): prove signal-safe lease cleanup"
```

### Task 5: Prune obsolete surfaces and correct prose

**Files:**
- Modify: `apps/front/scripts/e2e-compose-env.mts`
- Modify: `apps/front/scripts/e2e-compose-env.test.mts`
- Modify: `justfile`

- [ ] **Step 1: Scan for removed vocabulary**

```bash
rg -n "E2E_LOCK_|DEFAULT_LOCK_ROOT|LockOwner|getLockFilePath|isLockStale|reclaimStaleLock|acquireLockDir|releasePortBand|setupE2EComposeEnv|teardownE2EComposeEnv" apps/front justfile docs
```

Expected: no production call site. Remove or rename remaining test-only vocabulary unless it explicitly describes the deleted historical design.

- [ ] **Step 2: Delete obsolete tests**

Delete owner-record, PID-liveness, age, transition-marker, late-reclaimer, token-mismatch, filesystem-permission, old CLI, and compatibility-wrapper tests. Retain naming, actual service-port conflicts, socket ownership, cleanup, signals, and Windows child-tree planning.

- [ ] **Step 3: Correct the justfile comment**

Keep `ci-e2e-front` as one Node invocation. Say the runner derives an isolated project/port band and tears down on success, failure, and handled signals. Remove any claim that failed stacks remain up.

- [ ] **Step 4: Format and lint**

```bash
pnpm exec oxfmt --check   apps/front/scripts/e2e-compose-env.mts   apps/front/scripts/e2e-compose-env.test.mts   apps/front/scripts/run-e2e-front.mts   apps/front/scripts/run-e2e-front.signal.test.mts   apps/front/scripts/run-e2e-front.signal-harness.mts   apps/front/scripts/run-e2e-front.launch.test.mts justfile
npx oxlint   apps/front/scripts/e2e-compose-env.mts   apps/front/scripts/e2e-compose-env.test.mts   apps/front/scripts/run-e2e-front.mts   apps/front/scripts/run-e2e-front.signal.test.mts   apps/front/scripts/run-e2e-front.signal-harness.mts   apps/front/scripts/run-e2e-front.launch.test.mts
```

Expected: formatting exits 0 and Oxlint reports 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/front/scripts/e2e-compose-env.mts   apps/front/scripts/e2e-compose-env.test.mts   apps/front/scripts/run-e2e-front.signal.test.mts   apps/front/scripts/run-e2e-front.signal-harness.mts justfile
git commit -m "refactor(e2e): prune disk lock machinery"
```

### Task 6: Verify, push once, and obtain adverse approval

**Files:**
- Verify all modified files.
- Update the PR body via GitHub API.
- Create exact-head Spec and Standards review records under `.dump/reviews/`.

- [ ] **Step 1: Run all focused tests**

```bash
pnpm --filter front exec node --test   scripts/e2e-compose-env.test.mts   scripts/run-e2e-front.launch.test.mts   scripts/run-e2e-front.signal.test.mts
```

Expected: every applicable test passes, with only documented platform skips.

- [ ] **Step 2: Run proportional gates, one heavy command at a time**

```bash
pnpm --filter front typecheck
just knip
pnpm audit --audit-level=moderate
pnpm --filter front audit --audit-level=moderate
```

Expected: every command exits 0 and audits report no moderate-or-higher production advisory.

- [ ] **Step 3: Verify the exact diff**

```bash
git diff --check origin/develop...HEAD
git status --short
git diff --stat origin/develop...HEAD
```

Expected: clean status, no whitespace errors, and a material net deletion in the E2E lock subsystem. Rerun the focused test after any correction.

- [ ] **Step 4: Push the feature branch once**

```bash
git push origin fix/2073-e2e-env-shell
```

Expected: remote tip equals the locally verified revision.

- [ ] **Step 5: Correct and verify the PR description**

Use `gh api -X PATCH` with a body file or safely quoted form data. Never place Markdown backticks inside a double-quoted shell argument. State that live signal/process-tree proofs are POSIX-only; Windows proves the `taskkill /T` plan and portable socket leasing. Read the body back.

- [ ] **Step 6: Record official local verification**

```bash
/home/radan/ai-orchestration-playbook/tools/pr-closure record-verification   --config .ai/project-closure-v1.json --pr 2079
```

Expected: evidence recorded for the exact pushed head; failure or mismatch remains failure.

- [ ] **Step 7: Wait for hosted CI**

```bash
gh pr view 2079 --repo PublyApp/publyapp   --json headRefOid,statusCheckRollup,mergeable,mergeStateStatus,state,url
```

Expected: all required contexts present and green at the same head.

- [ ] **Step 8: Obtain fresh cross-family reviews**

Use GPT-5.6 Sol High for separate Spec and Standards reviews bound to the exact pushed head and merge base. Save schema-1 records under `.dump/reviews/` and import them through the closure tool. Both must say `APPROVED`; changes-required, malformed, or mismatched evidence returns to implementation.

- [ ] **Step 9: Merge through the closure state machine**

Merge only when the shared transition check allows it at the reviewed head. Then close the security-only PR transparently as superseded and remove the merged worktree and local/remote feature branch under repository cleanup rules.

