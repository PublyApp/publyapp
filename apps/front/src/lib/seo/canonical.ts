// The canonical hostname for absolute URLs in sitemap / canonical / og:url.
// Set via VITE_APP_URL in .env.* files. Falls back to the production domain
// so dev sitemap doesn't break, but localhost dev should set the env var.
export const getBaseUrl = (): string => {
	return import.meta.env.VITE_APP_URL ?? 'https://publyapp.com';
};

// Build an absolute canonical URL from a request pathname. Strips query
// string (canonical points to the parameter-less form) and forces a
// trailing slash (matches the marketing trailing-slash policy).
export const buildCanonicalUrl = (pathname: string): string => {
	const base = getBaseUrl();
	const cleanPath = pathname.split('?')[0] ?? pathname;
	const withSlash = cleanPath.endsWith('/') ? cleanPath : `${cleanPath}/`;
	return `${base}${withSlash}`;
};
