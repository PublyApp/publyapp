import { parse as parseCookie } from 'cookie';

import {
	createStartHandler,
	defaultStreamHandler,
	defineHandlerCallback,
} from '@tanstack/react-start/server';

import { LOCALE_COOKIE_KEY } from '@org/shared-ts/lib/constants';

import { captureBadRequest } from './lib/analytics';
import {
	dirForLocale,
	FALLBACK_LANGUAGE,
	isSupportedLanguage,
	type SupportedLanguage,
} from './lib/i18n.shared';
import { mintCspNonce, applyCspHeaders } from './server/csp';
import { seo } from './utils/seo';

type ResponseContext = {
	request: Request;
	router: {
		options?: {
			ssr?: {
				nonce?: string;
			};
		};
	};
	responseHeaders: Headers;
};

const isHtml = (response: Response): boolean => {
	const contentType = response.headers.get('content-type') ?? '';
	return contentType.toLowerCase().includes('text/html');
};

const resolveLocaleFromRequest = (request: Request): SupportedLanguage => {
	const parsedCookie = parseCookie(request.headers.get('cookie') ?? '');
	const localeFromCookie = parsedCookie[LOCALE_COOKIE_KEY];

	return isSupportedLanguage(localeFromCookie) ? localeFromCookie : FALLBACK_LANGUAGE;
};

const escapeHtml = (value: string): string =>
	value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');

const setRouterNonce = (ctx: ResponseContext, nonce: string): void => {
	const routerOptions = ctx.router.options ?? {};
	const ssrOptions = routerOptions.ssr ?? {};

	ctx.router.options = {
		...routerOptions,
		ssr: {
			...ssrOptions,
			nonce,
		},
	};
};

const replaceHtmlLanguage = (html: string, locale: SupportedLanguage): string => {
	const language = escapeHtml(locale);
	const direction = escapeHtml(dirForLocale(locale));

	return html.replace(/<html\b([^>]*)>/i, (_match, attrs: string) => {
		const cleaned = String(attrs)
			.replace(/\s*lang=(?:"[^"]*"|'[^']*'|[^\s>]+)/i, '')
			.replace(/\s*dir=(?:"[^"]*"|'[^']*'|[^\s>]+)/i, '')
			.trim();

		return `<html${cleaned ? ` ${cleaned}` : ''} lang="${language}" dir="${direction}">`;
	});
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

const injectSeoMarkup = (
	html: string,
	request: Request,
	locale: SupportedLanguage,
	nonce: string,
): string => {
	let output = replaceHtmlLanguage(html, locale);
	if (!output.includes('</head>')) {
		return output;
	}

	if (output.includes('name="csp-nonce"')) {
		return output;
	}

	const origin = new URL(request.url).origin;
	const payload = seo({
		title: request.url.includes('/login') ? 'front-2 | Login' : 'front-2 | Foundation',
		description: request.url.includes('/login')
			? 'Sign in to front-2.'
			: 'front-2 foundations: i18n, CSP, SEO, analytics.',
		canonical: request.url,
		sitemap: `${origin}/sitemap.xml`,
		locale,
		image: `${origin}/images/social-share.png`,
	});

	const injected = [
		`<meta name="csp-nonce" content="${escapeHtml(nonce)}" />`,
		...payload.meta.map(renderMetaTag),
		...payload.links.map(renderLinkTag),
	].join('\n');

	return output.replace('</head>', `${injected}\n</head>`);
};

const sendBadResponseCapture = async (
	ctx: ResponseContext,
	response: Response,
): Promise<void> => {
	if (response.status >= 200 && response.status < 300) {
		return;
	}

	await captureBadRequest({
		request: ctx.request,
		status: response.status,
		path: new URL(ctx.request.url).pathname,
		method: ctx.request.method,
		userAgent: ctx.request.headers.get('user-agent'),
		locale: resolveLocaleFromRequest(ctx.request),
	});
};

export default {
	fetch: createStartHandler(
		defineHandlerCallback(async (ctx: ResponseContext) => {
			const nonce = mintCspNonce();
			const locale = resolveLocaleFromRequest(ctx.request);

			setRouterNonce(ctx, nonce);
			applyCspHeaders(
				ctx.responseHeaders,
				nonce,
				process.env.NODE_ENV === 'development',
			);

			const response = await defaultStreamHandler(ctx);
			await sendBadResponseCapture(ctx, response);

			if (!isHtml(response)) {
				return response;
			}

			const html = await response.text();
			const updatedHtml = injectSeoMarkup(html, ctx.request, locale, nonce);
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
