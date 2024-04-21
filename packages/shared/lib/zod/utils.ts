import type CustomZod from './CustomZod';

export const getNumericStringSchema = (z: CustomZod) => {
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
