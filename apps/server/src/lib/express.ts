import { logger } from '@org/shared/lib/winston.server';
import { tryCatchWrapper } from '@org/shared/utils/try-catch';
import type {
	Application,
	NextFunction,
	Request,
	RequestHandler,
	Response,
} from 'express';
import type { TFunction } from 'i18next';
import _ from 'lodash';
import type { ParsedQs } from 'qs';
import {
	CLOUDFLARE_CONNECTING_IP_HEADER_KEY,
	FORWARDED_FOR_HEADER_KEY,
	LOCALE_HEADER_KEY,
	REMIX_CLIENT_IP_HEADER_KEY,
} from '@/shared/lib/constants';
import { getCorrectLocale } from '@/shared/lib/i18n/i18n.utils';

import type { AppLocale } from '@/shared/lib/i18n/resources';
import InterZod from '@/shared/lib/zod/InterZod';
import { i18nextServer } from './i18n';

type ParamsDictionary = Record<string, string>;

export type AsyncRequestHandler<
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

// copy paste from stack overflow: I don't bother fix lint issues here
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
			.match(/^\/\^((?:\\[.*+?^${}()|[\]\\/]|[^.*+?^${}()|[\]\\/])*)\$\//);
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
			logger.debug(
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

export type RequestUtils = {
	t: TFunction;
	z: InterZod;
	locale: AppLocale;
};

export const getRequestUtils = (req: Request) => {
	if (req.requestUtils) {
		return req.requestUtils;
	}

	const localeInHeaders = getHeader(req, LOCALE_HEADER_KEY);
	const locale = getCorrectLocale(localeInHeaders);
	const z = new InterZod({ i18n: i18nextServer, locale });
	const { t } = z;

	const requestUtils = {
		locale,
		t,
		z,
	};

	req.requestUtils = requestUtils;

	return requestUtils;
};

export const getRequestIp = (req: Request) => {
	return (
		getHeader(req, REMIX_CLIENT_IP_HEADER_KEY) ||
		getHeader(req, CLOUDFLARE_CONNECTING_IP_HEADER_KEY) ||
		getHeader(req, FORWARDED_FOR_HEADER_KEY) ||
		req.socket.remoteAddress
	);
};
