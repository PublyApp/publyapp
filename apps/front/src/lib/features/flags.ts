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
		about: readFlag('VITE_FEATURE_MARKETING_ABOUT', false),
		contact: readFlag('VITE_FEATURE_MARKETING_CONTACT', false),
		security: readFlag('VITE_FEATURE_MARKETING_SECURITY', false),
		// Path segments only — pages not built yet, footer links 404 to
		// MarketingNotFoundPage when enabled
		blog: readFlag('VITE_FEATURE_MARKETING_BLOG', false),
		changelog: readFlag('VITE_FEATURE_MARKETING_CHANGELOG', false),
		integrations: readFlag('VITE_FEATURE_MARKETING_INTEGRATIONS', false),
		help: readFlag('VITE_FEATURE_MARKETING_HELP', false),
		community: readFlag('VITE_FEATURE_MARKETING_COMMUNITY', false),
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
});
