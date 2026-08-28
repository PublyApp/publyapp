/**
 * Shared Content Security Policy configuration
 * Used by both frontend and backend to ensure consistent CSP policies
 */

import entries from 'lodash/entries';

export interface CSPDirectives {
	defaultSrc?: string[];
	scriptSrc?: string[];
	styleSrc?: string[];
	imgSrc?: string[];
	fontSrc?: string[];
	connectSrc?: string[];
	mediaSrc?: string[];
	objectSrc?: string[];
	baseUri?: string[];
	formAction?: string[];
	frameAncestors?: string[];
	upgradeInsecureRequests?: boolean;
}

// Helmet-compatible CSP directives type
export type HelmetCSPDirectives = Record<string, Iterable<string> | null>;

type CSPConfigOptions = {
	isDevelopment?: boolean;
	nonce: string;
	additionalConnectSrc?: string[];
};

const appendUnique = (values: string[], additions: string[]): string[] => {
	const output = [...values];

	for (const value of additions) {
		if (!value || output.includes(value)) {
			continue;
		}

		output.push(value);
	}

	return output;
};

export const createCSPDirectives = ({
	isDevelopment = false,
	nonce,
	additionalConnectSrc = [],
}: CSPConfigOptions) => {
	const _nonce = nonce ? `'nonce-${nonce}'` : '';

	const baseDirectives: CSPDirectives = {
		defaultSrc: ["'self'"],
		scriptSrc: [
			"'self'",
			'https://www.publyapp.com',
			'https://publyapp.com',
			'https://us-assets.i.posthog.com', // PostHog Scripts
			_nonce,
		],
		styleSrc: [
			"'self'",
			"'unsafe-inline'",
			'https://fonts.googleapis.com',
			'https://fonts.gstatic.com',
		],
		imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
		fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
		connectSrc: appendUnique(
			[
				"'self'",
				'https://www.publyapp.com',
				'https://publyapp.com',
				'https://us.i.posthog.com', // PostHog API
				'https://us-assets.i.posthog.com', // PostHog Assets
			],
			additionalConnectSrc,
		),
		mediaSrc: ["'self'"],
		objectSrc: ["'none'"],
		baseUri: ["'self'"],
		formAction: ["'self'"],
		frameAncestors: ["'none'"],
		upgradeInsecureRequests: true,
	};

	// Add development-specific directives
	if (isDevelopment) {
		baseDirectives.scriptSrc = [
			...(baseDirectives.scriptSrc || []),
			"'unsafe-inline'",
			"'unsafe-eval'",
			'blob:',
		];
		baseDirectives.connectSrc = [
			...appendUnique(baseDirectives.connectSrc || [], [
				'http://localhost:5000', // ASP server address
				'http://localhost:5050', // vite server address
				'ws:',
				'wss:',
			]),
		];
	}

	// Convert to Helmet-compatible format: kebab-case directive names rebuilt
	// mutation-free via fromEntries, so no open accumulator discards the base
	// literal's type evidence (no-known-value-widening).
	// Explicit Helmet contract annotation restored after the round-1 review.
	const result: HelmetCSPDirectives = Object.fromEntries(
		entries(baseDirectives).flatMap(([key, value]): [string, string[]][] => {
			if (value === undefined) return [];

			const directiveName = key.replace(/([A-Z])/g, '-$1').toLowerCase();

			if (typeof value === 'boolean') {
				if (value) {
					return [[directiveName, []]];
				}
				return [];
			}
			if (Array.isArray(value)) {
				return [[directiveName, value]];
			}
			return [];
		}),
	);

	return result;
};

export const directivesToString = (directives: CSPDirectives): string => {
	const parts: string[] = [];

	entries(directives).forEach(([key, value]) => {
		if (value === undefined) return;

		const directiveName = key.replace(/([A-Z])/g, '-$1').toLowerCase();

		if (typeof value === 'boolean') {
			if (value) {
				parts.push(directiveName);
			}
		} else if (Array.isArray(value)) {
			parts.push(`${directiveName} ${value.join(' ')}`);
		}
	});

	return parts.join('; ');
};

export const createCSPHeader = ({
	isDevelopment = false,
	nonce,
	additionalConnectSrc = [],
}: CSPConfigOptions): string => {
	const directives = createCSPDirectives({
		isDevelopment,
		nonce,
		additionalConnectSrc,
	});

	// Convert Helmet format back to string format for Vite
	const parts: string[] = [];
	entries(directives).forEach(([directive, values]) => {
		if (values && Array.from(values).length > 0) {
			parts.push(`${directive} ${Array.from(values).join(' ')}`);
		} else {
			parts.push(directive);
		}
	});

	return parts.join('; ');
};

// Function to create CSP meta tags for React Router
export const createCSPMetaTags = ({
	isDevelopment = false,
	reportOnly = true,
	nonce,
	additionalConnectSrc = [],
}: {
	isDevelopment?: boolean;
	reportOnly?: boolean;
	nonce: string;
	additionalConnectSrc?: string[];
}) => {
	const cspPolicy = createCSPHeader({
		isDevelopment,
		nonce,
		additionalConnectSrc,
	});

	const metaTags = [
		{ httpEquiv: 'Content-Security-Policy', content: cspPolicy },
	];

	if (reportOnly) {
		metaTags.push({
			httpEquiv: 'Content-Security-Policy-Report-Only',
			content: cspPolicy,
		});
	}

	return metaTags;
};

// Unified CSP configuration for both frontend and backend
export const getUnifiedCSPConfig = ({
	isDevelopment = false,
	reportOnly = true,
	nonce,
	additionalConnectSrc = [],
}: {
	isDevelopment?: boolean;
	reportOnly?: boolean;
	nonce: string;
	additionalConnectSrc?: string[];
}) => {
	return {
		directives: createCSPDirectives({
			isDevelopment,
			nonce,
			additionalConnectSrc,
		}),
		headerKey: reportOnly
			? 'Content-Security-Policy-Report-Only'
			: 'Content-Security-Policy',
		header: createCSPHeader({
			isDevelopment,
			nonce: nonce || '',
			additionalConnectSrc,
		}),
		metaTags: createCSPMetaTags({
			isDevelopment,
			reportOnly,
			nonce: nonce || '',
			additionalConnectSrc,
		}),
		// For Helmet configuration
		helmetConfig: {
			useDefaults: true,
			reportOnly,
			directives: createCSPDirectives({
				isDevelopment,
				nonce: nonce || '',
				additionalConnectSrc,
			}),
			policy: createCSPHeader({
				isDevelopment,
				nonce: nonce || '',
				additionalConnectSrc,
			}),
		},
	};
};
