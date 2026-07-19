import { describe, expect, test } from 'vitest';

import { parseInviteeEmails } from './_invite-user-form-state';

describe('parseInviteeEmails', () => {
	test('splits comma and whitespace separated input, trims it, and removes case-insensitive duplicates', () => {
		expect(
			parseInviteeEmails(
				' alice@example.com, BOB@example.com\nbob@example.com  carol@example.com ',
			),
		).toEqual(['alice@example.com', 'BOB@example.com', 'carol@example.com']);
	});
});
