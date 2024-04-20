import type { RequestHandler } from 'express';

import { tryCatchWrapper } from '@devist/shared/utils/tryCatchWrapper';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const expressEndpoint = <T extends RequestHandler & ((...args: any[]) => Promise<any>)>(
	handler: T,
): RequestHandler => {
	return async (req, res, next) => {
		const wrappedFunction = tryCatchWrapper(handler, (error) => {
			return next(error);
		});

		return wrappedFunction(req, res, next);
	};
};
