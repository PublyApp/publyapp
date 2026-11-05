import type { ZodI18n } from './zod-i18n';

export const getNumericStringSchema = (z: ZodI18n) => {
	return z
		.string()
		.refine(
			(v) => {
				const n = Number(v);
				return !Number.isNaN(n) && v?.length > 0;
			},
			{ message: z.t('item-is-invalid', { item: z.t('number') }) },
		)
		.transform((v) => {
			return Number(v);
		});
};
