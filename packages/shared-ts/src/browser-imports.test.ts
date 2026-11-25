import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { build } from 'vite';
import { describe, expect, it } from 'vitest';

/**
 * The package `browser` export condition only applies to imports made through
 * the package entry (`@org/shared-ts/lib/logger`). A relative `../logger/index`
 * silently pins the server entry (and Winston) into a browser bundle.
 */
const browserBundle = async (): Promise<string> => {
	const outDir = await mkdtemp(join(tmpdir(), 'shared-ts-browser-'));
	try {
		await build({
			configFile: false,
			logLevel: 'silent',
			root: process.cwd(),
			build: {
				outDir,
				emptyOutDir: true,
				minify: false,
				rolldownOptions: {
					preserveEntrySignatures: 'strict',
					input: [
						'src/lib/analytics/analytics.ts',
						'src/lib/analytics/adapters/posthog-browser-analytics-adapter.ts',
						'src/lib/analytics/adapters/posthog-node-analytics-adapter.ts',
						'src/utils/try-catch.ts',
					],
				},
			},
		});
		const files = (await readdir(outDir, { recursive: true })).filter((file) =>
			file.endsWith('.js'),
		);
		const chunks = await Promise.all(
			files.map((file) => readFile(join(outDir, file), 'utf8')),
		);
		return chunks.join('\n');
	} finally {
		await rm(outDir, { recursive: true, force: true });
	}
};

describe('browser logger entry', () => {
	it('the analytics service and try-catch resolve it, never Winston', async () => {
		const code = await browserBundle();
		// every entry module is really in the bundle (not an empty chunk)
		expect(code).toContain('Analytics send failed');
		expect(code).toContain('[REDACTED]');
		expect(code).toContain('You may want to define a custom error handler');
		expect(code).not.toMatch(/winston|logform|triple-beam/);
	}, 30_000);
});
