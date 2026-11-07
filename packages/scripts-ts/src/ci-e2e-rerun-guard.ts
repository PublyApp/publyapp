import process from 'node:process';
import { fileURLToPath } from 'node:url';

// Refuses a partial re-run of the e2e jobs (#1063) before it pulls anything:
// the image tag the build job emitted must belong to THIS attempt. On a partial
// re-run ("Re-run failed jobs") the build job did not re-run, its tag is stale,
// and the images it named were already deleted by the cleanup job — the pull
// then fails with a "manifest unknown" that looks like a registry problem.
//
// Formerly the `run:` block of ci.yml::e2e-smoke|e2e-test::Detect partial rerun
// (docs/guides/languages.md: a computed value plus a conditional failure is
// logic, so it is a script).

/** The tag a build job of this attempt emits: run id + attempt number. */
export const expectedImageTag = (runId: string, attempt: string): string =>
	`${runId}-${attempt}`;

/** The `::error::` annotation a stale tag earns, or null when the tag is current. */
export const mismatchMessage = (
	tag: string,
	runId: string,
	attempt: string,
): string | null => {
	const expected = expectedImageTag(runId, attempt);

	if (tag === expected) {
		return null;
	}

	return `::error::e2e build tag ${tag} does not match this attempt ${expected}; rerun all jobs`;
};

const run = () => {
	const tag = process.env.E2E_IMAGE_TAG ?? '';

	const message = mismatchMessage(
		tag,
		process.env.GITHUB_RUN_ID ?? '',
		process.env.GITHUB_RUN_ATTEMPT ?? '',
	);

	if (message !== null) {
		console.log(message);
		process.exit(1);
	}
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	run();
}
