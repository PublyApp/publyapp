/**
 * The single source of truth tying the drawer-description contrast guards
 * together (#1043 / PR #1061, round 5 I4).
 *
 * The source guard (drawer-description-contrast.test.ts) enumerates every
 * `<DrawerDescription>` call site from disk and verifies each one's effective
 * colour against the 4.5:1 floor; the browser spec
 * (e2e/drawer-description-contrast.spec.ts) opens each drawer live and
 * measures it with `getComputedStyle`. Before this inventory existed the two
 * lists were hardcoded independently, so a drawer added after the PR got
 * source coverage automatically and browser coverage never — and the browser
 * spec was the only guard able to see a colour override on a *child* of the
 * description, a spread-supplied className, or a viewport-conditional rule.
 *
 * A new drawer consumer must be added here (file + testId) and nowhere else:
 * the source guard asserts the enumerated real call sites exactly match this
 * list, and the browser spec drives its drawer cases from it, so a drawer
 * missing from this list fails one guard loudly, and an entry without a live
 * browser case fails the other.
 */

export type DrawerDescriptionConsumer = {
	/** Repository path of the file containing the `<DrawerDescription>`, as
	 * seen from `apps/front`. */
	file: string;
	/** `data-testid` of the drawer/dialog that hosts the description, used by
	 * the browser spec to open it. */
	testId: string;
};

/**
 * Every `*-description` primitive whose text must stay legible on the three
 * surfaces drawer-style description lines actually sit on (#1043). The list
 * is the source of truth for the source guard's surface sweep (round 7 M5):
 * the browser spec asserts that every selector here has a live measurement
 * case, so a fourth description class cannot gain source coverage and never
 * browser coverage — the round-5 I4 defect, one list over.
 */
export const DESCRIPTION_SELECTORS = [
	'.publy-drawer-description',
	'.publy-field-switch-description',
	'.publy-danger-zone-row-description',
] as const;

/**
 * `*-description`/`*-subtitle` classes that are deliberately NOT swept by the
 * drawer/description contrast source guard, because a DIFFERENT, dedicated
 * browser guard already covers them with a live, source-independent pixel
 * measurement. Each entry MUST carry a verified reason — an exclusion without
 * a verified reason is a blocking defect (issue #1086 round 1).
 *
 * The discovery guard (drawer-description-contrast.test.ts) reads the real
 * `app.css`, enumerates every `*-description`/`*-subtitle` class it declares,
 * and fails loud (naming the offending class) unless every such class is in
 * `DESCRIPTION_SELECTORS` or on this allowlist. So a class added here WITHOUT a
 * verified reason stays unguarded AND reds the discovery test — the exclusion
 * is not a way to silence the guard.
 */
export const EXCLUDED_DESCRIPTION_SELECTORS = [
	// Measured live by `e2e/toast-contrast.spec.ts`
	// (TEXT_TARGETS -> `toast.locator('.publy-toast-description')`,
	// apps/front/e2e/toast-contrast.spec.ts). That spec reads the rendered Sonner
	// toast glyph pixels after Chromium has resolved the cascade — Sonner's
	// un-layered stylesheet can beat app.css's layered rules, so a source parser
	// cannot model what the toast actually paints. The drawer/description source
	// guard therefore defers this class to that dedicated browser spec rather
	// than duplicating it (verified by reading the spec, not assumed).
	'.publy-toast-description',
] as const;

export const DRAWER_DESCRIPTION_CONSUMERS = [
	{
		file: 'src/components/marketing/cookie-prefs-drawer.tsx',
		testId: 'cookie-prefs-drawer',
	},
	{
		file: 'src/routes/authed/staff/staff-users/_change-email-dialog.tsx',
		testId: 'change-staff-user-email-dialog',
	},
	{
		file: 'src/routes/authed/staff/tenants/$tenantId/_invite-user-drawer.tsx',
		testId: 'invite-tenant-user-drawer',
	},
	{
		file: 'src/routes/authed/staff/tenants/$tenantId/profiles/$profileId/_assign-members-drawer.tsx',
		testId: 'assign-members-drawer',
	},
	{
		file: 'src/routes/authed/staff/tenants/$tenantId/profiles/_profile-form-drawer.tsx',
		testId: 'profile-form-drawer',
	},
	{
		file: 'src/routes/authed/staff/tenants/$tenantId/profiles/_profile-edit-details-drawer.tsx',
		testId: 'profile-edit-details-drawer',
	},
	{
		file: 'src/routes/authed/staff/profiles/$profileId/_profile-edit-details-drawer.tsx',
		testId: 'staff-profile-edit-details-drawer',
	},
	{
		file: 'src/routes/authed/staff/audit-logs/_audit-log-export-drawer.tsx',
		testId: 'audit-log-export-drawer',
	},
	{
		file: 'src/routes/authed/staff/tenant-users/$userId-organizations-drawer.tsx',
		testId: 'link-companies-drawer',
	},
	{
		file: 'src/routes/authed/staff/jobs/queue.tsx',
		testId: 'staff-jobs-queue-drawer',
	},
	{
		file: 'src/routes/authed/staff/jobs/dead-letter.tsx',
		testId: 'staff-jobs-dead-letter-drawer',
	},
] as const satisfies readonly DrawerDescriptionConsumer[];
