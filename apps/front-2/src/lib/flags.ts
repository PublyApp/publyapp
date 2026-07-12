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

/**
 * Static feature-flag registry (front-2 equivalent of apps/front's
 * lib/features/flags.ts). Read at module load; flip via VITE_FEATURE_* env
 * vars without a redeploy of source.
 */
export const FEATURES = {
	auth: {
		signupsEnabled: readFlag('VITE_FEATURE_SIGNUPS_ENABLED', false),
	},
} as const;
