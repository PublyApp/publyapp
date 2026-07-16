/**
 * @vitest-environment jsdom
 */
import { describe, expect, test } from 'vitest';

import {
	parseInviteUserSearchParams,
	serializeInviteUserSearchParams,
} from './_invite-user-search-state';

describe('invite-user search flag parser', () => {
	test('parses missing or non-1 invite values as undefined', () => {
		expect(parseInviteUserSearchParams({}).invite).toBeUndefined();
		expect(parseInviteUserSearchParams({ invite: undefined }).invite).toBeUndefined();
		expect(parseInviteUserSearchParams({ invite: 0 }).invite).toBeUndefined();
		expect(parseInviteUserSearchParams({ invite: '0' }).invite).toBeUndefined();
		expect(parseInviteUserSearchParams({ invite: 'true' }).invite).toBeUndefined();
	});

	test('parses string and numeric 1 values', () => {
		expect(parseInviteUserSearchParams({ invite: 1 }).invite).toBe(1);
		expect(parseInviteUserSearchParams({ invite: '1' }).invite).toBe(1);
		expect(parseInviteUserSearchParams({ invite: ' 1 ' }).invite).toBe(1);
	});

	test('serializes invite only when enabled', () => {
		expect(serializeInviteUserSearchParams({}).invite).toBeUndefined();
		expect(serializeInviteUserSearchParams({ invite: 1 }).invite).toBe(1);
	});
});
