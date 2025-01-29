import { ZodError, type AnyZodObject } from 'zod';

export const getJobTypeFunction = ({ schema, handler }: { schema: AnyZodObject; handler: AsyncFunction }) => {
	return async (params: unknown) => {
		try {
			const result = await schema.parseAsync(params);
			await handler(result);
		} catch (error) {
			if (error instanceof ZodError) {
				throw new Error('Bad Parameter');
			}

			console.log(error);
		}
	};
};
