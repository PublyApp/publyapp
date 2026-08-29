import { z } from 'zod';
import { type StaffTenantDetails } from '~/lib/query/staff-tenants';

import {
	isAbsoluteHttpUrl,
	isValidEmailAddress,
} from './tenant-organization-profile-fields';

export const buildEditTenantSchema = (t: (key: string) => string) =>
	z.object({
		name: z
			.string()
			.trim()
			.min(5, { message: t('tenant-name-too-short') })
			.max(256, { message: t('tenant-name-too-long') })
			.optional(),
		maxUsers: z.coerce
			.number({ error: t('seats-required') })
			.int()
			.positive({ message: t('seats-must-be-positive') }),
		logoUrl: z
			.string()
			.trim()
			.max(2048, { message: t('logo-url-too-long') })
			.optional(),
		legalName: z
			.string()
			.trim()
			.max(256, { message: t('legal-name-too-long') })
			.optional(),
		description: z
			.string()
			.trim()
			.max(1024, { message: t('description-too-long') })
			.optional(),
		websiteUrl: z
			.string()
			.trim()
			.max(2048, { message: t('website-url-too-long') })
			.optional()
			.refine((value) => !value || isAbsoluteHttpUrl(value), {
				message: t('website-url-invalid'),
			}),
		billingEmail: z
			.string()
			.trim()
			.max(320, { message: t('billing-email-too-long') })
			.optional()
			.refine((value) => !value || isValidEmailAddress(value), {
				message: t('invalid-email-address'),
			}),
		supportEmail: z
			.string()
			.trim()
			.max(320, { message: t('support-email-too-long') })
			.optional()
			.refine((value) => !value || isValidEmailAddress(value), {
				message: t('invalid-email-address'),
			}),
		defaultLocale: z.string().trim().optional(),
		timezone: z.string().trim().optional(),
		notes: z
			.string()
			.trim()
			.max(4000, { message: t('notes-too-long') })
			.optional(),
	});

export type EditTenantFormValues = z.infer<
	ReturnType<typeof buildEditTenantSchema>
>;

export const EMPTY_FORM_VALUES: EditTenantFormValues = {
	name: '',
	maxUsers: 1,
	logoUrl: '',
	legalName: '',
	description: '',
	websiteUrl: '',
	billingEmail: '',
	supportEmail: '',
	defaultLocale: '',
	timezone: '',
	notes: '',
};

const TENANT_EDIT_FORM_FIELDS = new Set<keyof EditTenantFormValues>([
	'name',
	'maxUsers',
	'logoUrl',
	'legalName',
	'description',
	'websiteUrl',
	'billingEmail',
	'supportEmail',
	'defaultLocale',
	'timezone',
	'notes',
]);

export const isTenantEditFormField = (
	field: string,
): field is keyof EditTenantFormValues =>
	TENANT_EDIT_FORM_FIELDS.has(field as keyof EditTenantFormValues);

export const normalizeOptionalUpdateString = (
	value: string | undefined,
): string | null | undefined => {
	const trimmed = value?.trim();
	if (trimmed === undefined) {
		return undefined;
	}

	if (trimmed.length > 0) {
		return trimmed;
	}
	return null;
};

/** Maps loaded tenant details onto the form's value shape. Every optional
 * server field becomes `''` so the inputs stay controlled. */
export const toEditTenantFormValues = (
	tenant: StaffTenantDetails | null,
): EditTenantFormValues | null =>
	tenant === null
		? null
		: {
				name: tenant.name,
				maxUsers: tenant.maxUsers,
				logoUrl: tenant.logoUrl ?? '',
				legalName: tenant.legalName ?? '',
				description: tenant.description ?? '',
				websiteUrl: tenant.websiteUrl ?? '',
				billingEmail: tenant.billingEmail ?? '',
				supportEmail: tenant.supportEmail ?? '',
				defaultLocale: tenant.defaultLocale ?? '',
				timezone: tenant.timezone ?? '',
				notes: tenant.notes ?? '',
			};
