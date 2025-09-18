import type z from 'zod';
import type { AnyZodObject } from 'zod';

type AsyncFunctionWithParams<Params, ReturnType = unknown> = (
	params: Params,
) => Promise<ReturnType>;

export const getJobTypeFunction = <Schema extends AnyZodObject>({
	schema,
	handler,
}: {
	schema: Schema;
	handler: AsyncFunctionWithParams<z.infer<Schema>>;
}) => {
	return async (params: unknown) => {
		const result = await schema.parseAsync(params);
		await handler(result);
	};
};
