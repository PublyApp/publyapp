/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ParsedQs } from 'qs';

import { tryCatchWrapper } from '@devist/shared/utils/tryCatchWrapper';

type ParamsDictionary = Record<string, string>;

interface AsyncRequestHandler<
	P = ParamsDictionary,
	ResBody = any,
	ReqBody = any,
	ReqQuery = ParsedQs,
	LocalsObj extends Record<string, any> = Record<string, any>,
> {
	(
		req: Request<P, ResBody, ReqBody, ReqQuery, LocalsObj>,
		res: Response<ResBody, LocalsObj>,
		next: NextFunction,
	): Promise<any>;
}

export const expressHandler = <T extends AsyncRequestHandler>(innerHandler: T): RequestHandler => {
	const handler: RequestHandler = async (req, res, next) => {
		const wrappedFunction = tryCatchWrapper(innerHandler, (error) => {
			return next(error);
		});

		return wrappedFunction(req, res, next);
	};

	return handler;
};
