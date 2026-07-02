import {
	FALLBACK_LANGUAGE,
	SUPPORTED_LANGUAGES,
	type SupportedLanguage,
} from '~/lib/i18n.shared';

type SeoMetaTag = {
	name?: string;
	property?: string;
	content: string;
};

type SeoLinkTag = {
	rel: string;
	href: string;
	hrefLang?: string;
};

export type SeoPayload = {
	title: string;
	meta: SeoMetaTag[];
	links: SeoLinkTag[];
};

type SeoInput = {
	title: string;
	description?: string;
	canonical?: string;
	image?: string;
	locale?: SupportedLanguage;
	robots?: string;
	sitemap?: string;
};

const normalizeCanonical = (canonical: string | undefined): string => {
	if (!canonical?.trim()) {
		return '/';
	}

	const value = canonical.trim();
	const withoutQuery = value.split('?')[0] ?? value;
	return withoutQuery || '/';
};

const toOgLocale = (locale: SupportedLanguage): string =>
	locale === 'fr' ? 'fr_FR' : 'en_US';

const toLanguageTag = (locale: SupportedLanguage): string =>
	locale === 'fr' ? 'fr-FR' : 'en-US';

const alternateLocales = (locale: SupportedLanguage): SupportedLanguage[] =>
	SUPPORTED_LANGUAGES.filter((entry) => entry !== locale);

export const seo = ({
	title,
	description,
	canonical,
	image,
	locale = FALLBACK_LANGUAGE,
	robots = 'index, follow',
	sitemap,
}: SeoInput): SeoPayload => {
	const canonicalHref = normalizeCanonical(canonical);
	const imageUrl = image ?? '/images/social-share.png';

	return {
		title,
		meta: [
			{ name: 'description', content: description ?? title },
			{ name: 'robots', content: robots },
			{ name: 'twitter:site', content: '@publyapp' },
			{ name: 'twitter:creator', content: '@publyapp' },
			{ name: 'twitter:title', content: title },
			{ name: 'twitter:description', content: description ?? title },
			{ name: 'twitter:image', content: imageUrl },
			{
				name: 'twitter:card',
				content: image ? 'summary_large_image' : 'summary',
			},
			{ property: 'og:title', content: title },
			{ property: 'og:description', content: description ?? title },
			{ property: 'og:url', content: canonicalHref },
			{ property: 'og:type', content: 'website' },
			{ property: 'og:image', content: imageUrl },
			{ property: 'og:locale', content: toOgLocale(locale) },
			...alternateLocales(locale).map((alternate) => ({
				property: 'og:locale:alternate',
				content: toOgLocale(alternate),
			})),
			{ name: 'language', content: toLanguageTag(locale) },
		],
		links: [
			{ rel: 'canonical', href: canonicalHref },
			{ rel: 'sitemap', href: sitemap ?? '/sitemap.xml' },
			...SUPPORTED_LANGUAGES.map((localeCandidate) => ({
				rel: 'alternate',
				href: canonicalHref,
				hrefLang: localeCandidate,
			})),
			{ rel: 'alternate', href: canonicalHref, hrefLang: 'x-default' },
		],
	};
};
