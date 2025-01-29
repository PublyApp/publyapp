import { type AnyZodObject } from 'zod';

export const getJobTypeFunction = ({ schema, handler }: { schema: AnyZodObject; handler: AsyncFunction }) => {
	return async (params: unknown) => {
		const result = await schema.parseAsync(params);
		await handler(result);
	};
};
