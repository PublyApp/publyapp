import { describe, expect, it } from 'vitest';

import {
	IMAGE_SERVICES,
	composeFileArgs,
	imageReference,
} from './ci-e2e-images.ts';

describe('ci-e2e-images', () => {
	it('adds the fork overlay only for a fork run', () => {
		expect(composeFileArgs(false)).toEqual([
			'-f',
			'apps/front/docker-compose.test.yml',
		]);
		expect(composeFileArgs(true)).toEqual([
			'-f',
			'apps/front/docker-compose.test.yml',
			'-f',
			'apps/front/docker-compose.fork-overlay.yml',
		]);
	});

	it('names the four stack images the e2e jobs pull or load', () => {
		expect([...IMAGE_SERVICES]).toEqual([
			'migrate',
			'api',
			'request-counter',
			'front',
		]);
		expect(imageReference('ghcr.io/o/publyapp-e2e', '12-1', 'front')).toBe(
			'ghcr.io/o/publyapp-e2e-front:12-1',
		);
	});
});
