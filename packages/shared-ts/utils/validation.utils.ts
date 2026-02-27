// import { z } from 'zod';

import type InterZod from '@/shared/lib/zod/InterZod';

export const getListParamsSchema = (z: InterZod) => {
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
