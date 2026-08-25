Date: 2026-08-25. Type: proof. Scope: the #1357 doc-links guard (`packages/scripts-ts/src/check-doc-links.ts`, landed in this lane).

# Proof — repo-wide dead-link guard, RED/GREEN (#1357)

Requirement (from the lane brief): a new guard must never pass vacuously — its first
commit carries evidence that it fails when it should fail and passes when it should pass.

## GREEN — clean tree

```
$ node packages/scripts-ts/src/check-doc-links.ts
doc links OK: 56 Markdown files scanned, 132 relative links checked.
exit=0
```

## RED — planted broken link in a guide, plus an exempt record in the same run

Two files were planted simultaneously: a guide with a dead relative link and a
`docs/records/` body with a frozen dead link. The guard must flag exactly one of them.

```
$ echo 'broken [link](./no-such-target.md) here.' > docs/guides/_tmp-red-proof.md
$ echo 'frozen [history](../gone/gone.md) stands.' > docs/records/2026-08-25-analysis-tmp-red-exempt.md
$ node packages/scripts-ts/src/check-doc-links.ts
1 broken relative link(s) in tracked Markdown:
  docs/guides/_tmp-red-proof.md:1: -> docs/guides/no-such-target.md
exit=1
```

Both planted files were removed immediately after capture. The record exemption behaved
as designed: `docs/records/` bodies are write-once evidence whose links are not maintained
(the same policy the retired `docs/archive/` carried), while every other tracked Markdown
surface is enforced.

## Regression net

`packages/scripts-ts/src/check-doc-links.test.ts` executes the real guard against throwaway
git repositories and pins the failure modes permanently: resolved links pass, broken links
fail naming `file:line -> target`, absolute URLs / pure anchors / fenced code / inline code
spans are out of scope, `docs/records/` bodies stay exempt while other files in the same
repository still fail, directory links resolve only when something tracked lives beneath
them, and reference-style definitions are checked like inline links. The suite runs in
`just ci` (recipe `ci-doc-links`) and server-side under the retargeted `docs-archive-gate`.
