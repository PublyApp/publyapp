// import { z } from 'zod';

import type CustomZod from '@/shared/lib/zod/CustomZod';

export const getListParamsSchema = (z: CustomZod) => {
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
