import { describe, expect, test } from 'vitest';

import { displayRoleDescription, displayRoleName } from './display-role';

const t = (key: string) => `t(${key})`;

describe('default system role display (#2291 M9)', () => {
	test('renders the translated copy for the seeded default role', () => {
		const role = {
			name: 'Default role',
			description: 'Default role with no permissions',
			isDefault: true,
		};

		expect(displayRoleName(role, t)).toBe('t(common:default-role-name)');
		expect(displayRoleDescription(role, t)).toBe(
			't(common:default-role-description)',
		);
	});

	test('keeps a custom role’s own name and description', () => {
		const role = {
			name: 'Support',
			description: 'Read-only support access',
			isDefault: false,
		};

		expect(displayRoleName(role, t)).toBe('Support');
		expect(displayRoleDescription(role, t)).toBe('Read-only support access');
	});

	test('keeps a renamed default role’s own copy', () => {
		const role = {
			name: 'Profil maison',
			description: 'Notre profil par défaut renommé',
			isDefault: true,
		};

		expect(displayRoleName(role, t)).toBe('Profil maison');
		expect(displayRoleDescription(role, t)).toBe(
			'Notre profil par défaut renommé',
		);
	});
});
