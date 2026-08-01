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
 * Static feature-flag registry (front equivalent of apps/old-front's
 * lib/features/flags.ts). Read at module load; flip via VITE_FEATURE_* env
 * vars without a redeploy of source.
 */
export const FEATURES = {
	auth: {
		signupsEnabled: readFlag('VITE_FEATURE_SIGNUPS_ENABLED', false),
	},
	dev: {
		/** Zod/RHF scaffolding demo at /field-validation — dev-only, never a
		 * publicly reachable production route (r3-shell-F14). */
		fieldValidationDemoEnabled: readFlag(
			'VITE_FEATURE_FIELD_VALIDATION_DEMO_ENABLED',
			false,
		),
	},
	marketing: {
		/** Invented customer names stay hidden until real customer proof exists. */
		customerLogos: readFlag('VITE_FEATURE_MARKETING_CUSTOMER_LOGOS', false),
		/** The rating and setup claim stay hidden until user evidence exists. */
		socialProof: readFlag('VITE_FEATURE_MARKETING_SOCIAL_PROOF', false),
	},
} as const;
