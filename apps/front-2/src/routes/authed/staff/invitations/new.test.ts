import { describe, expect, test } from 'vitest';

import { buildProfileOptions } from './new';

describe('buildProfileOptions', () => {
	test('keeps selected profile ids visible when the current search result omits them', () => {
		const options = buildProfileOptions({
			profiles: [{ id: 'profile-admin', name: 'Admin' }],
			selectedProfileIds: ['profile-admin', 'profile-editor'],
			knownProfileNames: new Map([['profile-editor', 'Editor']]),
		});

		expect(options).toEqual([
			{ value: 'profile-admin', label: 'Admin' },
			{ value: 'profile-editor', label: 'Editor' },
		]);
	});
});
