import { describe, expect, test } from 'vitest';

import { RegisterInputSchema } from './auth-actions';

describe('RegisterInputSchema', () => {
	const validInput = {
		firstName: 'Jamie',
		lastName: 'Lee',
		email: 'jamie@example.com',
		password: 'correct horse battery staple',
	};

	test('accepts a valid registration payload', () => {
		expect(RegisterInputSchema.parse(validInput).firstName).toBe('Jamie');
	});

	test('rejects a firstName over 100 characters (kept in sync with the shared register schema)', () => {
		expect(() =>
			RegisterInputSchema.parse({ ...validInput, firstName: 'a'.repeat(101) }),
		).toThrow();
	});

	test('rejects a blank lastName (kept in sync with the shared register schema)', () => {
		expect(() =>
			RegisterInputSchema.parse({ ...validInput, lastName: '   ' }),
		).toThrow();
	});

	test('enforces PASSWORD_MIN_LENGTH, not the shared schema’s shorter min-8 rule', () => {
		expect(() =>
			RegisterInputSchema.parse({ ...validInput, password: 'short1!' }),
		).toThrow();
	});

	test('does not require a special character (front-2’s deliberate password policy)', () => {
		expect(
			RegisterInputSchema.parse({
				...validInput,
				password: 'all letters no digits here',
			}).password,
		).toBe('all letters no digits here');
	});
});
