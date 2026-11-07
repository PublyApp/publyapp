import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { LANES, classifierIsCurrent } from './ci-classify.ts';

const writeClassifier = (body: string) => {
	const directory = mkdtempSync(path.join(os.tmpdir(), 'ci-classify-'));
	const file = path.join(directory, 'ci-changed-paths.ts');
	writeFileSync(file, body);

	return file;
};

describe('ci-classify', () => {
	it('accepts only a base classifier that declares the ABI this run understands', () => {
		expect(
			classifierIsCurrent(
				writeClassifier('export const CI_CLASSIFIER_ABI_VERSION = 2;\n'),
			),
		).toBe(true);
		expect(
			classifierIsCurrent(
				writeClassifier('export const CI_CLASSIFIER_ABI_VERSION = 3;\n'),
			),
		).toBe(false);
		expect(
			classifierIsCurrent('/nonexistent/base-ref/ci-changed-paths.ts'),
		).toBe(false);
	});

	it('fails closed to exactly the six lane outputs', () => {
		expect([...LANES]).toEqual([
			'quality',
			'front',
			'api',
			'e2e',
			'docs',
			'react',
		]);
	});
});
