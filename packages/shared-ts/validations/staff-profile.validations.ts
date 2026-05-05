import type InterZod from '@org/shared-ts/lib/zod/InterZod';

export const getNewStaffProfileSchema = (z: InterZod) => {
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
			.array(z.string().trim().email(z.t('invalid-email-address')))
			.default([]),
	});
};
