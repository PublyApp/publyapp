import { z } from 'zod';

export const getListParamsSchema = z.object({
	page: z.number().optional(),
	pageSize: z.number().optional(),
	sorting: z
		.object({
			id: z.string(),
			desc: z.boolean(),
		})
		.array()
		.optional(),
	fromPublic: z.boolean().optional(),
	// fromStaff: z.boolean().optional(),
});
