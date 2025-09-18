import z from 'zod';
import { getJobTypeFunction } from '../utils/utils';

export const exampleJob = getJobTypeFunction({
	schema: z.object({
		param1: z.string(),
	}),
	handler: async (params) => {
		//--------------------------------------------------------------------------------------//
		//                              write your job logic here                               //
		//--------------------------------------------------------------------------------------//
		console.log(params);
	},
});
