import _ from 'lodash';

import type {
	Application,
	NextFunction,
	Request,
	RequestHandler,
	Response,
} from 'express';
import type { ParsedQs } from 'qs';

import { tryCatchWrapper } from '@org/shared/utils/tryCatch.utils';

import { logger } from '@/server/lib/winston';
import {
	LOCALE_HEADER_KEY,
	X_FORWARDED_FOR_HEADER_KEY,
	X_REMIX_CLIENT_IP,
} from '@/shared/lib/constants';
import { getCorrectLocale } from '@/shared/lib/i18n/i18n.utils';
import InterZod from '@/shared/lib/zod/InterZod';

import { i18nextServer } from './i18n';

type ParamsDictionary = Record<string, string>;

type AsyncRequestHandler<
	P = ParamsDictionary,
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	ResBody = any,
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	ReqBody = any,
	ReqQuery = ParsedQs,
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	LocalsObj extends Record<string, any> = Record<string, any>,
> = (
	req: Request<P, ResBody, ReqBody, ReqQuery, LocalsObj>,
	res: Response<ResBody, LocalsObj>,
	next: NextFunction,
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
) => Promise<any>;

export const expressHandler = <
	P = ParamsDictionary,
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	ResBody = any,
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	ReqBody = any,
	ReqQuery = ParsedQs,
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	Locals extends Record<string, any> = Record<string, any>,
>(
	innerHandler: AsyncRequestHandler<P, ResBody, ReqBody, ReqQuery, Locals>,
) => {
	const handler: RequestHandler<P, ResBody, ReqBody, ReqQuery, Locals> = async (
		req,
		res,
		next,
	) => {
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
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	const split = (thing: any) => {
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
			.match(/^\/\^((?:\\[.*+?^${}()|[\]\\\/]|[^.*+?^${}()|[\]\\\/])*)\$\//);
		return match
			? match[1].replace(/\\(.)/g, '$1').split('/')
			: `<complex:${thing.toString()}>`;
	};

	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	const print = (path: any, layer: any) => {
		if (layer.route) {
			layer.route.stack.forEach(
				print.bind(null, path.concat(split(layer.route.path))),
			);
		} else if (layer.name === 'router' && layer.handle.stack) {
			layer.handle.stack.forEach(
				print.bind(null, path.concat(split(layer.regexp))),
			);
		} else if (layer.method) {
			logger.info(
				'%s /%s',
				layer.method.toUpperCase(),
				path.concat(split(layer.regexp)).filter(Boolean).join('/'),
			);
		}
	};

	app._router.stack.forEach(print.bind(null, []));
};

export const getHeader = (req: Request, key: string) => {
	return req.get(key) || req.get(_.toLower(key));
};

export const getRequestUtils = (req: Request) => {
	const localeInHeaders = getHeader(req, LOCALE_HEADER_KEY);
	const locale = getCorrectLocale(localeInHeaders);
	const z = new InterZod({ i18n: i18nextServer, locale });
	const { t } = z;

	return {
		locale,
		t,
		z,
	};
};

export const getRequestIp = (req: Request) => {
	return (
		getHeader(req, X_REMIX_CLIENT_IP) ||
		getHeader(req, X_FORWARDED_FOR_HEADER_KEY) ||
		req.socket.remoteAddress
	);
};
