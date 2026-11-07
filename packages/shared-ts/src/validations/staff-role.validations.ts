import type { ZodI18n } from '@org/shared-ts/lib/zod/zod-i18n';

export const getNewStaffRoleSchema = (z: ZodI18n) => {
	return z.object({
		name: z
			.string()
			.trim()
			.min(2, z.t('name-must-be-at-least-2-characters'))
			.max(100, z.t('name-must-be-at-most-100-characters')),
		description: z
			.string()
			.trim()
			.max(500, z.t('description-must-be-at-most-500-characters'))
			.optional()
			.transform((val) => (val === '' ? undefined : val)),
		permissions: z
			.array(z.string())
			.min(1, z.t('at-least-one-permission-required'))
			.default([]),
		emails: z
			.array(
				z
					.string()
					.trim()
					.pipe(z.email(z.t('invalid-email-address'))),
			)
			.default([]),
		// #980: same style contract as tenant roles — the picker always
		// submits catalogue-valid values; empty strings mean "not chosen".
		icon: z.string().optional(),
		tone: z.string().optional(),
	});
};

export const getUpdateStaffRoleSchema = (z: ZodI18n) => {
	return z.object({
		name: z
			.string()
			.trim()
			.min(2, z.t('name-must-be-at-least-2-characters'))
			.max(100, z.t('name-must-be-at-most-100-characters')),
		// For PATCH we want a way to clear the description.
		// The UI represents "clear" as an empty string, and we map that to `null`.
		description: z
			.string()
			.trim()
			.max(500, z.t('description-must-be-at-most-500-characters'))
			.optional()
			.transform((val) => {
				if (val === undefined) {
					return undefined;
				}

				if (val === '') {
					return null;
				}
				return val;
			}),
	});
};
