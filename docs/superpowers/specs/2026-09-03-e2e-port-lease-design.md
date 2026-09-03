# E2E Port-Band Lease Design

**Date:** 2026-09-03  
**Status:** Approved design; awaiting written-spec review

## Purpose

Keep concurrent local E2E runs from selecting the same published-port band,
without maintaining lock files, owner tokens, stale-lock detection, or lock
recovery. The operating system will own the reservation and release it
automatically when its process exits.

This change replaces the lock subsystem in PR 2079. It preserves the important
invariant—one live E2E runner per port band—while removing the recovery system
whose race conditions caused the adverse review to reject the current design.

## Architecture

Each of the 500 existing E2E port bands maps to one dedicated loopback lease
port. Band `n` maps to TCP port `14000 + n` on `127.0.0.1`. The resulting lease
range is `14000-14499`, outside every published service-port range currently
derived by the E2E environment helper.

To reserve a band, the helper creates a Node `net.Server` and listens with
`exclusive: true` on its lease port. A successful bind grants the band. An
`EADDRINUSE` result means that another E2E runner—or an unrelated local
process—owns that lease port, so the helper tries the next band. Other bind
errors fail immediately with their cause.

The returned reservation owns the live server. Releasing the reservation
closes that server and awaits its `close` event. There are no files, process
IDs, timestamps, UUIDs, owner markers, stale-state heuristics, or reclamation
paths. If the runner crashes, the operating system closes its socket and makes
the band available again.

## Components and Interface

`e2e-compose-env.mts` will expose one asynchronous reservation operation. It
returns:

- the closed set of Compose environment variables required by the E2E stack;
- an asynchronous, idempotent `release()` operation backed by the live lease
  server.

The reservation helper owns all partial-acquisition cleanup. If project-name
derivation, service-port inspection, environment construction, or abort
handling fails after a lease binds, it closes the server before rejecting.

`run-e2e-front.mts` will be the only production owner of a reservation. It
installs its `SIGINT` and `SIGTERM` handlers before reservation begins, stores
the reservation only after successful acquisition, and releases it from the
outer lifecycle cleanup.

The Compose environment will no longer contain `E2E_LOCK_PATH` or
`E2E_LOCK_TOKEN`. The unused direct CLI, setup/teardown compatibility wrappers,
and file-lock exports will be removed rather than adapted.

## Runtime Flow

1. The runner installs signal handlers and creates an abort controller.
2. The helper checks for an already-requested abort.
3. For each candidate band, it binds the corresponding loopback lease port.
4. After a successful bind, it verifies the band's real published service
   ports and derives the Compose environment.
5. If setup succeeds, the runner removes any leftover stack belonging to that
   Compose project, starts the stack, and runs Playwright.
6. On success, command failure, setup failure after acquisition, or a handled
   signal, the runner tears down any owned Compose stack and awaits release of
   the lease.
7. A POSIX signal keeps its conventional exit status: 130 for `SIGINT` and 143
   for `SIGTERM`.

The existing rule for real service-port conflicts remains: a foreign process
occupying a service port makes that band unusable and produces an actionable
error; a known leftover stack belonging to this worktree may be removed by the
runner before startup.

## Error and Signal Handling

Signal handling covers the reservation window as well as child-process
execution and cleanup. If a signal arrives while a lease bind is pending, the
helper closes any server that subsequently binds and rejects with the signal
abort. Cleanup signals do not interrupt Compose teardown; they preserve the
original requested exit status after teardown finishes.

Lease release is observable and mandatory. If teardown and the E2E run would
otherwise succeed but closing the lease fails, the runner fails. If another
failure is already primary, the runner preserves that primary error and
reports the release failure as additional cleanup information.

The implementation will not claim identical signal semantics on Windows.
Automated real-signal and child/grandchild process-group proofs are POSIX-only.
Windows coverage verifies the `taskkill /T` termination plan and the portable
lease behavior; documentation and PR text will state that boundary plainly.

## Pruning Scope

The implementation removes the complete disk-lock ecosystem:

- lock-directory and lock-file creation;
- lock owner records and tokens;
- PID liveness and age checks;
- stale-lock markers and reclamation;
- lock-related environment variables and CLI output;
- tests and harness behavior whose only purpose is the removed mechanism.

It does not add a replacement guard, baseline, manifest, third-party locking
dependency, or second recovery mechanism. The TCP lease is the single source
of exclusivity.

## Verification

Focused tests must prove behavior, not implementation trivia:

- two independent processes competing for the same lease cannot own it
  simultaneously;
- a process crash releases its lease without application cleanup;
- an occupied lease port causes selection of another band;
- an occupied published service port is still detected;
- an exception after acquisition releases the lease;
- a signal during reservation cannot leak the lease;
- command failure still tears down the stack and releases the lease;
- a release failure cannot produce a successful result;
- POSIX signal tests prove the runner stops its child and grandchild and exits
  with the expected status;
- Windows unit tests continue to prove the intended `taskkill /T` argument
  plan without overstating live Windows signal coverage.

The obsolete stale-lock and marker race tests will be deleted. Existing
repository formatting, lint, typecheck, unused-code, dependency-audit, local
closure, and hosted CI gates remain required. A fresh adverse review from a
different model family must approve the exact pushed revision before merge.

## Success Criteria

- Concurrent E2E runners cannot receive the same port band.
- A crash cannot leave persistent reservation state behind.
- Every acquired lease is released on all handled success and failure paths.
- The runner observes and reports cleanup failures.
- No production file-lock or stale-recovery code remains.
- The resulting implementation and test suite are materially smaller and
  easier to reason about than the design they replace.
