Date: 2026-08-25. Type: proof. Scope: the #1357 doc-links guard (`packages/scripts-ts/src/check-doc-links.ts`, landed in this lane).

# Proof — repo-wide dead-link guard, RED/GREEN (#1357)

Requirement (from the lane brief): a new guard must never pass vacuously — its first
commit carries evidence that it fails when it should fail and passes when it should pass.

## GREEN — clean tree

```
$ node packages/scripts-ts/src/check-doc-links.ts
doc links OK: 58 Markdown files scanned, 132 relative links checked.
exit=0
```

## RED — planted broken link in an UNTRACKED guide file, plus an exempt record in the same run

Two files were planted simultaneously: an **untracked** guide with a dead relative
link (never `git add`ed — this is the round-1 review gap, fixed by scanning untracked
non-ignored working-tree files) and a `docs/records/` body with a frozen dead link.
The guard must flag exactly one of them.

```
$ echo 'broken [link](./no-such-target.md) here.' > docs/guides/_tmp-red-proof.md
$ echo 'frozen [history](../gone/gone.md) stands.' > docs/records/2026-08-25-analysis-tmp-red-exempt.md
$ node packages/scripts-ts/src/check-doc-links.ts
1 broken relative link(s) in tracked or untracked non-ignored Markdown:
  docs/guides/_tmp-red-proof.md:1: -> docs/guides/no-such-target.md
exit=1
```

Both planted files were removed immediately after capture and the clean tree went green
again. The record exemption behaved as designed: `docs/records/` bodies are write-once
evidence whose links are not maintained (the same policy the retired `docs/archive/`
carried), while every other tracked or untracked non-ignored Markdown surface is enforced.

## Code-surface literal scan (round-1 review addition)

The prune inventory counts code files among the survival surfaces, so the guard also
scans `apps/`, `packages/`, `.github/`, the justfile, `AGENTS.md`, and `DESIGN.md` for
`docs/...` path literals whose target does not exist. Paired RED at introduction: with
the pre-finding code, a planted broken literal in `apps/api/Lib/AppEnvironment.cs` kept
exit 0; with the literal scanner it fails naming `apps/api/Lib/AppEnvironment.cs:<line>`;
reverted, clean tree green. Out of scope by design: URLs, branch names without a dotted
segment, directory mentions, test/spec fixtures, and `audit-docs-prune.ts`'s pre-prune
decision table.

## Regression net

`packages/scripts-ts/src/check-doc-links.test.ts` executes the real guard against throwaway
git repositories and pins the failure modes permanently (13 tests): resolved links pass,
broken links fail naming `file:line -> target`, absolute URLs / pure anchors / fenced code /
inline code spans are out of scope, `docs/records/` bodies stay exempt while other files in
the same repository still fail, directory links resolve only when something tracked lives
beneath them, reference-style definitions are checked like inline links, a broken link in
an untracked non-ignored file fails while ignored files stay out of scope, existing docs/
literals in code surfaces pass, a broken literal fails naming file and line, and URLs /
branch names / test fixtures stay out of the literal scan. The suite runs in `just ci`
(recipe `ci-doc-links`) and server-side under the retargeted `docs-archive-gate`.
