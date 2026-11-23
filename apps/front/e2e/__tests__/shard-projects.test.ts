/**
 * Guard: every CI-shard project that starts from the saved session must first
 * run the project that writes it.
 *
 * The shard runner (`packages/scripts-ts/src/ci-e2e-shard.ts`) passes
 * `--project=chromium --project=chromium-faults --project=chromium-hermetic-source
 * --project=chromium-hermetic-counter` plus file filters, and never
 * `--project=setup`. Playwright only runs `setup` as a dependency of a selected
 * project, so a project that reads `STAFF_ADMIN_STORAGE_STATE` without
 * `dependencies: ['setup']` fails on a shard that holds none of `chromium`'s
 * files: `Error reading storage state ... ENOENT` (round-3 review, MEDIUM —
 * a single `request-counter.spec.ts` file is enough to hit it).
 */
import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import config from '../../playwright.config';

const projects = config.projects ?? [];

describe('CI shard project scheduling', () => {
	it('makes the counter project run setup before reading the saved session', () => {
		const counter = projects.find(
			(project) => project.name === 'chromium-hermetic-counter',
		);
		assert.ok(counter, 'the counter project must exist');
		assert.deepEqual(
			counter.dependencies,
			['setup'],
			'a counter-only shard must still write playwright/.auth/staff-admin.json',
		);
	});

	it('gives every session-reading project a setup dependency', () => {
		const sessionReaders = projects.filter(
			(project) => project.use?.storageState !== undefined,
		);
		assert.deepEqual(
			sessionReaders.map((project) => project.name).sort(),
			['chromium', 'chromium-hermetic-counter'],
			'unexpected set of projects reading the saved session',
		);
		for (const project of sessionReaders) {
			assert.ok(
				project.dependencies?.includes('setup'),
				`${project.name} reads the saved session without depending on setup`,
			);
		}
	});
});
