import { deepFreeze } from '@org/shared-ts/utils/any.utils';

// Centralized feature-flag registry. Flags are static config with optional
// Vite env-var overrides (VITE_FEATURE_*). Read at module load — no runtime
// service. Both route registration AND link visibility consume the same flag,
// so one flip in this file (or via env var) toggles the page entirely.
//
// To flip a flag without redeploying: set the corresponding VITE_FEATURE_*
// env var (e.g. in .env.production) and rebuild.

const readFlag = (envKey: string, defaultValue: boolean): boolean => {
	const raw = import.meta.env[envKey];
	if (raw === 'true') {
		return true;
	}
	if (raw === 'false') {
		return false;
	}
	return defaultValue;
};

export const FEATURES = deepFreeze({
	marketing: {
		// Phase 3 supporting pages — built but not all needed at launch
		about: readFlag('VITE_FEATURE_MARKETING_ABOUT', true),
		contact: readFlag('VITE_FEATURE_MARKETING_CONTACT', true),
		security: readFlag('VITE_FEATURE_MARKETING_SECURITY', true),
		// Path segments only — pages not built yet, footer links 404 to
		// MarketingNotFoundPage when enabled
		blog: readFlag('VITE_FEATURE_MARKETING_BLOG', true),
		changelog: readFlag('VITE_FEATURE_MARKETING_CHANGELOG', true),
		// Phase 5 changelog secondary surfaces — default OFF, opt-in once
		// real data / signup endpoint exist
		changelogStats: readFlag('VITE_FEATURE_MARKETING_CHANGELOG_STATS', false),
		changelogSubscribe: readFlag(
			'VITE_FEATURE_MARKETING_CHANGELOG_SUBSCRIBE',
			false,
		),
		// Topbar language switcher — default OFF until additional locales
		// ship for the marketing surface. Flipping this back on re-shows
		// the flag-icon popover in the marketing topbar.
		languageSwitcher: readFlag(
			'VITE_FEATURE_MARKETING_LANGUAGE_SWITCHER',
			false,
		),
		integrations: readFlag('VITE_FEATURE_MARKETING_INTEGRATIONS', true),
		help: readFlag('VITE_FEATURE_MARKETING_HELP', true),
		community: readFlag('VITE_FEATURE_MARKETING_COMMUNITY', true),
		// Customer-story template (slice 4 of #372). Default OFF until a real
		// customer signs off on shipping their story; the placeholder Lumen
		// Studio page is template-shaped, not launch-ready content.
		customerStories: readFlag('VITE_FEATURE_MARKETING_CUSTOMER_STORIES', false),
	},
	staff: {
		tenants: {
			details: {
				billing: readFlag('VITE_FEATURE_STAFF_TENANT_BILLING', false),
				activity: readFlag('VITE_FEATURE_STAFF_TENANT_ACTIVITY', false),
				usage: readFlag('VITE_FEATURE_STAFF_TENANT_USAGE', false),
			},
		},
	},
	tenant: {
		settings: {
			members: readFlag('VITE_FEATURE_TENANT_SETTINGS_MEMBERS', false),
			roles: readFlag('VITE_FEATURE_TENANT_SETTINGS_ROLES', false),
			workspaces: readFlag('VITE_FEATURE_TENANT_SETTINGS_WORKSPACES', false),
			integrations: readFlag(
				'VITE_FEATURE_TENANT_SETTINGS_INTEGRATIONS',
				false,
			),
			billing: readFlag('VITE_FEATURE_TENANT_SETTINGS_BILLING', false),
			security: readFlag('VITE_FEATURE_TENANT_SETTINGS_SECURITY', false),
		},
	},
});
