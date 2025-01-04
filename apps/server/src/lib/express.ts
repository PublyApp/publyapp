/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Application, NextFunction, Request, RequestHandler, Response } from 'express';
import type { ParsedQs } from 'qs';

import { tryCatchWrapper } from '@devist/shared/utils/tryCatch.utils';

import { logger } from '@/server/lib/winston';

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

export const expressHandler = (innerHandler: AsyncRequestHandler): RequestHandler => {
	const handler: RequestHandler = async (req, res, next) => {
		const wrappedFunction = tryCatchWrapper({
			handler: innerHandler,
			onError: (error) => {
				return next(error);
			},
		});

		return wrappedFunction(req, res, next);
	};

	return handler;
};

// copy paste from stack overflow: I don't bother fix eslint issues here
export const listRoutes = (app: Application) => {
	// eslint-disable-next-line func-style, prefer-arrow/prefer-arrow-functions
	function split(thing: any) {
		if (typeof thing === 'string') {
			return thing.split('/');
		}

		if (thing.fast_slash) {
			return '';
		}

		const match = thing
			.toString()
			.replace('\\/?', '')
			.replace('(?=\\/|$)', '$')
			// eslint-disable-next-line no-useless-escape
			.match(/^\/\^((?:\\[.*+?^${}()|[\]\\\/]|[^.*+?^${}()|[\]\\\/])*)\$\//);
		return match ? match[1].replace(/\\(.)/g, '$1').split('/') : `<complex:${thing.toString()}>`;
	}

	// eslint-disable-next-line func-style, prefer-arrow/prefer-arrow-functions
	function print(path: any, layer: any) {
		if (layer.route) {
			layer.route.stack.forEach(print.bind(null, path.concat(split(layer.route.path))));
		} else if (layer.name === 'router' && layer.handle.stack) {
			layer.handle.stack.forEach(print.bind(null, path.concat(split(layer.regexp))));
		} else if (layer.method) {
			logger.info('%s /%s', layer.method.toUpperCase(), path.concat(split(layer.regexp)).filter(Boolean).join('/'));
		}
	}

	app._router.stack.forEach(print.bind(null, []));
};
