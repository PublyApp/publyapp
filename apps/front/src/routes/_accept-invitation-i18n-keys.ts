/**
 * i18n key maps for the accept-invitation route's brand header and
 * wrong-account mismatch views. Kept out of the route file so the route
 * stays a single-component file (see the `no-multi-component-file`
 * React Doctor rule); the route owns the `BranchKind` union these keys
 * are indexed by.
 */

/** Copy shown in the auth brand header per accept-invitation branch.
 *
 * Values are namespace-qualified (`auth:`): this module declares no
 * `useTranslation()` default of its own, so the i18n-key coverage guard
 * cannot infer a namespace here, and every consumer renders these
 * through `useTranslation(['auth', 'common'])`. */
export type AcceptInvitationBrandKeyMap = {
	headline: string;
	subtitle: string;
};

export const ACCEPT_INVITATION_BRAND_I18N_KEYS = {
	'new-user': {
		headline: 'auth:accept-invitation-brand-headline-new-user',
		subtitle: 'auth:accept-invitation-brand-subtitle-new-user',
	},
	'existing-match': {
		headline: 'auth:accept-invitation-brand-headline-existing-match',
		subtitle: 'auth:accept-invitation-brand-subtitle-existing-match',
	},
	'existing-signed-out': {
		headline: 'auth:accept-invitation-brand-headline-existing-signed-out',
		subtitle: 'auth:accept-invitation-brand-subtitle-existing-signed-out',
	},
	mismatch: {
		headline: 'auth:accept-invitation-brand-headline-mismatch',
		subtitle: 'auth:accept-invitation-brand-subtitle-mismatch',
	},
};

/** Wrong-account view copy per signed-in user state. The CTA goes through
 * `t()` (which accepts the `auth:` prefix); the description is NOT kept here
 * because its renderer is a `<Trans>` whose static typing demands an
 * UNqualified literal key paired with `ns="auth"`. */
export const ACCEPT_INVITATION_MISMATCH_I18N_KEYS = {
	existing: {
		cta: 'auth:auth-invitation-log-out-and-sign-in',
	},
	newUser: {
		cta: 'auth:auth-invitation-log-out-and-continue',
	},
} as const;
