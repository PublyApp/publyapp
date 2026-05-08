import {
	type BlogAuthor,
	type BlogPost,
	unsplashCover,
} from '#app/routes/marketing/_data/blog.ts';

import { getBaseUrl } from './canonical';

// ----------------------------------------------------------------------

const ORG_NAME = 'PublyApp';
const ORG_LOGO_PATH = '/logo-512.png';
// Placeholder social URLs — replace with real account URLs when accounts exist.
const ORG_SAME_AS = [
	'https://x.com/publyapp',
	'https://linkedin.com/company/publyapp',
];

// ----------------------------------------------------------------------

export const buildOrganizationSchema = (): Record<string, unknown> => {
	const base = getBaseUrl();
	return {
		'@context': 'https://schema.org',
		'@type': 'Organization',
		name: ORG_NAME,
		url: `${base}/`,
		logo: `${base}${ORG_LOGO_PATH}`,
		sameAs: ORG_SAME_AS,
	};
};

// ----------------------------------------------------------------------

export const buildWebSiteSchema = (): Record<string, unknown> => {
	const base = getBaseUrl();
	return {
		'@context': 'https://schema.org',
		'@type': 'WebSite',
		name: ORG_NAME,
		url: `${base}/`,
		potentialAction: {
			'@type': 'SearchAction',
			target: `${base}/blog/?tag={search_term_string}`,
			'query-input': 'required name=search_term_string',
		},
	};
};

// ----------------------------------------------------------------------

export const buildBlogPostingSchema = (
	post: BlogPost,
	author: BlogAuthor,
): Record<string, unknown> => {
	const base = getBaseUrl();
	return {
		'@context': 'https://schema.org',
		'@type': 'BlogPosting',
		headline: post.title,
		description: post.excerpt,
		image: unsplashCover(post.coverSlug, { w: 1200, h: 630 }),
		datePublished: post.publishedAt,
		dateModified: post.publishedAt,
		author: {
			'@type': 'Person',
			name: author.name,
			jobTitle: author.role,
			image: author.photoUrl,
		},
		publisher: {
			'@type': 'Organization',
			name: ORG_NAME,
			logo: {
				'@type': 'ImageObject',
				url: `${base}${ORG_LOGO_PATH}`,
			},
		},
		mainEntityOfPage: {
			'@type': 'WebPage',
			'@id': `${base}/blog/${post.slug}/`,
		},
	};
};

// ----------------------------------------------------------------------

export type BreadcrumbItem = {
	name: string;
	url: string;
};

export const buildBreadcrumbListSchema = (
	items: BreadcrumbItem[],
): Record<string, unknown> => {
	return {
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: items.map((item, i) => {
			return {
				'@type': 'ListItem',
				position: i + 1,
				name: item.name,
				item: item.url,
			};
		}),
	};
};

// ----------------------------------------------------------------------

export type FaqItem = {
	question: string;
	answer: string;
};

export const buildFaqPageSchema = (
	faqs: FaqItem[],
): Record<string, unknown> => {
	return {
		'@context': 'https://schema.org',
		'@type': 'FAQPage',
		mainEntity: faqs.map((faq) => {
			return {
				'@type': 'Question',
				name: faq.question,
				acceptedAnswer: {
					'@type': 'Answer',
					text: faq.answer,
				},
			};
		}),
	};
};
