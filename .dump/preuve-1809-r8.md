# Proof: CI Drift Ratchet Fix — Round 8 (#1809-r8)

## Bug Summary

CI drift ratchet bug (#1709): the "floor" of pinned CI step IDs was being read
from `git HEAD` (which IS the attacker's commit in a PR), not from the
merge-base with `origin/develop` (the last reviewed-and-merged state).

The round-7 fix addressed the **uncommitted working-tree edit** attack (attacker
edits the working-tree `reason-guard-ref.json` to lower `pinned_step_ids` while
removing a step). But the **committed 3-part attack** remained open on both
the enforcement side (`check-ci-drift.ts`) and the generation side
(`gen-reason-ref.ts`):

1. Delete a CI step (from YAML + manifest)
2. Remove the step from `pinned_step_ids` in `reason-guard-ref.json`
3. Regenerate the reference

Because step 3 commits the new (lowered) floor, reading the floor from HEAD
makes HEAD agree with the removal — the ratchet never sees the step as "vanished".

## Fix Applied

### `check-ci-drift.ts` (enforcement)

- **`readRatchetFloorFromGit`**: reads `pinned_step_ids` from
  `git show <merge-base>:reason-guard-ref.json`, where
  `<merge-base>` = `git merge-base origin/develop HEAD`.
  **Strict refusal**: if the merge-base cannot be resolved (no git, not a repo,
  no `origin/develop`, no common ancestor), the function refuses to run
  (throws). No fallback to the working tree or to HEAD.

- **`readRefFromGit`**: reads the reason-guard reference from
  `git show HEAD:reason-guard-ref.json`. This uses HEAD because legitimate
  reason rewrites must be authorized at HEAD.

- **`findCiDrift`**: now accepts separate `reasonRef` and `ratchetFloorRef`
  overrides. Uses the floor (merge-base) for the ratchet check, the ref (HEAD)
  for the reason guard.

### `gen-reason-ref.ts` (generation)

- **`readFloorFromGit`**: reads `pinned_step_ids` from
  `git show <merge-base>:reason-guard-ref.json`.
  **Fallback to HEAD**: if the merge-base can't be resolved (e.g. local
  without fetched `origin/develop`), falls back to `git show HEAD:` — still
  committed, not working-tree. This catches uncommitted edits but not
  committed floor-lowering (which enforcement handles).

- **Deletion attack detection**: if the file doesn't exist at both merge-base
  and HEAD, runs `git log --oneline --all -- <file>`. If git log has output,
  the file was committed and then deleted → **deletion attack**, refuses to
  run. If git log is empty, the file was never committed → first-generation,
  returns empty floor.

## Tests

### `check-ci-drift.test.ts` (55 tests, all passing)

Key new tests:
- **`readRatchetFloorFromGit` refuses when git unavailable (not a git repo)**
- **`readRatchetFloorFromGit` refuses when no origin/develop**
- **Working-tree edit detected (merge-base vs. HEAD diverge)**
- **3-part committed attack IS CAUGHT: ratchet finds 1 ratchet finding
  (the vanished step) even though the attacker lowered pinned_step_ids in
  the same commit**

### `gen-reason-ref.test.ts` (13 tests, all passing)

Key new test:
- **`bypass 6: 3-part committed regeneration attack IS CAUGHT by the merge-base
  floor`** — sets up a base commit (origin/develop) pinning Step A + Step B,
  then a feature commit on a PR branch that removes Step B from the manifest
  AND from `pinned_step_ids` in one commit. With the merge-base floor,
  `gen-reason-ref` refuses to regenerate (the vanished step is still in the
  floor from the merge-base).

## Red/Green Proof

### RED: Adversarial mutation on `gen-reason-ref.ts`

Temporarily bypassed the merge-base floor by reverting `readFloorFromGit` to
read from HEAD directly (the r7 vulnerability):

```ts
const readFloorFromGit = async (rootDir: string): Promise<string[]> => {
    try {
        const { stdout } = await execFileAsync(
            'git',
            ['show', `HEAD:${refFileName}`],
            { cwd: rootDir, encoding: 'utf8' },
        );
        const parsed = JSON.parse(stdout) as { pinned_step_ids?: string[] };
        return parsed.pinned_step_ids ?? [];
    } catch {
        return [];
    }
};
```

Result — the 3-part committed attack test FAILS:

```
❯ src/gen-reason-ref.test.ts > bypass 6: 3-part committed regeneration attack IS CAUGHT by the merge-base floor
AssertionError: gen-reason-ref must refuse when the 3-part committed attack lowers the floor
```

The attacker's HEAD now carries the lowered floor, so `gen-reason-ref`
regenerates without the vanished Step B — the attack succeeds (test is red).

### GREEN: Restore the fix

All 68 tests pass (55 check-ci-drift + 13 gen-reason-ref).

## Reproductions

### check-ci-drift.ts 3-part committed attack (enforcement)

```bash
cd /tmp
rm -rf ci-test && mkdir ci-test && cd ci-test
git init -q
git config user.email t@t.t && git config user.name T

# Base: both steps pinned, origin/develop points here
echo '{"steps":{"a.yml::build::Step A":{"reason":"r"},"a.yml::build::Step B":{"reason":"r"}},"pinned_step_ids":["a.yml::build::Step A","a.yml::build::Step B"]}' > reason-guard-ref.json
git add -A && git commit -qm "base: pin A+B"
git branch -M develop
git symbolic-ref refs/heads/origin/develop refs/heads/develop

# Attack: on a PR branch, remove Step B from manifest AND lower pinned_step_ids
# in the SAME commit (3-part: delete step, remove manifest entry, lower ref)
# (manifest already has both steps; here we edit the ref to drop Step B)
echo '{"steps":{"a.yml::build::Step A":{"reason":"r"}},"pinned_step_ids":["a.yml::build::Step A"]}' > reason-guard-ref.json
git add -A && git commit -qm "attack: remove Step B + lower floor"

# Enforcement: floor is read from merge-base (base commit), which still pins Step B
# → detects Step B as vanished (ratchet finding)
```

### gen-reason-ref.ts 3-part committed attack (generation)

Reproduced in the test `bypass 6`. The attack scenario:
1. Base commit (origin/develop): manifest pins Step A + Step B, reference pins both
2. Feature branch commit (HEAD): removes Step B from manifest, removes Step B from
   `pinned_step_ids`, all in one commit
3. `gen-reason-ref` reads floor from merge-base → Step B still pinned → refuses
   regeneration

## Commands to Re-verify

```bash
cd /home/radan/Projects/PublyApp/publyapp/.worktrees/wt-1762
pnpm --filter scripts-ts exec vitest run src/gen-reason-ref.test.ts src/check-ci-drift.test.ts
# → Test Files  2 passed (2)
# → Tests  68 passed (68)
```
