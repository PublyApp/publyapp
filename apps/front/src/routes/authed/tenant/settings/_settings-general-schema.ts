import { z } from 'zod';

import {
	isAbsoluteHttpUrl,
	isValidEmailAddress,
} from '../../staff/tenants/tenant-organization-profile-fields';

const ALLOWED_LOGO_URL_PROTOCOLS = ['http:', 'https:'] as const;
const API_FILES_PREFIX = '/files/';

export const getSettingsGeneralSchema = (t: (key: string) => string) =>
	z.object({
		name: z
			.string()
			.trim()
			.min(5, { message: t('settings:name-min-length') })
			.max(256, { message: t('settings:name-max-length') }),
		logoUrl: z
			.string()
			.trim()
			.max(2048, { message: t('settings:logo-url-max-length') })
			.refine((value) => {
				if (!value) {
					return true;
				}

				try {
					return ALLOWED_LOGO_URL_PROTOCOLS.includes(
						new URL(value)
							.protocol as (typeof ALLOWED_LOGO_URL_PROTOCOLS)[number],
					);
				} catch {
					// Root-relative served-upload paths are valid logo values.
					return value.startsWith(API_FILES_PREFIX);
				}
			}, t('settings:invalid-logo-url')),
		legalName: z
			.string()
			.trim()
			.max(256, { message: t('settings:legal-name-max-length') })
			.optional(),
		description: z
			.string()
			.trim()
			.max(1024, { message: t('settings:description-max-length') })
			.optional(),
		websiteUrl: z
			.string()
			.trim()
			.max(2048, { message: t('settings:website-max-length') })
			.optional()
			.refine((value) => !value || isAbsoluteHttpUrl(value), {
				message: t('settings:invalid-website-url'),
			}),
		billingEmail: z
			.string()
			.trim()
			.max(320, { message: t('settings:email-max-length') })
			.optional()
			.refine((value) => !value || isValidEmailAddress(value), {
				message: t('settings:invalid-email'),
			}),
		supportEmail: z
			.string()
			.trim()
			.max(320, { message: t('settings:email-max-length') })
			.optional()
			.refine((value) => !value || isValidEmailAddress(value), {
				message: t('settings:invalid-email'),
			}),
		defaultLocale: z.string().optional(),
		timezone: z.string().optional(),
	});

export type SettingsGeneralValues = z.infer<
	ReturnType<typeof getSettingsGeneralSchema>
>;

export const EDITABLE_FIELDS = [
	'name',
	'logoUrl',
	'legalName',
	'description',
	'websiteUrl',
	'billingEmail',
	'supportEmail',
	'defaultLocale',
	'timezone',
] as const;
