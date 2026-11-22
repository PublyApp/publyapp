import { describe, expect, it } from 'vitest';

import {
	IMAGE_SERVICES,
	composeFileArgs,
	imageReference,
	pushedDigest,
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

	it('takes the tagless RepoDigests entry of the pushed repository', () => {
		const reference = 'ghcr.io/o/publyapp-e2e-front:tree-abc';
		const digest = `sha256:${'a'.repeat(64)}`;
		// Docker records `RepoDigests` as `repo@sha256:…`, without the tag.
		const repoDigests = [
			'ghcr.io/o/another-image@sha256:' + 'b'.repeat(64),
			`ghcr.io/o/publyapp-e2e-front@${digest}`,
		].join('\n');

		expect(pushedDigest(reference, repoDigests)).toBe(digest);
		expect(
			pushedDigest('ghcr.io/o/publyapp-e2e-api:tree-abc', repoDigests),
		).toBe(undefined);
		expect(
			pushedDigest(reference, `ghcr.io/o/publyapp-e2e-front@sha256:short`),
		).toBe(undefined);
	});

	it('keeps the registry port when it strips the tag', () => {
		const reference = 'localhost:5000/publyapp-e2e-front:tree-abc';
		const digest = `sha256:${'c'.repeat(64)}`;

		expect(
			pushedDigest(reference, `localhost:5000/publyapp-e2e-front@${digest}\n`),
		).toBe(digest);
	});
});
