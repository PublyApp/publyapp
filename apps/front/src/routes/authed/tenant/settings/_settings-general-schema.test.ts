/**
 * @vitest-environment jsdom
 */
import { describe, expect, test } from 'vitest';

import { getSettingsGeneralSchema } from './_settings-general-schema';

// Stub translator that echoes the i18n key back as the message, so a failed
// refine is identifiable by its key rather than a human string.
const t = (key: string): string => key;

const schema = getSettingsGeneralSchema(t);

const baseValues = {
	name: 'Valid Name',
	logoUrl: '',
	legalName: '',
	description: '',
	websiteUrl: '',
	billingEmail: '',
	supportEmail: '',
	defaultLocale: '',
	timezone: '',
};

const parse = (overrides: Partial<typeof baseValues>) =>
	schema.safeParse({ ...baseValues, ...overrides });

/** Returns the joined message of the first issue on `field`, or undefined. */
const firstIssueMessageFor = (
	result: ReturnType<typeof parse>,
	field: string,
): string | undefined => {
	const issue = result.success
		? undefined
		: result.error.issues.find((issue) =>
				issue.path.some((segment) => segment === field),
			);
	return issue?.message;
};

describe('getSettingsGeneralSchema', () => {
	describe('logoUrl refine', () => {
		test('accepts an absolute https URL', () => {
			expect(parse({ logoUrl: 'https://example.com/logo.png' }).success).toBe(
				true,
			);
		});

		test('accepts an absolute http URL', () => {
			expect(parse({ logoUrl: 'http://example.com/logo.png' }).success).toBe(
				true,
			);
		});

		test('accepts a root-relative served-upload path under /files/', () => {
			expect(parse({ logoUrl: '/files/tenants/t-1/logo.png' }).success).toBe(
				true,
			);
		});

		test('rejects a javascript: URL', () => {
			const result = parse({ logoUrl: 'javascript:alert(1)' });
			expect(result.success).toBe(false);
			expect(firstIssueMessageFor(result, 'logoUrl')).toBe(
				'settings:invalid-logo-url',
			);
		});

		test('rejects a non-http(s) protocol like ftp', () => {
			const result = parse({ logoUrl: 'ftp://example.com/logo.png' });
			expect(result.success).toBe(false);
			expect(firstIssueMessageFor(result, 'logoUrl')).toBe(
				'settings:invalid-logo-url',
			);
		});

		test('accepts an empty value (optional)', () => {
			expect(parse({ logoUrl: '' }).success).toBe(true);
		});
	});

	describe('websiteUrl refine', () => {
		test('accepts an absolute https URL', () => {
			expect(parse({ websiteUrl: 'https://example.com' }).success).toBe(true);
		});

		test('rejects a bare hostname / non-URL', () => {
			const result = parse({ websiteUrl: 'not-a-url' });
			expect(result.success).toBe(false);
			expect(firstIssueMessageFor(result, 'websiteUrl')).toBe(
				'settings:invalid-website-url',
			);
		});

		test('accepts an empty value (optional)', () => {
			expect(parse({ websiteUrl: '' }).success).toBe(true);
		});
	});

	describe('email refinements', () => {
		test('accepts a valid billing email', () => {
			expect(parse({ billingEmail: 'billing@example.com' }).success).toBe(true);
		});

		test('rejects an invalid billing email', () => {
			const result = parse({ billingEmail: 'not-an-email' });
			expect(result.success).toBe(false);
			expect(firstIssueMessageFor(result, 'billingEmail')).toBe(
				'settings:invalid-email',
			);
		});

		test('accepts a valid support email', () => {
			expect(parse({ supportEmail: 'support@example.com' }).success).toBe(true);
		});

		test('rejects an invalid support email', () => {
			const result = parse({ supportEmail: 'still-not-email' });
			expect(result.success).toBe(false);
			expect(firstIssueMessageFor(result, 'supportEmail')).toBe(
				'settings:invalid-email',
			);
		});

		test('accepts empty emails (optional)', () => {
			expect(parse({ billingEmail: '', supportEmail: '' }).success).toBe(true);
		});
	});

	describe('name', () => {
		test('rejects a name shorter than 5 characters', () => {
			const result = parse({ name: 'abc' });
			expect(result.success).toBe(false);
			expect(firstIssueMessageFor(result, 'name')).toBe(
				'settings:name-min-length',
			);
		});

		test('accepts a name of at least 5 characters', () => {
			expect(parse({ name: 'Valid Name' }).success).toBe(true);
		});
	});
});
