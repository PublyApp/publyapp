import type { MetaDescriptor } from 'react-router';

import { buildCanonicalUrl, getBaseUrl } from './canonical';

// ----------------------------------------------------------------------

export type SeoMetaInput = {
	title: string;
	description: string;
	pathname: string;
	// Optional. Defaults to '/og-image-default.jpg' joined onto getBaseUrl().
	ogImage?: string;
	// Optional. Defaults to 'website'.
	ogType?: 'website' | 'article';
	// Optional. Defaults to 'summary_large_image'.
	twitterCard?: 'summary' | 'summary_large_image';
};

// Returns the full set of MetaDescriptors for a marketing page's `meta` export.
// Includes title, description, og:* (Title/Description/URL/Image/Type/SiteName),
// twitter:* (card/title/description/image), and rel=canonical.
export const buildSeoMeta = (input: SeoMetaInput): MetaDescriptor[] => {
	const canonical = buildCanonicalUrl(input.pathname);
	const ogImage = input.ogImage ?? `${getBaseUrl()}/og-image-default.jpg`;
	const ogType = input.ogType ?? 'website';
	const twitterCard = input.twitterCard ?? 'summary_large_image';

	return [
		{ title: input.title },
		{ name: 'description', content: input.description },
		{ tagName: 'link', rel: 'canonical', href: canonical },
		{ property: 'og:title', content: input.title },
		{ property: 'og:description', content: input.description },
		{ property: 'og:url', content: canonical },
		{ property: 'og:image', content: ogImage },
		{ property: 'og:type', content: ogType },
		{ property: 'og:site_name', content: 'PublyApp' },
		{ name: 'twitter:card', content: twitterCard },
		{ name: 'twitter:title', content: input.title },
		{ name: 'twitter:description', content: input.description },
		{ name: 'twitter:image', content: ogImage },
	];
};
