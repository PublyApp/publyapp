/**
 * The `smoke` lane: the twelve specs every pull request runs.
 *
 * Why a FILE LIST and not a `--grep` over tags (audit
 * `the e2e suite audit (#2260)`, F5): six tests in this
 * suite sit outside any `test.describe` (`auth-screens.spec.ts`'s five
 * auth-layout tests, `tab-sync.spec.ts`'s cross-tab theme test). The tag guard
 * only inspects describes, so those tests carry no domain tag at all and a
 * `--grep @auth` split would drop them from both lanes without anyone
 * noticing. A list of files has no such blind spot: a spec is either named
 * here or it is not, and the `full` lane is defined as its complement.
 *
 * Why these twelve (the audit's "Proposed CI shape"):
 * - `smoke` is the literal "the stack serves the front" probe.
 * - `i18n`, `i18n-namespaces`, `seo`, `csp` are the guide's named
 *   public/i18n exception plus the two server-header contracts no component
 *   test can observe.
 * - `auth-screens`, `auth-redirect-guard`, `logout` cover the auth surface,
 *   the auth-state redirect and the logout lifecycle.
 * - `cold-boot-stability` reads the raw SSR body, so it reds if the server
 *   stops shipping the neutral chrome even when every DOM test stays green.
 * - `staff-user-details` proves a nested tab route survives a hard load.
 * - `staff-profile-edit-flow` is the only real write→reload seam in the staff
 *   area (a PATCH through the real API, read back by a fresh document).
 * - `tenant-post-image` is the real upload seam, deliberately in smoke: the
 *   only CI failures in the audit's 40-run sample were upload paths broken by
 *   a dependency bump, and a smoke lane that cannot see the upload path would
 *   have missed the one real regression the suite caught.
 *
 * `ssr-auth-shell` (29 matrix cases, ~88 s) is the most valuable KEEP spec and
 * deliberately NOT here: it is most of the three-minute budget. It is the first
 * spec to add if the budget grows.
 *
 * Patterns are matched by Playwright against the absolute path, like every
 * other `testMatch`/`testIgnore` entry in `playwright.config.ts`.
 */
export const SMOKE_SPEC_PATTERNS = [
	'**/smoke.spec.ts',
	'**/i18n.spec.ts',
	'**/i18n-namespaces.spec.ts',
	'**/seo.spec.ts',
	'**/csp.spec.ts',
	'**/auth-screens.spec.ts',
	'**/auth-redirect-guard.spec.ts',
	'**/logout.spec.ts',
	'**/cold-boot-stability.spec.ts',
	'**/staff-user-details.spec.ts',
	'**/staff-profile-edit-flow.spec.ts',
	'**/tenant-post-image.spec.ts',
] as const;
