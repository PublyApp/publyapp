/**
 * i18n key maps for the accept-invitation route's brand header and
 * wrong-account mismatch views. Kept out of the route file so the route
 * stays a single-component file (see the `no-multi-component-file`
 * React Doctor rule); the route owns the `BranchKind` union these keys
 * are indexed by.
 */

/** Copy shown in the auth brand header per accept-invitation branch. */
export type AcceptInvitationBrandKeyMap = {
	headline: string;
	subtitle: string;
};

export const ACCEPT_INVITATION_BRAND_I18N_KEYS: Record<
	string,
	AcceptInvitationBrandKeyMap | undefined
> = {
	'new-user': {
		headline: 'accept-invitation-brand-headline-new-user',
		subtitle: 'accept-invitation-brand-subtitle-new-user',
	},
	'existing-match': {
		headline: 'accept-invitation-brand-headline-existing-match',
		subtitle: 'accept-invitation-brand-subtitle-existing-match',
	},
	'existing-signed-out': {
		headline: 'accept-invitation-brand-headline-existing-signed-out',
		subtitle: 'accept-invitation-brand-subtitle-existing-signed-out',
	},
	mismatch: {
		headline: 'accept-invitation-brand-headline-mismatch',
		subtitle: 'accept-invitation-brand-subtitle-mismatch',
	},
};

/** Wrong-account view copy per signed-in user state. */
export const ACCEPT_INVITATION_MISMATCH_I18N_KEYS = {
	existing: {
		description: 'auth-invitation-existing-user-mismatch-description',
		cta: 'auth-invitation-log-out-and-sign-in',
	},
	newUser: {
		description: 'auth-invitation-new-user-mismatch-description',
		cta: 'auth-invitation-log-out-and-continue',
	},
} as const;
