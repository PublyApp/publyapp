import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { imageTarballs } from './ci-e2e-load-images.ts';

describe('ci-e2e-load-images', () => {
	it('loads every downloaded tarball, in a stable order, and ignores other files', () => {
		const directory = mkdtempSync(path.join(os.tmpdir(), 'ci-e2e-load-'));

		for (const name of ['front.tar.gz', 'api.tar.gz', 'notes.txt']) {
			writeFileSync(path.join(directory, name), '');
		}

		expect(imageTarballs(directory)).toEqual([
			path.join(directory, 'api.tar.gz'),
			path.join(directory, 'front.tar.gz'),
		]);
	});

	it('yields nothing (so the step fails loudly) when the download produced no tarball', () => {
		expect(
			imageTarballs(mkdtempSync(path.join(os.tmpdir(), 'ci-e2e-empty-'))),
		).toEqual([]);
	});
});
