import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';
import { parse } from 'yaml';

// Proves the central classifier's exact base-pinned ABI fails closed when the
// base implementation still exposes the former no-argument CLI. The test
// extracts the real inline classifier step from ci.yml and executes it with
// the classifier source from origin/develop rather than a hand-written copy.

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../..',
);
const centralWorkflowFile = path.join(repoRoot, '.github/workflows/ci.yml');

// The central workflow is allowed to execute a classifier ABI that is newer
// than the exact base commit. This extracts the actual central step so the
// compatibility behavior cannot be satisfied by a hand-written fixture.
const extractCentralClassifierRun = () => {
	const document = parse(readFileSync(centralWorkflowFile, 'utf8'));
	// @ts-expect-error rung-0: add proper type in later rung
	const step = document.jobs.classify.steps.find((s) => s.id === 'classifier');

	assert.ok(step, 'central ci: expected the classifier step');
	assert.equal(typeof step.run, 'string');
	return step.run;
};

const runInline = (
	script: string,
	cwd: string,
	env: Record<string, string> = {},
) => {
	const githubOutputPath = path.join(cwd, 'github-output.txt');
	writeFileSync(githubOutputPath, '');
	const result = execFileSync('bash', ['-e', '-c', script], {
		cwd,
		env: { ...process.env, ...env, GITHUB_OUTPUT: githubOutputPath },
		encoding: 'utf8',
	});
	return { stdout: result, output: readFileSync(githubOutputPath, 'utf8') };
};

test('central ci: exact base-pinned classifier ABI falls back closed without invoking the old no-argv CLI', () => {
	const script = extractCentralClassifierRun();
	const cwd = mkdtempSync(
		path.join(os.tmpdir(), 'publyapp-ci-central-bootstrap-'),
	);

	try {
		const baseClassifier = execFileSync(
			'git',
			['show', 'origin/develop:packages/scripts-ts/src/ci-changed-paths.ts'],
			{ cwd: repoRoot, encoding: 'utf8' },
		);
		const basePath = path.join(
			cwd,
			'base-ref/packages/scripts-ts/src/ci-changed-paths.ts',
		);
		mkdirSync(path.dirname(basePath), { recursive: true });
		writeFileSync(basePath, baseClassifier);

		const { stdout, output } = runInline(script, cwd, {
			GITHUB_EVENT_NAME: 'push',
		});

		assert.match(stdout, /classifier ABI|failing closed/i);
		assert.equal(
			output,
			'quality=true\nfront=true\napi=true\ne2e=true\ndocs=true\nreact=true\n',
		);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});
