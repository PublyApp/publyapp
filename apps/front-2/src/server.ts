import {
	createStartHandler,
	defineHandlerCallback,
	defaultStreamHandler,
} from '@tanstack/react-start/server';

import { logger } from '@org/shared-ts/lib/logger/iso-logger';

import { captureBadRequest } from './lib/analytics';
import { getOptionalPublicApiBaseUrl, isDevelopmentRuntime } from './lib/env';
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

export const resolvePublicApiBaseUrlEnv = (): string | undefined => {
	const value = getOptionalPublicApiBaseUrl();
	if (!value) {
		return undefined;
	}

	return JSON.stringify({ PUBLIC_API_BASE_URL: value }).replace(
		/</g,
		'\\u003c',
	);
};

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

const renderTitleTag = (title: string): string =>
	`<title>${escapeHtml(title)}</title>`;

export const renderPublicEnvScript = (payload: string, nonce: string): string =>
	`<script nonce="${escapeHtml(nonce)}">` +
	`window.__ENV__ = Object.assign({}, window.__ENV__, ${payload});` +
	`</script>`;

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

const resolveFallbackTitle = (
	isLogin: boolean,
	seoAllowed: boolean,
): string => {
	if (isLogin) {
		return 'front-2 | Login';
	}

	if (seoAllowed) {
		return 'front-2 | Foundation';
	}

	return 'front-2';
};

const injectSeoMarkup = (
	html: string,
	request: Request,
	locale: SupportedLanguage,
	nonce: string,
	seoAllowed: boolean,
): string => {
	const requestUrl = new URL(request.url);
	const requestPath = requestUrl.pathname;
	const isLogin = requestPath === '/login';
	const output = html;

	if (!output.includes('</head>')) {
		return output;
	}

	const origin = requestUrl.origin;
	const canonical = `${origin}${requestPath}`;
	const metaTags: string[] = [];

	if (seoAllowed) {
		const payload = seo({
			title: isLogin ? 'front-2 | Login' : 'front-2 | Foundation',
			description: isLogin
				? 'Sign in to front-2.'
				: 'front-2 foundations: i18n, CSP, SEO, analytics.',
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

	if (!output.includes('name="csp-nonce"')) {
		metaTags.unshift(
			`<meta name="csp-nonce" content="${escapeHtml(nonce)}" />`,
		);
	}

	if (!output.includes('<title')) {
		metaTags.unshift(renderTitleTag(resolveFallbackTitle(isLogin, seoAllowed)));
	}

	return output.replace('</head>', `${metaTags.join('\n')}\n</head>`);
};

export const injectPublicRuntimeEnv = (
	html: string,
	payload: string | undefined,
	nonce: string,
): string => {
	if (!payload || !html.includes('</head>')) {
		return html;
	}

	return html.replace(
		'</head>',
		`${renderPublicEnvScript(payload, nonce)}\n</head>`,
	);
};

const sendBadResponseCapture = (
	ctx: StreamHandlerContext,
	response: Response,
): void => {
	if (response.status >= 200 && response.status < 300) {
		return;
	}

	void captureBadRequest({
		request: ctx.request,
		status: response.status,
		path: new URL(ctx.request.url).pathname,
		method: ctx.request.method,
		locale: resolveLocaleFromRequest(ctx.request),
	}).catch((error) => {
		logger.debug('bad-request analytics capture failed', {
			error: `${error}`,
			path: new URL(ctx.request.url).pathname,
			status: response.status,
		});
	});
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
			const updatedHtml = injectSeoMarkup(
				html,
				ctx.request,
				locale,
				nonce,
				shouldInjectSeo,
			);
			const withPublicRuntimeEnv = injectPublicRuntimeEnv(
				updatedHtml,
				resolvePublicApiBaseUrlEnv(),
				nonce,
			);
			const headers = new Headers(response.headers);

			headers.delete('content-encoding');
			headers.delete('content-length');

			return new Response(withPublicRuntimeEnv, {
				status: response.status,
				statusText: response.statusText,
				headers,
			});
		}),
	),
};
