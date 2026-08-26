import { z } from 'zod';

import {
	USER_ROLE_OPTIONS,
	type NewTenantAccountLevel,
} from './_tenants-new-types';
import { isValidTenantCode } from './tenants-new-helpers';
import {
	isAbsoluteHttpUrl,
	isValidEmailAddress,
} from './tenants/tenant-organization-profile-fields';

export const getUserLevel = (
	value: string | undefined,
): NewTenantAccountLevel =>
	value === USER_ROLE_OPTIONS[1] ? USER_ROLE_OPTIONS[1] : USER_ROLE_OPTIONS[0];

/**
 * Name length mirrors the backend rule (`MustBeRequiredStringWithLength`,
 * min 5) so the client never accepts a name the server will reject. The
 * `parsedMembersCount` closure lets the max-seats check account for members
 * detected from an uploaded CSV/Excel file, which live outside RHF state.
 */
export const buildCreateTenantSchema = (
	t: (key: string) => string,
	getParsedMembersCount: () => number,
) =>
	z
		.object({
			name: z
				.string()
				.trim()
				.min(5, { message: t('tenant-name-too-short') })
				.max(256, { message: t('tenant-name-too-long') }),
			code: z
				.string()
				.trim()
				.refine((value) => value.length === 0 || isValidTenantCode(value), {
					message: t('workspace-slug-invalid'),
				}),
			maxUsers: z.coerce
				.number({ error: t('seats-required') })
				.int()
				.min(1, { message: t('seats-required') }),
			owners: z
				.array(
					z.object({
						email: z
							.string()
							.trim()
							.pipe(z.email({ message: t('invalid-email-address') })),
					}),
				)
				.min(1, { message: t('at-least-one-owner-required') }),
			manualMembers: z.array(
				z.object({
					email: z
						.string()
						.trim()
						.pipe(z.email({ message: t('invalid-email-address') })),
					accountLevel: z.enum(USER_ROLE_OPTIONS),
				}),
			),
			seedDefaultProfile: z.boolean(),
			logoUrl: z
				.string()
				.trim()
				.max(2048, { message: t('logo-url-too-long') }),
			legalName: z
				.string()
				.trim()
				.max(256, { message: t('legal-name-too-long') }),
			description: z
				.string()
				.trim()
				.max(1024, { message: t('description-too-long') }),
			websiteUrl: z
				.string()
				.trim()
				.max(2048, { message: t('website-url-too-long') })
				.refine((value) => !value || isAbsoluteHttpUrl(value), {
					message: t('website-url-invalid'),
				}),
			billingEmail: z
				.string()
				.trim()
				.max(320, { message: t('billing-email-too-long') })
				.refine((value) => !value || isValidEmailAddress(value), {
					message: t('invalid-email-address'),
				}),
			supportEmail: z
				.string()
				.trim()
				.max(320, { message: t('support-email-too-long') })
				.refine((value) => !value || isValidEmailAddress(value), {
					message: t('invalid-email-address'),
				}),
			defaultLocale: z.string().trim(),
			timezone: z.string().trim(),
			notes: z
				.string()
				.trim()
				.max(4000, { message: t('notes-too-long') }),
		})
		.superRefine((values, context) => {
			const totalCount =
				values.owners.length +
				values.manualMembers.length +
				getParsedMembersCount();
			if (totalCount > values.maxUsers) {
				context.addIssue({
					code: 'custom',
					path: ['owners'],
					message: t('max-users-reached'),
				});
			}

			const emails = [
				...values.owners.map((owner) => owner.email.toLowerCase()),
				...values.manualMembers.map((member) => member.email.toLowerCase()),
			];
			if (new Set(emails).size !== emails.length) {
				context.addIssue({
					code: 'custom',
					path: ['owners'],
					message: t('each-user-must-have-a-unique-email'),
				});
			}
		});
