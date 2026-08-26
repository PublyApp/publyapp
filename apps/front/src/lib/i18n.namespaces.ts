import { z } from 'zod';

export const GLOBAL_I18N_NAMESPACES = [
	'common',
	'zod',
	'response-message',
] as const;
export const FEATURE_I18N_NAMESPACES = [
	'auth',
	'account',
	'settings',
	'organizations',
	'posts',
	// Connected social accounts (Epic C): reconnect banner + account surfaces.
	'social-accounts',
	'staff-tenant-profiles',
	'staff-users',
	'staff-invitations',
	'staff-audit-logs',
	'staff-tenant-activity',
	// The landing page at `/`. Its own namespace rather than keys in `common`:
	// it is the largest single body of copy in the app and the only surface a
	// signed-out visitor loads, so it stays separately loadable.
	'landing',
] as const;
export const I18N_NAMESPACES = [
	...GLOBAL_I18N_NAMESPACES,
	...FEATURE_I18N_NAMESPACES,
] as const;

export type SupportedNamespace = (typeof I18N_NAMESPACES)[number];

export const I18nNamespaceListSchema = z.array(z.enum(I18N_NAMESPACES));

declare module '@tanstack/react-router' {
	interface StaticDataRouteOption {
		i18nNamespaces?: readonly SupportedNamespace[];
	}
}

export type I18nRouteMatch = {
	staticData?: {
		i18nNamespaces?: readonly SupportedNamespace[];
	};
};

export const collectI18nNamespaces = (
	matches: readonly I18nRouteMatch[],
): SupportedNamespace[] => {
	const requested = new Set<SupportedNamespace>(GLOBAL_I18N_NAMESPACES);

	for (const match of matches) {
		for (const namespace of match.staticData?.i18nNamespaces ?? []) {
			requested.add(namespace);
		}
	}

	return I18N_NAMESPACES.filter((namespace) => requested.has(namespace));
};
