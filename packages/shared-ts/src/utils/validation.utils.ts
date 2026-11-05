// import { z } from 'zod';

import type { ZodI18n } from '@org/shared-ts/lib/zod/zod-i18n';

export const getListParamsSchema = (z: ZodI18n) => {
	return z.object({
		page: z.number().optional(),
		pageSize: z.number().optional(),
		sorting: z
			.object({
				id: z.string(),
				desc: z.boolean(),
			})
			.array()
			.optional(),
		// fromPublic: z.boolean().optional(),
		// fromStaff: z.boolean().optional(),
	});
};
