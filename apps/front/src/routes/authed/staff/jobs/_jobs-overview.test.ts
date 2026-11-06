import { describe, expect, test } from 'vitest';

import { buildJobFamilyCounts } from './_jobs-overview';

describe('buildJobFamilyCounts', () => {
	test('sums the API per-type counts into the four Familles', () => {
		const counts = buildJobFamilyCounts([
			{ key: 'publishing.publish-publication.v1', count: 3 },
			{ key: 'publishing.dispatch-due-posts.v1', count: 1 },
			{ key: 'email.verify.v1', count: 4 },
			{ key: 'upload-orphan-reclaim', count: 2 },
		]);

		expect(counts).toEqual({
			publishing: 4,
			email: 4,
			accounts: 0,
			maintenance: 2,
		});
	});

	test('every family is a real 0 when the API answered with nothing', () => {
		expect(buildJobFamilyCounts(null)).toEqual({
			publishing: 0,
			email: 0,
			accounts: 0,
			maintenance: 0,
		});
	});
});
