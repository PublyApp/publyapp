/**
 * Shared Content Security Policy configuration
 * Used by both frontend and backend to ensure consistent CSP policies
 */

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

export const createCSPDirectives = (
	isDevelopment = false,
	nonce?: string,
): HelmetCSPDirectives => {
	const _nonce = nonce ? `'nonce-${nonce}'` : '';

	const baseDirectives: CSPDirectives = {
		defaultSrc: ["'self'"],
		scriptSrc: [
			"'self'",
			'https://www.pdfvite.com',
			'https://pdfvite.com',
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
		connectSrc: ["'self'", 'https://www.pdfvite.com', 'https://pdfvite.com'],
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
		];
		baseDirectives.connectSrc = [
			...(baseDirectives.connectSrc || []),
			'http://localhost:6180', // express server address
			'http://localhost:6181', // vite server address
			'ws:',
			'wss:',
		];
	}

	// Convert to Helmet-compatible format
	const helmetDirectives: HelmetCSPDirectives = {};

	Object.entries(baseDirectives).forEach(([key, value]) => {
		if (value === undefined) return;

		const directiveName = key.replace(/([A-Z])/g, '-$1').toLowerCase();

		if (typeof value === 'boolean') {
			if (value) {
				helmetDirectives[directiveName] = [];
			}
		} else if (Array.isArray(value)) {
			helmetDirectives[directiveName] = value;
		}
	});

	return helmetDirectives;
};

export const directivesToString = (directives: CSPDirectives): string => {
	const parts: string[] = [];

	Object.entries(directives).forEach(([key, value]) => {
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

export const createCSPHeader = (isDevelopment = false): string => {
	const directives = createCSPDirectives(isDevelopment);

	// Convert Helmet format back to string format for Vite
	const parts: string[] = [];
	Object.entries(directives).forEach(([directive, values]) => {
		if (values && Array.from(values).length > 0) {
			parts.push(`${directive} ${Array.from(values).join(' ')}`);
		} else {
			parts.push(directive);
		}
	});

	return parts.join('; ');
};

// Function to create CSP meta tags for React Router
export const createCSPMetaTags = (isDevelopment = false, reportOnly = true) => {
	const cspPolicy = createCSPHeader(isDevelopment);

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
}: {
	isDevelopment?: boolean;
	reportOnly?: boolean;
	nonce?: string;
}) => {
	return {
		directives: createCSPDirectives(isDevelopment, nonce),
		headerKey: reportOnly
			? 'Content-Security-Policy-Report-Only'
			: 'Content-Security-Policy',
		header: createCSPHeader(isDevelopment),
		metaTags: createCSPMetaTags(isDevelopment, reportOnly),
		// For Helmet configuration
		helmetConfig: {
			useDefaults: true,
			reportOnly,
			directives: createCSPDirectives(isDevelopment),
			policy: createCSPHeader(isDevelopment),
		},
	};
};
