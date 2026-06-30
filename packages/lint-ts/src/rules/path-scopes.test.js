/**
 * Unit tests for shared path scoping helpers.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
	isUnderFrontSource,
	isFrontSourceFile,
	isFrontComponentTsxFile,
	isFrontProductSurfaceFile,
	FRONT_SOURCE_PREFIXES,
	getSourceRelativePath,
	normalizeFilename,
} from './path-scopes.js';

describe('path-scopes helper', () => {
	it('normalizes windows separators without changing existing forward slashes', () => {
		assert.strictEqual(
			normalizeFilename('apps/front-2\\src\\routes\\x.ts'),
			'apps/front-2/src/routes/x.ts',
		);
		assert.strictEqual(
			normalizeFilename('apps/front/src/routes/x.ts'),
			'apps/front/src/routes/x.ts',
		);
		assert.strictEqual(
			isUnderFrontSource('apps/front-2\\src\\routes\\x.ts'),
			true,
		);
	});

	it('recognizes absolute front and front-2 source paths', () => {
		const front2 = '/repo/apps/front-2/src/routes/overview/page.tsx';
		const front = '/repo/apps/front/src/routes/overview/page.tsx';

		assert.strictEqual(isFrontSourceFile(front2), true);
		assert.strictEqual(isFrontSourceFile(front), true);
		assert.strictEqual(
			getSourceRelativePath(front2),
			'routes/overview/page.tsx',
		);
		assert.strictEqual(
			getSourceRelativePath(front),
			'routes/overview/page.tsx',
		);
		assert.strictEqual(isUnderFrontSource(front2, ['apps/front-2/src/']), true);
	});

	it('uses path boundaries to avoid false-prefix matches', () => {
		const lookalike = '/repo/apps/front-2-backup/src/routes/page.tsx';
		const notUnderRepoPrefix = '/repo/apps/frontend/src/routes/page.tsx';
		const plain = 'repo/apps/front-2-other/src/routes/page.tsx';
		const front2Backup = '/repo/backup-apps/front-2/src/components/page.tsx';
		const frontBackup = '/repo/backup-apps/front/src/components/page.tsx';

		assert.strictEqual(isUnderFrontSource(lookalike), false);
		assert.strictEqual(isUnderFrontSource(notUnderRepoPrefix), false);
		assert.strictEqual(isUnderFrontSource(plain), false);
		assert.strictEqual(isUnderFrontSource(front2Backup), false);
		assert.strictEqual(isUnderFrontSource(frontBackup), false);
		assert.strictEqual(isFrontSourceFile(lookalike), false);
		assert.strictEqual(isFrontSourceFile(notUnderRepoPrefix), false);
		assert.strictEqual(isFrontSourceFile(plain), false);
		assert.strictEqual(isFrontSourceFile(front2Backup), false);
		assert.strictEqual(isFrontSourceFile(frontBackup), false);
		assert.strictEqual(
			getSourceRelativePath(front2Backup, FRONT_SOURCE_PREFIXES),
			'',
		);
		assert.strictEqual(
			getSourceRelativePath(frontBackup, FRONT_SOURCE_PREFIXES),
			'',
		);
	});

	it('extracts front product and component targets deterministically', () => {
		const front2Page = '/repo/apps/front-2/src/components/page.tsx';
		const front2Marketing =
			'/repo/apps/front-2/src/marketing/components/page.tsx';
		const frontProduct = '/repo/apps/front/src/routes/dashboard/page.tsx';

		assert.strictEqual(isFrontComponentTsxFile(front2Page), true);
		assert.strictEqual(isFrontComponentTsxFile(front2Marketing), false);
		assert.strictEqual(
			isFrontComponentTsxFile('/repo/apps/front/src/components/page.tsx'),
			true,
		);
		assert.strictEqual(isFrontProductSurfaceFile(frontProduct), true);
		assert.strictEqual(
			isFrontProductSurfaceFile(
				'/repo/apps/front-2/src/routes/dashboard/page.tsx',
			),
			false,
		);

		assert.strictEqual(
			isFrontComponentTsxFile(
				'/repo/backup-apps/front/src/components/page.tsx',
			),
			false,
		);
		assert.strictEqual(
			isFrontComponentTsxFile(
				'/repo/backup-apps/front-2/src/components/page.tsx',
			),
			false,
		);
		assert.strictEqual(
			isFrontProductSurfaceFile(
				'/repo/backup-apps/front/src/routes/dashboard/page.tsx',
			),
			false,
		);
	});
});
