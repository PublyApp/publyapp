/**
 * Unit tests for shared path scoping helpers.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
	isUnderFrontSource,
	isFrontSourceFile,
	isFrontComponentTsxFile,
	isOldFrontProductSurfaceFile,
	FRONT_SOURCE_PREFIXES,
	getSourceRelativePath,
	normalizeFilename,
} from './path-scopes.js';

describe('path-scopes helper', () => {
	it('normalizes windows separators without changing existing forward slashes', () => {
		assert.strictEqual(
			normalizeFilename('apps/front\\src\\routes\\x.ts'),
			'apps/front/src/routes/x.ts',
		);
		assert.strictEqual(
			normalizeFilename('apps/old-front/src/routes/x.ts'),
			'apps/old-front/src/routes/x.ts',
		);
		assert.strictEqual(
			isUnderFrontSource('apps/front\\src\\routes\\x.ts'),
			true,
		);
	});

	it('recognizes absolute front and old-front source paths', () => {
		const front = '/repo/apps/front/src/routes/overview/page.tsx';
		const oldFront = '/repo/apps/old-front/src/routes/overview/page.tsx';

		assert.strictEqual(isFrontSourceFile(front), true);
		assert.strictEqual(isFrontSourceFile(oldFront), true);
		assert.strictEqual(
			getSourceRelativePath(front),
			'routes/overview/page.tsx',
		);
		assert.strictEqual(
			getSourceRelativePath(oldFront),
			'routes/overview/page.tsx',
		);
		assert.strictEqual(isUnderFrontSource(front, ['apps/front/src/']), true);
	});

	it('uses path boundaries to avoid false-prefix matches', () => {
		const lookalike = '/repo/apps/front-backup/src/routes/page.tsx';
		const notUnderRepoPrefix = '/repo/apps/old-frontend/src/routes/page.tsx';
		const plain = 'repo/apps/front-other/src/routes/page.tsx';
		const frontBackup = '/repo/backup-apps/front/src/components/page.tsx';
		const oldFrontBackup =
			'/repo/backup-apps/old-front/src/components/page.tsx';

		assert.strictEqual(isUnderFrontSource(lookalike), false);
		assert.strictEqual(isUnderFrontSource(notUnderRepoPrefix), false);
		assert.strictEqual(isUnderFrontSource(plain), false);
		assert.strictEqual(isUnderFrontSource(frontBackup), false);
		assert.strictEqual(isUnderFrontSource(oldFrontBackup), false);
		assert.strictEqual(isFrontSourceFile(lookalike), false);
		assert.strictEqual(isFrontSourceFile(notUnderRepoPrefix), false);
		assert.strictEqual(isFrontSourceFile(plain), false);
		assert.strictEqual(isFrontSourceFile(frontBackup), false);
		assert.strictEqual(isFrontSourceFile(oldFrontBackup), false);
		assert.strictEqual(
			getSourceRelativePath(frontBackup, FRONT_SOURCE_PREFIXES),
			'',
		);
		assert.strictEqual(
			getSourceRelativePath(oldFrontBackup, FRONT_SOURCE_PREFIXES),
			'',
		);
	});

	it('extracts front product and component targets deterministically', () => {
		const frontPage = '/repo/apps/front/src/components/page.tsx';
		const frontMarketing = '/repo/apps/front/src/marketing/components/page.tsx';
		const oldFrontProduct =
			'/repo/apps/old-front/src/routes/dashboard/page.tsx';

		assert.strictEqual(isFrontComponentTsxFile(frontPage), true);
		assert.strictEqual(isFrontComponentTsxFile(frontMarketing), false);
		assert.strictEqual(
			isFrontComponentTsxFile('/repo/apps/old-front/src/components/page.tsx'),
			true,
		);
		assert.strictEqual(isOldFrontProductSurfaceFile(oldFrontProduct), true);
		assert.strictEqual(
			isOldFrontProductSurfaceFile(
				'/repo/apps/front/src/routes/dashboard/page.tsx',
			),
			false,
		);

		assert.strictEqual(
			isFrontComponentTsxFile(
				'/repo/backup-apps/old-front/src/components/page.tsx',
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
			isOldFrontProductSurfaceFile(
				'/repo/backup-apps/old-front/src/routes/dashboard/page.tsx',
			),
			false,
		);
	});
});
