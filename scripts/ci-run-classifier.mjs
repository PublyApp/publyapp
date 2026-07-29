import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync } from 'node:fs';
import process from 'node:process';

// Bootstrap wrapper around scripts/ci-changed-paths.mjs, checked out from the
// pull request's BASE commit (not the PR's own copy — see #1017 round 2's
// fix for why). That checkout is deliberately sparse and pinned to a fixed
// ref, so it can legitimately produce nothing: the pull request that
// introduces the classifier (this one, on its first run) has no such file on
// its base branch, and any branch cut before that classifier existed on the
// base branch would hit the same thing when rebuilt. Without this wrapper,
// `node scripts/ci-changed-paths.mjs` would fail to resolve a module that
// isn't there, the `changes` job would go red, and every aggregate gate would
// go red with it — the pull request that adds the gates would be unable to
// pass its own gates.
//
// THE TWO OUTCOMES ARE DELIBERATELY ON SEPARATE CODE PATHS
// ----------------------------------------------------------
// - Classifier ABSENT at the base commit -> relevance cannot be determined
//   at all -> fail closed to relevant=true (run everything). This is
//   resolved right here, before the classifier is ever invoked, and is
//   logged loudly (a GitHub Actions ::warning:: annotation plus a `[MISSING
//   BASE CLASSIFIER]` prefix) so a permanently-missing classifier reads as
//   an anomaly, not a quietly-normal mode.
// - Classifier PRESENT at the base commit -> this wrapper does not make any
//   relevance decision itself. It execs the classifier as a subprocess and
//   passes its exit code and stdout straight through unchanged. A
//   `relevant=false` verdict from a classifier that genuinely ran must never
//   be reachable through the "absent" branch above, and vice versa.
//
// This wrapper is checked out from the pull request's OWN ref, not the base
// commit — it has to be, since on the bootstrap PR there is no base copy of
// anything to check out. That is safe: the wrapper makes no relevance
// decision from PR content, only a filesystem existence check on a path
// nothing in the PR's diff can influence (whether the BASE commit has the
// file), so a PR that tampered with this wrapper gains nothing it could not
// already gain by tampering with the `changes` job's own YAML directly (a
// residual exposure already documented and tracked separately, not
// reintroduced or worsened here).

const [classifierPath, pattern] = process.argv.slice(2);

if (!classifierPath || !pattern) {
	console.error(
		'Usage: node scripts/ci-run-classifier.mjs <path-to-base-classifier> <pattern>',
	);
	process.exit(1);
}

if (!existsSync(classifierPath)) {
	const reason =
		`[MISSING BASE CLASSIFIER] scripts/ci-changed-paths.mjs does not exist at the base commit ` +
		`(checked "${classifierPath}"). This is expected exactly once: for the pull request that ` +
		'introduces this classifier, or a branch cut before it existed on the base branch. ' +
		'Relevance cannot be determined from a classifier that is not there, so this fails closed: ' +
		'treating the workflow as relevant and running everything. If this keeps happening on ' +
		'ordinary pull requests well after the classifier has been on the base branch, something ' +
		'is wrong — investigate, do not silence it.';

	console.log(`::warning::${reason}`);
	console.log(`relevant=true (${reason})`);

	const githubOutput = process.env.GITHUB_OUTPUT;

	if (githubOutput) {
		appendFileSync(githubOutput, 'relevant=true\n');
	}

	process.exit(0);
}

// The classifier exists: delegate entirely. Its own stdout, exit code, and
// GITHUB_OUTPUT write are exactly what this job reports — this wrapper adds
// nothing and overrides nothing on this path.
const result = spawnSync(process.execPath, [classifierPath, pattern], {
	stdio: 'inherit',
});

process.exit(result.status ?? 1);
