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
 * Static feature-flag registry (front) — old-front equivalent was `apps/old-front/src/lib/features/flags.ts` (see `docs/records/2026-08-22-review-old-front-marketing-screens.md` for the retired flag set at retirement). Read at module load, so `import.meta.env` inlines
 * each value at BUILD time: flipping a flag means rebuilding and redeploying
 * the image, not changing a running container's environment. A flag also needs
 * an ARG/ENV pair in apps/front/Dockerfile to be settable at image-build time
 * at all — the marketing flags deliberately have none, so they are false in
 * every released image and cannot be turned on without a Dockerfile change.
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
