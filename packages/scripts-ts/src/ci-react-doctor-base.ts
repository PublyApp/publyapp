import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// Resolves the commit the React Doctor diff is taken against, per event, and
// proves it resolves before the step spends time running the doctor.
//
// Formerly the `run:` block of ci.yml::docs-react::Resolve React Doctor base:
// a `case` over the event name, a nested `if` for a push's before-SHA (falling
// back to HEAD~1 for a branch creation), `git rev-parse --verify`, and a
// `printf >> $GITHUB_OUTPUT` (docs/guides/languages.md: logic, so it is a script).

const zeroSha = '0000000000000000000000000000000000000000';

/** The diff base for the event, or null when the event has no meaningful base. */
export const resolveDiffBase = (
	environment: Record<string, string | undefined>,
): string | null => {
	const before = environment.CI_PUSH_BEFORE;

	switch (environment.CI_EVENT_NAME) {
		case 'pull_request': {
			return environment.CI_PR_BASE_SHA ?? '';
		}
		case 'merge_group': {
			return environment.CI_MERGE_GROUP_BASE_SHA ?? '';
		}
		case 'push': {
			if (before === undefined || before === '' || before === zeroSha) {
				return 'HEAD~1';
			}

			return before;
		}
		default: {
			return null;
		}
	}
};

const run = () => {
	const base = resolveDiffBase(process.env);

	if (base === null) {
		console.error(`unsupported event ${process.env.CI_EVENT_NAME}`);
		process.exit(1);
	}

	const verify = spawnSync(
		'git',
		['rev-parse', '--verify', `${base}^{commit}`],
		{
			stdio: ['ignore', 'ignore', 'inherit'],
		},
	);

	if (verify.status !== 0) {
		process.exit(verify.status ?? 1);
	}

	const githubOutput = process.env.GITHUB_OUTPUT;

	if (githubOutput === undefined) {
		throw new Error(
			'GITHUB_OUTPUT is not set — the resolved base has nowhere to go.',
		);
	}

	appendFileSync(githubOutput, `base=${base}\n`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	run();
}
