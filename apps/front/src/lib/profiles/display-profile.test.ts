import { describe, expect, test } from 'vitest';

import {
	displayProfileDescription,
	displayProfileName,
} from './display-profile';

const t = (key: string) => `t(${key})`;

describe('default system profile display (#2291 M9)', () => {
	test('renders the translated copy for the seeded default profile', () => {
		const profile = {
			name: 'Default profile',
			description: 'Default profile with no permissions',
			isDefault: true,
		};

		expect(displayProfileName(profile, t)).toBe(
			't(common:default-profile-name)',
		);
		expect(displayProfileDescription(profile, t)).toBe(
			't(common:default-profile-description)',
		);
	});

	test('keeps a custom profile’s own name and description', () => {
		const profile = {
			name: 'Support',
			description: 'Read-only support access',
			isDefault: false,
		};

		expect(displayProfileName(profile, t)).toBe('Support');
		expect(displayProfileDescription(profile, t)).toBe(
			'Read-only support access',
		);
	});
});
