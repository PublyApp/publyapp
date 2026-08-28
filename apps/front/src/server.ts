import {
	createStartHandler,
	defineHandlerCallback,
	defaultStreamHandler,
} from '@tanstack/react-start/server';

import { logger } from '@org/shared-ts/lib/logger/iso-logger';

import { captureBadRequest, classifyBadResponse } from './lib/analytics';
import { getPublicEnv, getServerEnv, isDevelopmentRuntime } from './lib/env';
import { createBackendI18n, loadNamespacesStrict } from './lib/i18n.backend';
import { GLOBAL_I18N_NAMESPACES } from './lib/i18n.namespaces';
import { resolveLocaleFromCookie } from './lib/i18n.server';
import type { SupportedLanguage } from './lib/i18n.shared';
import { mintCspNonce, applyCspHeaders } from './server/csp';
import { seo } from './utils/seo';

type StreamHandlerContext = Parameters<typeof defaultStreamHandler>[0];

const isHtml = (response: Response): boolean => {
	const contentType = response.headers.get('content-type') ?? '';
	return contentType.toLowerCase().includes('text/html');
};

const getStreamHandlerResponse = (
	result: Awaited<ReturnType<typeof defaultStreamHandler>>,
): Response => {
	if (typeof result === 'object' && result !== null && 'response' in result) {
		return result.response as Response;
	}

	return result as Response;
};

const resolveLocaleFromRequest = (request: Request): SupportedLanguage => {
	return resolveLocaleFromCookie(request.headers.get('cookie') ?? undefined);
};

export const escapeHtml = (value: string): string =>
	value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');

const setRouterNonce = (ctx: StreamHandlerContext, nonce: string): void => {
	ctx.router.options = {
		...ctx.router.options,
		ssr: {
			...ctx.router.options?.ssr,
			nonce,
		},
	};
};

const renderMetaTag = (tag: {
	name?: string;
	property?: string;
	content: string;
}): string => {
	const key = tag.name ? `name="${tag.name}"` : `property="${tag.property}"`;
	return `<meta ${key} content="${escapeHtml(tag.content)}" />`;
};

const renderLinkTag = (link: {
	rel: string;
	href: string;
	hrefLang?: string;
}): string => {
	const attributes = [
		`rel="${escapeHtml(link.rel)}"`,
		`href="${escapeHtml(link.href)}"`,
		link.hrefLang ? `hreflang="${escapeHtml(link.hrefLang)}"` : '',
	]
		.filter(Boolean)
		.join(' ');

	return `<link ${attributes} />`;
};

const resolveOrigin = (request: Request): string => {
	const host = request.headers.get('host');
	if (host) {
		const protocol = request.headers.get('x-forwarded-proto') ?? 'https';
		return `${protocol}://${host}`;
	}
	return new URL(request.url).origin;
};

export const isIndexableSeoRoute = (
	requestPath: string,
	status: number,
): boolean => {
	return (
		status >= 200 &&
		status < 300 &&
		(requestPath === '/' || requestPath === '/login')
	);
};

export type SeoTranslator = (key: string) => string;

export const resolveSeoTranslator = async (
	locale: SupportedLanguage,
): Promise<SeoTranslator> => {
	const instance = await createBackendI18n(locale);
	await loadNamespacesStrict(instance, GLOBAL_I18N_NAMESPACES);
	const t = instance.getFixedT(locale, 'common');
	return t;
};

export const injectSeoMarkup = (
	html: string,
	request: Request,
	locale: SupportedLanguage,
	seoAllowed: boolean,
	origin: string,
	t: SeoTranslator,
): string => {
	const requestUrl = new URL(request.url);
	const requestPath = requestUrl.pathname;
	const isLogin = requestPath === '/login';
	const output = html;

	if (!output.includes('</head>')) {
		return output;
	}

	const canonical = `${origin}${requestPath}`;
	const metaTags: string[] = [];

	if (seoAllowed) {
		const payload = seo({
			title: isLogin ? t('seo-login-title') : t('seo-default-title'),
			description: isLogin
				? t('seo-login-description')
				: t('seo-home-description'),
			canonical,
			sitemap: `${origin}/sitemap.xml`,
			locale,
			image: `${origin}/images/social-share.png`,
		});

		metaTags.push(...payload.meta.map(renderMetaTag));
		metaTags.push(...payload.links.map(renderLinkTag));
	} else {
		metaTags.push('<meta name="robots" content="noindex, nofollow" />');
	}

	const newline = '\n';

	return output.replace(
		'</head>',
		`${metaTags.join(newline)}${newline}</head>`,
	);
};

const sendBadResponseCapture = (
	ctx: StreamHandlerContext,
	response: Response,
): void => {
	const disposition = classifyBadResponse(response.status);
	if (disposition === 'drop') {
		return;
	}

	void captureBadRequest({
		request: ctx.request,
		status: response.status,
		path: new URL(ctx.request.url).pathname,
		method: ctx.request.method,
		locale: resolveLocaleFromRequest(ctx.request),
	}).catch((error) => {
		const logContext = {
			error: `${error}`,
			path: new URL(ctx.request.url).pathname,
			status: response.status,
		};
		if (disposition === 'error') {
			logger.error('bad-request analytics capture failed', logContext);
			return;
		}

		logger.debug('bad-request analytics capture failed', logContext);
	});
};

export const validateRuntimeEnv = (): void => {
	getPublicEnv();
	getServerEnv();
};

export default {
	fetch: createStartHandler(
		defineHandlerCallback(async (ctx: StreamHandlerContext) => {
			const nonce = mintCspNonce();
			const locale = resolveLocaleFromRequest(ctx.request);

			setRouterNonce(ctx, nonce);
			applyCspHeaders(ctx.responseHeaders, nonce, isDevelopmentRuntime());

			const handlerResult = await defaultStreamHandler(ctx);
			const response = getStreamHandlerResponse(handlerResult);
			sendBadResponseCapture(ctx, response);

			if (!isHtml(response)) {
				return response;
			}

			const html = await response.text();
			const requestPath = new URL(ctx.request.url).pathname;
			const shouldInjectSeo = isIndexableSeoRoute(requestPath, response.status);
			const seoTranslator = await resolveSeoTranslator(locale);
			const updatedHtml = injectSeoMarkup(
				html,
				ctx.request,
				locale,
				shouldInjectSeo,
				resolveOrigin(ctx.request),
				seoTranslator,
			);
			const headers = new Headers(response.headers);

			headers.delete('content-encoding');
			headers.delete('content-length');

			return new Response(updatedHtml, {
				status: response.status,
				statusText: response.statusText,
				headers,
			});
		}),
	),
};
