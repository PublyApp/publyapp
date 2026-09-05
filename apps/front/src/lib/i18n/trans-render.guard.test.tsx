/**
 * Real-`<Trans>` render guard over the REAL route files (#1285, follow-up to
 * #1269/#1281).
 *
 * #1281 mounted its own `<Trans>` instances behind a `makeRealI18n` mirror of
 * the production init — so deleting the `components={{ strong: … }}` map in a
 * route left the guard green, and production init drift stayed invisible.
 * This version mounts the REAL exported route components (reset-password,
 * accept-invitation, verify-email — the same objects `Route.component`
 * serves in production) and initialises i18n ONLY through the REAL
 * `createI18nFromResources` from `~/lib/i18n.shared` with the REAL EN and FR
 * resource bundles the app ships. Nothing here re-states production init.
 *
 * Mocked at the seam only, never react-i18next: TanStack Router/Start
 * (`useLoaderData`, `useServerFn`), the server actions, and the auth/query
 * hooks. (The per-route component tests mock react-i18next itself — 85 of
 * 213 front test files do — which is exactly the suite-wide blindness this
 * guard offsets.)
 *
 * The guarded set is AUTO-DISCOVERED (#1312 round 1): every JSX `<Trans>`
 * element under `apps/front/src` must resolve to a CALL_SITES entry, so a new
 * call site anywhere — including a brand-new route file — turns this guard
 * red until a spec renders it through its real route component. Deliberately
 * excluded from the scan: `*.test.{ts,tsx}` / `*.spec.{ts,tsx}` (the suite
 * itself, including this file's own direct-mode `<Trans>` mounts), `*.d.ts`
 * (ambient declarations never render), and the e2e/ directory (browser specs,
 * not app source). A parse failure anywhere scanned throws instead of walking
 * a recovered partial tree.
 *
 * The spread-only shape is NOT a blind spot (#1333): a `<Trans {...props} />`
 * carries no static `i18nKey`/`ns` identity to pin, but discovery matches the
 * TAG first and reads attributes second, so the site is still collected with
 * `i18nKey: null` — it lands in the unpinned list and turns this guard red
 * naming `file:line`, exactly like any other uncovered call site. Both halves
 * are pinned by standing scratch-route tests below. The true residual blind
 * spot is narrower (#1333): a `<Trans>` reached through a LOCAL re-export
 * (`export { Trans } from 'react-i18next'` in a shared module) is not
 * resolved — the importing file carries no literal `react-i18next` for the
 * pre-filter and no react-i18next import declaration binds its local name.
 * That shape does not exist in src today; the boundary test below pins it so
 * any change here must update the disclosure deliberately.
 *
 * Aliased bindings ARE covered (#1312 round 2, closing the round-1 MEDIUM
 * follow-up): an aliased default/named import (`Trans as T`) is resolved to
 * its local name before matching JSX tags, and a namespace import
 * (`import * as i18n from 'react-i18next'`) covers `<i18n.Trans>` member-tag
 * elements. An aliased call site with no static `i18nKey` still lands in the
 * unpinned list (its key reads null), so it turns this guard red exactly like
 * a direct one.
 *
 * Pinned per language (EN + FR) for the four production call sites (one
 * `<Trans>` in accept-invitation feeds two mismatch views, so 5 keys):
 * - rendered `<strong>` tags: count, tag name, and the production
 *   `text-foreground` className — only reachable through the route's
 *   `components` map, so dropping that map flips these red;
 * - each interpolated email inside exactly one `<strong>`;
 * - the full sentence against a verbatim pin (never recomputed from the
 *   resource files, so EN/FR copy drift flips this red).
 *
 * A second, direct-`<Trans>` mode rides only the resource's raw `<strong>`
 * markup (no `components` map), which is the path governed by
 * `transKeepBasicHtmlNodesFor` — kept because html-parse-stringify sits
 * underneath it and the i18next 26 bump swapped that parser.
 *
 * Paired proof (2026-08-23, both flips observed locally against this exact
 * file, then reverted):
 * - Removing the `components={{ strong: … }}` map from BOTH `<Trans>` sites
 *   in `apps/front/src/routes/_reset-password-forms.tsx` turns this guard
 *   red: all four reset-password call-site tests fail on the className pin
 *   (`text-foreground` vs the class-less `<strong>` the resource markup
 *   produces) while every other route's assertions stay green. The two
 *   mismatch `<Trans>`s moved into `routes/_accept-invitation-views.tsx` in
 *   an upstream refactor; their map is pinned by the same source scan.
 * - Emptying the keep-list on the instance returned by the real helper
 *   (`instance.options.react.transKeepBasicHtmlNodesFor = []`, the only
 *   knob `createI18nFromResources` does not take) turns every bare-resource
 *   assertion red (`the resource's <strong> must survive parsing`) while the
 *   call-site assertions stay green — with a `components` map the tag is a
 *   known component name, so the keep-list plays no role on that path.
 */
/**
 * @vitest-environment jsdom
 */
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import type { i18n as I18nInstance } from 'i18next';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { I18nextProvider, initReactI18next, Trans } from 'react-i18next';
import { ts } from 'ts-morph';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import resourceEN from '../../i18n/locales/en';
import resourceFR from '../../i18n/locales/fr';
import { Route as AcceptInvitationRoute } from '../../routes/accept-invitation';
import { Route as ResetPasswordRoute } from '../../routes/reset-password';
import { Route as VerifyEmailRoute } from '../../routes/verify-email';
import { AuthBrandProvider } from '../auth-brand-context';
import {
	createI18nFromResources,
	type I18nResources,
	type SupportedLanguage,
} from '../i18n.shared';

type ResetPasswordLoaderData =
	| { view: 'invalid' }
	| { view: 'unavailable' }
	| { view: 'request' }
	| {
			view: 'set-new';
			id: string;
			token: string;
			email: string;
			fromEmailVerification: boolean;
	  };

type VerifyEmailLoaderData =
	| { view: 'invalid' }
	| { view: 'unavailable' }
	| { view: 'sent'; email: string }
	| { view: 'request' };

/**
 * Mirrors the route file's own loader contract (the #1287-era refactor kept
 * the loader there and moved the view branches to
 * `routes/_accept-invitation-views.tsx`).
 */
type InvitationLoaderData =
	| { view: 'invalid' }
	| { view: 'unavailable' }
	| {
			view: 'valid';
			token: string;
			email: string;
			profileName: string;
			userExists: boolean;
	  };

const mocks = vi.hoisted(() => ({
	resetPasswordLoaderData: { view: 'request' } as ResetPasswordLoaderData,
	verifyEmailLoaderData: { view: 'request' } as VerifyEmailLoaderData,
	invitationLoaderData: { view: 'invalid' } as InvitationLoaderData,
	navigate: vi.fn(),
	redirect: vi.fn((opts: Record<string, unknown>) => ({
		isRedirect: true,
		...opts,
	})),
	checkResetPasswordToken: vi.fn(),
	requestEmailVerification: vi.fn(),
	requestPasswordReset: vi.fn(),
	resetPassword: vi.fn(),
	checkEmailVerificationToken: vi.fn(),
	loadInvitationInfo: vi.fn(),
	acceptInvitation: vi.fn(),
	completeLoginRedirect: vi.fn(),
	postBroadcast: vi.fn(),
	hasBrowserSessionCookie: vi.fn(),
	logout: vi.fn(),
	isLoggingOut: false,
	isHydrated: false,
	currentUserQuery: {
		isSuccess: false,
		isError: false,
		data: undefined as { email?: string } | undefined,
	},
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
	}),
	useLoaderData: ({ from }: { from?: string } = {}) => {
		if (from === '/accept-invitation') {
			return mocks.invitationLoaderData;
		}
		if (from === '/verify-email') {
			return mocks.verifyEmailLoaderData;
		}
		return mocks.resetPasswordLoaderData;
	},
	useLocation: () => ({
		pathname: '/accept-invitation',
		searchStr: '?id=enc-guard&token=tok-guard',
	}),
	useNavigate: () => mocks.navigate,
	redirect: mocks.redirect,
	Link: ({
		children,
		to,
		search,
		...props
	}: {
		children: ReactNode;
		to: string;
		search?: Record<string, string>;
	}) => {
		const query = search ? `?${new URLSearchParams(search).toString()}` : '';
		return createElement('a', { href: `${to}${query}`, ...props }, children);
	},
}));

vi.mock('@tanstack/react-start', () => ({
	useServerFn: (fn: unknown) => fn,
}));

// Real hook starts false and flips in an effect; the fake flips when the
// guard asks, so the invitation route's post-hydration branches resolve
// synchronously once effects flush.
vi.mock('~/lib/hooks/use-hydrated', () => ({
	useHydrated: () => mocks.isHydrated,
}));

vi.mock('~/lib/server/auth-actions', () => ({
	checkResetPasswordToken: mocks.checkResetPasswordToken,
	checkEmailVerificationToken: mocks.checkEmailVerificationToken,
	requestEmailVerification: mocks.requestEmailVerification,
	requestPasswordReset: mocks.requestPasswordReset,
	resetPassword: mocks.resetPassword,
}));

vi.mock('~/lib/server/invitation-actions', () => ({
	loadInvitationInfo: mocks.loadInvitationInfo,
	acceptInvitation: mocks.acceptInvitation,
}));

vi.mock('~/lib/server/session-actions', () => ({
	completeLoginRedirect: mocks.completeLoginRedirect,
}));

vi.mock('~/lib/tab-sync/broadcast-sync', () => ({
	AUTH_SYNC_CHANNEL: 'publyapp:auth-sync',
	postBroadcast: mocks.postBroadcast,
}));

vi.mock('~/lib/auth-route-guard', () => ({
	redirectAuthenticatedUserAwayFromAuthPage: vi.fn(),
	hasBrowserSessionCookie: mocks.hasBrowserSessionCookie,
}));

vi.mock('~/lib/hooks/use-logout', () => ({
	useLogout: () => ({
		logout: mocks.logout,
		isLoggingOut: mocks.isLoggingOut,
	}),
}));

vi.mock('~/lib/query/auth', () => ({
	useCurrentUserQuery: () => ({
		isFetching: false,
		refetch: vi.fn(),
		...mocks.currentUserQuery,
	}),
}));

/**
 * The REAL production init helper, fed the REAL shipped bundles. This file
 * must never grow its own i18n init call — the dedicated test below scans
 * this very source to keep it that way (#1285: the old mirror hid init
 * drift).
 */
const RESOURCES: I18nResources = {
	en: { auth: resourceEN.auth, common: resourceEN.common },
	fr: { auth: resourceFR.auth, common: resourceFR.common },
};

const makeAppI18n = (language: SupportedLanguage): I18nInstance =>
	createI18nFromResources(language, ['auth', 'common'], RESOURCES);

// react-i18next types i18nKey against the known translation-key union.
type AuthTranslationKey = Extract<keyof typeof resourceEN.auth, string>;

const RESET_REQUEST_EMAIL = 'ada@example.com';
const SET_NEW_EMAIL = 'grace@example.com';
const INVITED_EMAIL = 'invited@example.com';
const CURRENT_USER_EMAIL = 'other@example.com';
const VERIFY_REQUEST_EMAIL = 'mara@example.com';
const VERIFY_SENT_EMAIL = 'linus@example.com';

/**
 * The hand-maintained half of the guard: one spec per production `<Trans>`
 * call site, each carrying the route-mount state plus the verbatim EN/FR
 * sentence pins. Discovery (above) supplies the OTHER half — the exhaustive
 * list of sites in src — and the discovery test below fails while the two
 * halves disagree, so a new call site cannot ship uncovered.
 *
 * `en`/`fr` pin the exact rendered text per language: resource markup
 * stripped, values interpolated. Update them deliberately when copy changes.
 */
type CallSiteSpec = {
	site: string;
	/** The file discovery reports this site in; must match its real location. */
	file:
		| 'routes/_reset-password-forms.tsx'
		| 'routes/_accept-invitation-views.tsx'
		| 'routes/verify-email.tsx';
	route: 'reset-password' | 'accept-invitation' | 'verify-email';
	loaderData:
		| ResetPasswordLoaderData
		| VerifyEmailLoaderData
		| InvitationLoaderData;
	flow?: 'submit-reset-request' | 'submit-verify-email-request';
	scopeTestId?: string;
	key: AuthTranslationKey;
	/** The `ns` attribute on the real `<Trans>` element (all pinned sites use "auth"). */
	ns: 'auth';
	values: Record<string, string>;
	en: string;
	fr: string;
};

const CALL_SITES: CallSiteSpec[] = [
	{
		site: 'routes/_reset-password-forms.tsx (request form -> sent confirmation)',
		file: 'routes/_reset-password-forms.tsx',
		route: 'reset-password',
		loaderData: { view: 'request' },
		flow: 'submit-reset-request',
		scopeTestId: 'reset-password-request-sent',
		key: 'reset-link-sent-description',
		ns: 'auth',
		values: { email: RESET_REQUEST_EMAIL },
		en: "ada@example.com is valid, you'll receive an email with a link to reset your password.",
		fr: 'Si ada@example.com est valide, vous recevrez un email avec un lien pour réinitialiser votre mot de passe.',
	},
	{
		site: 'routes/_reset-password-forms.tsx (set-new-password form)',
		file: 'routes/_reset-password-forms.tsx',
		route: 'reset-password',
		loaderData: {
			view: 'set-new',
			id: 'enc-guard',
			token: 'tok-guard',
			email: SET_NEW_EMAIL,
			fromEmailVerification: false,
		},
		key: 'reset-password-description',
		ns: 'auth',
		values: { email: SET_NEW_EMAIL },
		en: 'Enter your new password for grace@example.com',
		fr: 'Entrez votre nouveau mot de passe pour grace@example.com',
	},
	{
		site: 'routes/accept-invitation (existing-user mismatch view, via the real route component)',
		file: 'routes/_accept-invitation-views.tsx',
		route: 'accept-invitation',
		loaderData: {
			view: 'valid',
			token: 'tok-guard',
			email: INVITED_EMAIL,
			profileName: 'Editor',
			userExists: true,
		},
		key: 'auth-invitation-existing-user-mismatch-description',
		ns: 'auth',
		values: {
			invitationEmail: INVITED_EMAIL,
			currentUserEmail: CURRENT_USER_EMAIL,
		},
		en: 'This invitation belongs to invited@example.com. You are currently signed in as other@example.com. Log out, then sign in as the invited user to continue.',
		fr: "Cette invitation appartient à invited@example.com. Vous êtes actuellement connecté en tant que other@example.com. Déconnectez-vous, puis connectez-vous avec l'utilisateur invité pour continuer.",
	},
	{
		site: 'routes/accept-invitation (new-user mismatch view, via the real route component)',
		file: 'routes/_accept-invitation-views.tsx',
		route: 'accept-invitation',
		loaderData: {
			view: 'valid',
			token: 'tok-guard',
			email: INVITED_EMAIL,
			profileName: 'Editor',
			userExists: false,
		},
		key: 'auth-invitation-new-user-mismatch-description',
		ns: 'auth',
		values: {
			invitationEmail: INVITED_EMAIL,
			currentUserEmail: CURRENT_USER_EMAIL,
		},
		en: 'This invitation is for invited@example.com, but you are signed in as other@example.com. Log out to continue creating the invited account.',
		fr: 'Cette invitation est destinée à invited@example.com, mais vous êtes actuellement connecté en tant que other@example.com. Déconnectez-vous pour continuer la création du compte invité.',
	},
	{
		site: 'routes/verify-email.tsx (request form -> sent confirmation)',
		file: 'routes/verify-email.tsx',
		route: 'verify-email',
		loaderData: { view: 'request' },
		flow: 'submit-verify-email-request',
		scopeTestId: 'verify-email-sent',
		key: 'verify-email-sent-description',
		ns: 'auth',
		values: { email: VERIFY_REQUEST_EMAIL },
		en: "mara@example.com is valid, you'll receive an email with a link to verify your account.",
		fr: 'Si mara@example.com est valide, vous recevrez un email avec un lien pour vérifier votre compte.',
	},
	{
		site: 'routes/verify-email.tsx (verification email sent)',
		file: 'routes/verify-email.tsx',
		route: 'verify-email',
		loaderData: { view: 'sent', email: VERIFY_SENT_EMAIL },
		scopeTestId: 'verify-email-sent',
		key: 'verify-email-sent-description',
		ns: 'auth',
		values: { email: VERIFY_SENT_EMAIL },
		en: "linus@example.com is valid, you'll receive an email with a link to verify your account.",
		fr: 'Si linus@example.com est valide, vous recevrez un email avec un lien pour vérifier votre compte.',
	},
];

/**
 * `RouteOptions.component` is typed `unknown` upstream, so each real route
 * object is narrowed once at this boundary instead of being asserted
 * through: the components this guard mounts are plain function components.
 */
type RouteComponent = () => ReactElement;

const isRouteComponent = (value: unknown): value is RouteComponent =>
	typeof value === 'function';

const routeComponentThunk = (route: {
	options: { component?: unknown };
}): (() => RouteComponent) => {
	const { component } = route.options;
	if (!isRouteComponent(component)) {
		throw new Error('guarded route carries no function component');
	}

	return (): RouteComponent => component;
};

const ROUTE_COMPONENTS = {
	'reset-password': routeComponentThunk(ResetPasswordRoute),
	'accept-invitation': routeComponentThunk(AcceptInvitationRoute),
	'verify-email': routeComponentThunk(VerifyEmailRoute),
} satisfies Record<CallSiteSpec['route'], () => () => ReactElement>;

const setRouteLoader = (
	route: CallSiteSpec['route'],
	loaderData: CallSiteSpec['loaderData'],
): void => {
	if (route === 'reset-password') {
		mocks.resetPasswordLoaderData = loaderData as ResetPasswordLoaderData;
	} else if (route === 'verify-email') {
		mocks.verifyEmailLoaderData = loaderData as VerifyEmailLoaderData;
	} else {
		mocks.invitationLoaderData = loaderData as InvitationLoaderData;
	}
};

const renderThroughRealI18n = (
	ui: ReactElement,
	language: SupportedLanguage,
) => {
	const instance = makeAppI18n(language);
	const { container } = render(
		<I18nextProvider i18n={instance}>
			{/* No brand override under test: the context setter degrades to a no-op
			outside its provider, and its type still demands a value. */}
			<AuthBrandProvider value={undefined}>{ui}</AuthBrandProvider>
		</I18nextProvider>,
	);
	return { container, instance };
};

/**
 * Mounts one real route component in the state that shows the given
 * `<Trans>` call site, through the real init helper.
 */
const renderCallSite = async (
	spec: CallSiteSpec,
	language: SupportedLanguage,
): Promise<{ container: HTMLElement; instance: I18nInstance }> => {
	setRouteLoader(spec.route, { ...spec.loaderData });
	const Component = ROUTE_COMPONENTS[spec.route]();
	const rendered = renderThroughRealI18n(createElement(Component), language);

	if (spec.flow === 'submit-reset-request') {
		const emailInput = rendered.container.querySelector<HTMLInputElement>(
			'#reset-password-email',
		);
		if (emailInput === null) {
			throw new Error('request form email input');
		}
		fireEvent.change(emailInput, {
			target: { value: RESET_REQUEST_EMAIL },
		});
		const form = rendered.container.querySelector(
			'[data-testid="reset-password-request-form"]',
		);
		if (form === null) {
			throw new Error('request form');
		}
		fireEvent.submit(form);

		await waitFor(() =>
			expect(
				rendered.container.querySelector(`[data-testid="${spec.scopeTestId}"]`),
			).toBeTruthy(),
		);
	} else if (spec.flow === 'submit-verify-email-request') {
		const emailInput = rendered.container.querySelector<HTMLInputElement>(
			'#verify-email-email',
		);
		if (emailInput === null) {
			throw new Error('verify-email request form email input');
		}
		fireEvent.change(emailInput, {
			target: { value: VERIFY_REQUEST_EMAIL },
		});
		const form = rendered.container.querySelector(
			'[data-testid="verify-email-request-form"]',
		);
		if (form === null) {
			throw new Error('verify-email request form');
		}
		fireEvent.submit(form);

		await waitFor(() =>
			expect(
				rendered.container.querySelector(`[data-testid="${spec.scopeTestId}"]`),
			).toBeTruthy(),
		);
	}

	return rendered;
};

const countOccurrences = (haystack: string, needle: string): number =>
	haystack.split(needle).length - 1;

/**
 * The standing discovery assertion, shared verbatim by the guard test below
 * and the scratch-route proof cases (#1312 rounds 1–2, #1333): groups the
 * given sites by file, consumes the CALL_SITES matches, and returns the
 * surviving `file:line` entries — the exact list that must stay empty in
 * production and that a planted uncovered site must appear in.
 */
const standingUnpinnedEntries = (sites: DiscoveredTransSite[]): string[] => {
	const discoveredByFile = new Map<string, DiscoveredTransSite[]>();
	for (const discoveredSite of sites) {
		discoveredByFile.set(discoveredSite.file, [
			...(discoveredByFile.get(discoveredSite.file) ?? []),
			discoveredSite,
		]);
	}

	for (const spec of CALL_SITES) {
		const sitesInFile = discoveredByFile.get(spec.file);
		expect(sitesInFile, `no discovered site in ${spec.file}`).toBeDefined();
		if (!sitesInFile) {
			continue;
		}

		const remaining = [...sitesInFile];
		// A single spec may cover several identical-key sites
		// (accept-invitation's two mismatch views share one key), so each
		// spec consumes at most one match from its file's list.
		const matchedIndex = remaining.findIndex(
			(discoveredSite) =>
				discoveredSite.i18nKey === spec.key &&
				discoveredSite.namespace === spec.ns,
		);
		expect(
			matchedIndex,
			`no discovered <Trans> with key ${spec.key} in ${spec.file}`,
		).toBeGreaterThanOrEqual(0);
		if (matchedIndex >= 0) {
			remaining.splice(matchedIndex, 1);
		}
		discoveredByFile.set(spec.file, remaining);
	}

	return [...discoveredByFile.entries()]
		.flatMap(([file, remainingSites]) =>
			remainingSites.map((discoveredSite) => `${file}:${discoveredSite.line}`),
		)
		.sort();
};

// ---------------------------------------------------------------------------
// AUTO-DISCOVERY of every JSX `<Trans>` call site under apps/front/src
// (#1312 round 1). The CALL_SITES table below stays hand-maintained because
// each entry needs a route-mount state plus verbatim EN/FR sentence pins;
// this AST walk is what keeps the two in lock-step: a `<Trans>` added
// ANYWHERE in src turns the discovery test below red until a spec covers it.
//
// Deliberately excluded from the scan:
// - `*.test.ts` / `*.test.tsx` / anything `.spec.` / `*.stories.tsx` — the
//   suite itself, including THIS file's own direct-mode `<Trans>` mounts;
// - `*.d.ts` — ambient declarations never render;
// - `e2e/` trees — browser specs, not app source.
//
// Aliased react-i18next Trans bindings are DISCOVERED (#1312 round 2,
// closing the round-1 documented residual): the scanner first collects every
// local name bound to react-i18next's `Trans` — a named import
// (`import { Trans } from …` binds "Trans"), an aliased one
// (`import { Trans as T } from …` binds "T", including the default-import
// alias `react-i18next`'s CJS interop allows), and a namespace import
// (`import * as i18n from 'react-i18next'`, binding member tags like
// `<i18n.Trans>`). JSX elements whose tag resolves to any of those local
// names are collected exactly like direct `<Trans>` elements; an aliased
// site without a static `i18nKey` lands in the unpinned list with
// `i18nKey: null` and turns discovery red, same as a direct one. A file that
// only aliases `Trans` without using it produces no sites and is ignored.
//
// NOT a blind spot (#1333): a spread-only element (`<Trans {...props} />`)
// carries no static i18nKey/ns identity, but tag matching happens BEFORE
// attribute reading, so the site IS collected with `i18nKey: null` and flows
// through the standing unpinned list — red naming file:line like any other
// uncovered site (pinned by the scratch-route tests below).
//
// The true residual blind spot, deliberately narrow and pinned by test
// (#1333): a `<Trans>` whose binding arrives through a LOCAL re-export
// (`export { Trans } from 'react-i18next'` in some shared module) is not
// resolved — the importing file lacks the literal `react-i18next` pre-filter
// hit AND has no react-i18next import declaration to bind its local `Trans`
// name. That shape does not exist in src today; if it lands, binding
// resolution must grow before it ships (the boundary test below is the speed
// bump that forces the disclosure to be updated deliberately).
// ---------------------------------------------------------------------------

// vitest's import.meta.url may be a plain path rather than a file:// URL,
// depending on transform mode — normalise both shapes.
const THIS_FILE = import.meta.url.startsWith('file:')
	? fileURLToPath(import.meta.url)
	: import.meta.url;
const SRC_ROOT = path.resolve(THIS_FILE, '..', '..', '..');
const guardTempDirRequire = createRequire(import.meta.url);
const { createGuardTempDir } = guardTempDirRequire(
	'../../components/ui/drawer-guard-tmp-dir.cjs',
) as {
	createGuardTempDir: (prefix: string) => {
		dir: string;
		remove: () => void;
	};
};
const TRANS_FIXTURE_TMP_DIR = createGuardTempDir('publy-trans-guard-').dir;

const fixturePath = (relative: string): string => {
	const filePath = path.join(TRANS_FIXTURE_TMP_DIR, relative);
	mkdirSync(path.dirname(filePath), { recursive: true });
	return filePath;
};

const readSource = (relative: string): string =>
	readFileSync(path.join(SRC_ROOT, relative), 'utf8');

const isEnoent = (error: unknown): boolean =>
	error instanceof Error && 'code' in error && error.code === 'ENOENT';

type BeforeDirectoryRead = (directory: string) => void;

const readDirectoryEntries = (
	directory: string,
	allowMissing: boolean,
	beforeRead?: BeforeDirectoryRead,
) => {
	try {
		beforeRead?.(directory);
		return readdirSync(directory, { withFileTypes: true });
	} catch (error) {
		if (allowMissing && isEnoent(error)) {
			return [];
		}
		throw error;
	}
};

/**
 * Lists every source file under src and any explicitly supplied fixture root,
 * excluding the suite/spec/stories/d.ts shapes listed above.
 */
type ScannedSourcePath = {
	absolutePath: string;
	relativePath: string;
};

const listSourceFiles = (
	additionalRoots: readonly string[] = [],
	beforeDirectoryRead?: BeforeDirectoryRead,
): ScannedSourcePath[] => {
	const files: ScannedSourcePath[] = [];

	const walk = (root: string, relative: string, isRoot: boolean): void => {
		const entries = readDirectoryEntries(
			path.join(root, relative),
			!isRoot,
			beforeDirectoryRead,
		);

		for (const entry of entries) {
			const child = `${relative}${relative === '' ? '' : '/'}${entry.name}`;

			if (entry.isDirectory()) {
				if (root === SRC_ROOT && child === 'e2e') {
					continue;
				}
				walk(root, child, false);
				continue;
			}

			if (!/\.(ts|tsx)$/.test(child)) {
				continue;
			}
			if (child.endsWith('.d.ts')) {
				continue;
			}
			if (/\.test\.(ts|tsx)$/.test(child)) {
				continue;
			}
			if (/\.spec\./.test(child)) {
				continue;
			}
			if (child.endsWith('.stories.tsx')) {
				continue;
			}
			files.push({
				absolutePath: path.join(root, child),
				relativePath: child,
			});
		}
	};

	walk(SRC_ROOT, '', true);
	for (const root of additionalRoots) {
		walk(root, '', true);
	}

	return files.sort(
		(left, right) =>
			left.relativePath.localeCompare(right.relativePath) ||
			left.absolutePath.localeCompare(right.absolutePath),
	);
};

type SourceFileWithParseDiagnostics = ts.SourceFile & {
	parseDiagnostics: readonly ts.Diagnostic[];
};

/**
 * ts-morph exposes the vendored compiler's concrete SourceFile; its
 * parseDiagnostics live on the classic compiler's object and are @internal,
 * so the typed surface needs this cast (same idiom as
 * i18n-key-coverage.test.ts). A parse failure throws instead of scanning a
 * recovered partial tree.
 */
const createScannedSourceFile = (
	source: string,
	relativePath: string,
): ts.SourceFile => {
	const sourceFile = ts.createSourceFile(
		relativePath,
		source,
		ts.ScriptTarget.Latest,
		true,
		childEndsWithTsx(relativePath) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
	);
	const diagnostics = (sourceFile as SourceFileWithParseDiagnostics)
		.parseDiagnostics;

	if (diagnostics.length > 0) {
		const messages = diagnostics
			.map((diagnostic) =>
				ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
			)
			.join('; ');
		throw new Error(
			`the <Trans> discovery scan could not parse ${relativePath} — refusing to scan a partial/recovered syntax tree: ${messages}`,
		);
	}

	return sourceFile;
};

const childEndsWithTsx = (relativePath: string): boolean =>
	relativePath.endsWith('.tsx');

/** One discovered production `<Trans>` call site. */
export type DiscoveredTransSite = {
	file: string;
	line: number;
	i18nKey: string | null;
	namespace: string | null;
	/** True when the element carries `components={{ strong: <strong …/> }}` with the production className. */
	hasStrongMap: boolean;
};

/**
 * Walks every listed file's syntax tree and collects each JSX element whose
 * tag name is exactly `Trans`, with its static `i18nKey` / `ns` attributes
 * when present.
 */
type SourceReader = (filePath: string) => string;

const discoverTransCallSites = (
	options: {
		additionalRoots?: readonly string[];
		beforeDirectoryRead?: BeforeDirectoryRead;
		readSourceFile?: SourceReader;
	} = {},
): DiscoveredTransSite[] => {
	const sites: DiscoveredTransSite[] = [];
	let sawTransImport = false;
	const readSourceFile =
		options.readSourceFile ??
		((filePath: string) => readFileSync(filePath, 'utf8'));

	for (const { absolutePath, relativePath } of listSourceFiles(
		options.additionalRoots,
		options.beforeDirectoryRead,
	)) {
		let source: string;
		try {
			source = readSourceFile(absolutePath);
		} catch (error) {
			if (isEnoent(error)) {
				continue;
			}
			throw error;
		}

		if (!source.includes('react-i18next')) {
			continue;
		}

		const sourceFile = createScannedSourceFile(source, relativePath);

		// Every LOCAL name this file binds to react-i18next's `Trans`
		// (#1312 round 2): a named import binds "Trans", an aliased named
		// import (`Trans as T`) binds "T", a default import spelled/aliased
		// "Trans" binds "Trans", and a namespace import (`import * as i18n`)
		// binds qualified member tags like `<i18n.Trans>`. Matching JSX tags
		// against these LOCAL names keeps aliased call sites inside the
		// guarded set instead of documenting them as a blind spot.
		const transLocalNames = new Set<string>();
		const namespaceLocalNames = new Set<string>();

		const collectTransBindings = (node: ts.Node): void => {
			if (!ts.isImportDeclaration(node)) {
				return;
			}

			const module_ = node.moduleSpecifier;
			if (
				!ts.isStringLiteral(module_) ||
				module_.text !== 'react-i18next' ||
				node.importClause === undefined
			) {
				return;
			}

			if (
				node.importClause.name !== undefined &&
				node.importClause.name.text === 'Trans'
			) {
				// Default-import shape spelled/aliased as Trans (react-i18next's
				// CJS interop exposes the module surface as its default).
				transLocalNames.add(node.importClause.name.text);
			}

			const { namedBindings } = node.importClause;
			if (namedBindings === undefined) {
				return;
			}

			if (ts.isNamedImports(namedBindings)) {
				for (const element of namedBindings.elements) {
					// Plain `{ Trans }` has no propertyName; `{ Trans as T }` does.
					const importedName = element.propertyName ?? element.name;
					if (importedName.text === 'Trans') {
						transLocalNames.add(element.name.text);
					}
				}
			} else if (namedBindings.kind === ts.SyntaxKind.NamespaceImport) {
				namespaceLocalNames.add(namedBindings.name.text);
			}
		};

		/** Local tag text of a JSX tag name: `Trans` or `i18n.Trans`. */
		const tagNameOf = (tagName: ts.JsxTagNameExpression): string | null => {
			if (ts.isIdentifier(tagName)) {
				return tagName.text;
			}
			if (
				ts.isPropertyAccessExpression(tagName) &&
				ts.isIdentifier(tagName.expression)
			) {
				return `${tagName.expression.text}.${tagName.name.text}`;
			}
			return null;
		};

		const isTransTag = (node: ts.Node): boolean => {
			if (!ts.isJsxElement(node) && !ts.isJsxSelfClosingElement(node)) {
				return false;
			}
			const tagText = tagNameOf(
				ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName,
			);
			if (tagText === null) {
				return false;
			}
			if (transLocalNames.has(tagText)) {
				return true;
			}
			for (const alias of namespaceLocalNames) {
				if (`${alias}.Trans` === tagText) {
					return true;
				}
			}
			return false;
		};

		const visit = (node: ts.Node): void => {
			collectTransBindings(node);

			if (isTransTag(node) && ts.isJsxElement(node)) {
				sawTransImport = true;
				sites.push(
					describeSite(
						relativePath,
						sourceFile,
						node.openingElement.attributes,
					),
				);
				// Nested <Trans> inside <Trans> children would double-count the
				// outer element's own text; react-i18next does not nest them and
				// none exist in src, but keep walking anyway so a nested one is
				// still discovered as its own site.
			} else if (isTransTag(node) && ts.isJsxSelfClosingElement(node)) {
				sawTransImport = true;
				sites.push(describeSite(relativePath, sourceFile, node.attributes));
			}

			node.forEachChild(visit);
		};

		sourceFile.forEachChild(visit);
	}

	if (!sawTransImport && sites.length > 0) {
		throw new Error(
			'the <Trans> discovery scan collected call sites without ever seeing a real react-i18next Trans import — the scanner is matching something that is not a Trans',
		);
	}

	return sites;
};

const describeSite = (
	file: string,
	sourceFile: ts.SourceFile,
	attributes: ts.JsxAttributes,
): DiscoveredTransSite => {
	const readAttribute = (name: string): string | null => {
		for (const property of attributes.properties) {
			if (
				ts.isJsxAttribute(property) &&
				property.name.getText() === name &&
				property.initializer &&
				ts.isStringLiteral(property.initializer)
			) {
				return property.initializer.text;
			}
		}

		return null;
	};
	const { line } = sourceFile.getLineAndCharacterOfPosition(
		attributes.getStart(sourceFile),
	);

	return {
		file,
		line: line + 1,
		i18nKey: readAttribute('i18nKey'),
		namespace: readAttribute('ns'),
		hasStrongMap: hasStrongComponentsMap(attributes),
	};
};

const PRODUCTION_STRONG_CLASSNAME = 'text-foreground';

const readStringAttributeText = (
	initializer: ts.JsxAttributeValue,
): string | null => {
	if (ts.isStringLiteral(initializer)) {
		return initializer.text;
	}
	if (
		ts.isJsxExpression(initializer) &&
		initializer.expression &&
		ts.isStringLiteral(initializer.expression)
	) {
		return initializer.expression.text;
	}

	return null;
};

/**
 * True when the attributes carry `components={{ strong: <strong …/> }}`
 * with the production className — decided over the syntax tree, NOT a raw
 * substring match (#1312 round 1): reformatting the attribute across lines
 * cannot dodge this check, and dropping the `strong` entry (or the whole
 * map) cannot hide from it.
 */
const hasStrongComponentsMap = (attributes: ts.JsxAttributes): boolean => {
	for (const property of attributes.properties) {
		if (
			!ts.isJsxAttribute(property) ||
			property.name.getText() !== 'components' ||
			!property.initializer ||
			!ts.isJsxExpression(property.initializer)
		) {
			continue;
		}

		const expression = property.initializer.expression;
		if (!expression || !ts.isObjectLiteralExpression(expression)) {
			continue;
		}

		for (const entry of expression.properties) {
			if (
				!ts.isPropertyAssignment(entry) ||
				entry.name.getText() !== 'strong'
			) {
				continue;
			}

			const value = entry.initializer;
			let attributesOfValue: ts.JsxAttributes | undefined;
			if (ts.isJsxElement(value)) {
				attributesOfValue = value.openingElement.attributes;
			} else if (ts.isJsxSelfClosingElement(value)) {
				attributesOfValue = value.attributes;
			}
			if (!attributesOfValue) {
				continue;
			}

			let tagName: string | null = null;
			if (ts.isJsxSelfClosingElement(value)) {
				tagName = value.tagName.getText();
			} else if (ts.isJsxElement(value)) {
				tagName = value.openingElement.tagName.getText();
			}
			if (tagName === null || tagName.toLowerCase() !== 'strong') {
				continue;
			}

			for (const attribute of attributesOfValue.properties) {
				if (
					ts.isJsxAttribute(attribute) &&
					attribute.name.getText() === 'className' &&
					attribute.initializer &&
					readStringAttributeText(attribute.initializer) ===
						PRODUCTION_STRONG_CLASSNAME
				) {
					return true;
				}
			}
		}
	}

	return false;
};

const DISCOVERED_SITES: DiscoveredTransSite[] = discoverTransCallSites();

beforeEach(() => {
	mocks.hasBrowserSessionCookie.mockReturnValue(true);
	mocks.requestPasswordReset.mockResolvedValue({ status: 'sent' });
	mocks.isHydrated = true;
	mocks.currentUserQuery = {
		isSuccess: true,
		isError: false,
		data: { email: CURRENT_USER_EMAIL },
	};
});

afterEach(() => {
	cleanup();
});

describe('real-<Trans> render guard over the real route files (#1285)', () => {
	test('every JSX <Trans> in src is discovered and pinned to a spec', () => {
		expect(DISCOVERED_SITES.length).toBeGreaterThan(0);
		expect(standingUnpinnedEntries(DISCOVERED_SITES)).toEqual([]);
	});

	// Scratch-route proof cases (#1312 rounds 1–2; #1333): the scanner walks
	// the real src tree plus a per-run fixture root, so each proof plants a
	// scratch source file (the `_` prefix keeps it out of routing and out of
	// barrels), asserts what discovery must do with it, and removes it in a
	// finally so no other test sees it.
	type ProofCase = {
		title: string;
		fileName: string;
		body: string;
		/** False for precision shapes that are NOT Trans call sites at all. */
		expectDiscovered: boolean;
		/** False for sites whose attributes carry NO static i18nKey/ns (spread-only). */
		expectStaticIdentity: boolean;
	};

	const proofCases: ProofCase[] = [
		{
			title:
				'an aliased `Trans as Alias` call site is DISCOVERED, not a blind spot (#1312 round 2)',
			fileName: '_trans-alias-red-proof.tsx',
			body: [
				"import { Trans as Alias } from 'react-i18next';",
				'',
				'export function AliasedProof() {',
				'	return <Alias i18nKey="auth.proof" ns="auth">x</Alias>;',
				'}',
			].join('\n'),
			expectDiscovered: true,
			expectStaticIdentity: true,
		},
		{
			title:
				'a namespace-import `i18n.Trans` call site is DISCOVERED, not a blind spot (#1312 round 2)',
			fileName: '_trans-namespace-red-proof.tsx',
			body: [
				"import * as ReactI18n from 'react-i18next';",
				'',
				'export function NamespaceProof() {',
				'	return <ReactI18n.Trans i18nKey="auth.proof" ns="auth">x</ReactI18n.Trans>;',
				'}',
			].join('\n'),
			expectDiscovered: true,
			expectStaticIdentity: true,
		},
		{
			title:
				'a spread-only <Trans {...props}/> call site is DISCOVERED and lands UNPINNED, not a blind spot (#1333)',
			fileName: '_trans-spread-only-red-proof.tsx',
			body: [
				"import { Trans } from 'react-i18next';",
				'',
				'type SpreadOnlyProofProps = {',
				'\ti18nKey?: string;',
				'\tns?: string;',
				'\tvalues?: Record<string, string>;',
				'};',
				'',
				'export function SpreadOnlyProof(props: SpreadOnlyProofProps) {',
				'	return <Trans {...props}>fallback text</Trans>;',
				'}',
			].join('\n'),
			expectDiscovered: true,
			expectStaticIdentity: false,
		},
		{
			title:
				'a spread on a NON-Trans element is NOT discovered as a call site (#1333 precision)',
			fileName: '_non-trans-spread-proof.tsx',
			body: [
				"import type { ReactElement } from 'react';",
				'',
				'type NonTransProofProps = {',
				'\tlabel: string;',
				'};',
				'',
				'export function NonTransSpreadProof(',
				'\tprops: NonTransProofProps & Record<string, unknown>,',
				'): ReactElement {',
				'	return <p className="prose" {...props}>{props.label}</p>;',
				'}',
			].join('\n'),
			expectDiscovered: false,
			expectStaticIdentity: false,
		},
	];

	for (const {
		title,
		fileName,
		body,
		expectDiscovered,
		expectStaticIdentity,
	} of proofCases) {
		test(title, () => {
			const relative = `routes/${fileName}`;
			writeFileSync(fixturePath(relative), `${body}\n`);

			try {
				const sites = discoverTransCallSites({
					additionalRoots: [TRANS_FIXTURE_TMP_DIR],
				});
				const found = sites.filter((site) => site.file === relative);

				if (!expectDiscovered) {
					// Precision case: a spread on a plain element must contribute
					// zero call sites — discovery matches Trans tags only.
					expect(found).toEqual([]);
					return;
				}

				expect(found.length, `${relative} must be discovered`).toBe(1);

				if (expectStaticIdentity) {
					expect(found[0]?.i18nKey).toBe('auth.proof');
					expect(found[0]?.namespace).toBe('auth');
				} else {
					// A spread-only element carries no static i18nKey/ns identity
					// to pin (#1333): the site is still discovered, and below it
					// still flows through the STANDING unpinned list — so the
					// guard goes red naming `file:line`, exactly like any other
					// uncovered call site, until a spec covers it.
					expect(found[0]?.i18nKey).toBeNull();
					expect(found[0]?.namespace).toBeNull();
				}

				const unpinned = standingUnpinnedEntries(sites);
				expect(
					unpinned,
					`${relative} must land in the standing unpinned list (the guard goes red naming it)`,
				).toHaveLength(1);
				const [unpinnedFile, unpinnedLine] = (unpinned[0] ?? ':').split(':');
				expect(unpinnedFile, 'red must name the planted file').toBe(relative);
				expect(
					Number(unpinnedLine),
					'red must name a real line number',
				).toBeGreaterThan(0);
			} finally {
				unlinkSync(fixturePath(relative));
			}
		});
	}

	test('a *.test.tsx shape is EXCLUDED from discovery — the suite itself is not app source (#1333)', () => {
		// Pins the load-bearing exclusion: this guard file's own direct-mode
		// <Trans> mounts live in a *.test.tsx too, so losing the exclusion
		// would turn every suite-side mount into an unpinned site and flip
		// the standing discovery test permanently red.
		const relative = 'routes/_trans-excluded-suite-shape.test.tsx';
		writeFileSync(
			fixturePath(relative),
			`${[
				"import { render } from '@testing-library/react';",
				"import { Trans } from 'react-i18next';",
				'',
				'test("suite-side shape", () => {',
				'\trender(<Trans i18nKey="auth.proof" ns="auth">x</Trans>);',
				'});',
			].join('\n')}\n`,
		);

		try {
			const sites = discoverTransCallSites({
				additionalRoots: [TRANS_FIXTURE_TMP_DIR],
			});
			expect(sites.filter((site) => site.file === relative)).toEqual([]);
		} finally {
			unlinkSync(fixturePath(relative));
		}
	});

	test('skips a source file deleted after discovery and before read (#1484)', () => {
		const relative = 'routes/_trans-disappearing-mid-scan-proof.tsx';
		const filePath = fixturePath(relative);
		let deletedDuringScan = false;
		writeFileSync(
			filePath,
			[
				"import { Trans } from 'react-i18next';",
				'',
				'export function DisappearingMidScanProof() {',
				'\treturn <Trans i18nKey="auth.proof" ns="auth">x</Trans>;',
				'}',
			].join('\n') + '\n',
		);

		try {
			expect(() =>
				discoverTransCallSites({
					additionalRoots: [TRANS_FIXTURE_TMP_DIR],
					readSourceFile: (scannedPath) => {
						if (scannedPath === filePath) {
							unlinkSync(filePath);
							deletedDuringScan = true;
						}
						return readFileSync(scannedPath, 'utf8');
					},
				}),
			).not.toThrow();
			expect(deletedDuringScan).toBe(true);
		} finally {
			if (existsSync(filePath)) {
				unlinkSync(filePath);
			}
		}
	});

	test('rethrows non-ENOENT source read failures (#1484)', () => {
		const relative = 'routes/_trans-read-failure-proof.tsx';
		const filePath = fixturePath(relative);
		writeFileSync(filePath, 'export function ReadFailureProof() {}\n');
		const expectedError = Object.assign(
			new Error('synthetic permission failure'),
			{ code: 'EACCES' },
		);

		try {
			expect(() =>
				discoverTransCallSites({
					additionalRoots: [TRANS_FIXTURE_TMP_DIR],
					readSourceFile: (scannedPath) => {
						if (scannedPath === filePath) {
							throw expectedError;
						}
						return readFileSync(scannedPath, 'utf8');
					},
				}),
			).toThrow('synthetic permission failure');
		} finally {
			if (existsSync(filePath)) {
				unlinkSync(filePath);
			}
		}
	});

	test('skips a source directory deleted before recursive read (#1484)', () => {
		const relativeDirectory = 'routes/_trans-disappearing-directory-proof';
		const directoryPath = fixturePath(relativeDirectory);
		const relativeFile = `${relativeDirectory}/fixture.tsx`;
		const filePath = fixturePath(relativeFile);
		let deletedDuringScan = false;
		mkdirSync(directoryPath, { recursive: true });
		writeFileSync(
			filePath,
			'export function DisappearingDirectoryProof() {}\n',
		);

		try {
			expect(() =>
				discoverTransCallSites({
					additionalRoots: [TRANS_FIXTURE_TMP_DIR],
					beforeDirectoryRead: (directory) => {
						if (directory !== directoryPath) {
							return;
						}
						rmSync(directoryPath, { recursive: true, force: true });
						deletedDuringScan = true;
					},
				}),
			).not.toThrow();
			expect(deletedDuringScan).toBe(true);
		} finally {
			rmSync(directoryPath, { recursive: true, force: true });
		}
	});

	test('rethrows non-ENOENT directory read failures (#1484)', () => {
		const relativeDirectory = 'routes/_trans-directory-read-failure-proof';
		const directoryPath = fixturePath(relativeDirectory);
		const expectedError = Object.assign(
			new Error('synthetic directory permission failure'),
			{ code: 'EACCES' },
		);
		mkdirSync(directoryPath, { recursive: true });

		try {
			expect(() =>
				discoverTransCallSites({
					additionalRoots: [TRANS_FIXTURE_TMP_DIR],
					beforeDirectoryRead: (directory) => {
						if (directory === directoryPath) {
							throw expectedError;
						}
					},
				}),
			).toThrow('synthetic directory permission failure');
		} finally {
			rmSync(directoryPath, { recursive: true, force: true });
		}
	});

	test('BOUNDARY: a Trans binding re-exported through a local module is NOT resolved (#1333 documents the true residual)', () => {
		// Pinned CURRENT behaviour, deliberately labelled a boundary: the
		// importing file never carries the literal `react-i18next`, so the
		// cheap pre-filter skips it before any AST work — and even without
		// that skip, no import declaration from `react-i18next` binds its
		// local `Trans` name. An `<Trans>` reached through a local re-export
		// (`export { Trans } from 'react-i18next'` in a shared module) is
		// therefore the DOCUMENTED residual blind spot (see the header comment
		// and docs/guides/front/conventions.md, "<Trans> render guard"). The
		// shape does not exist in src today; if it ever lands, binding
		// resolution must grow BEFORE the shape ships — this test failing on
		// such a change is the deliberate speed bump, not an endorsement.
		const reExportFile = 'lib/i18n/_trans-re-export-residual.ts';
		const routeFile = 'routes/_trans-indirect-binding-residual.tsx';
		writeFileSync(
			fixturePath(reExportFile),
			`${["export { Trans } from 'react-i18next';"].join('\n')}\n`,
		);
		writeFileSync(
			fixturePath(routeFile),
			`${[
				"import { Trans } from '../lib/i18n/_trans-re-export-residual';",
				'',
				'export function IndirectBindingProof() {',
				'\treturn <Trans i18nKey="auth.proof" ns="auth">x</Trans>;',
				'}',
			].join('\n')}\n`,
		);

		try {
			const sites = discoverTransCallSites({
				additionalRoots: [TRANS_FIXTURE_TMP_DIR],
			});
			expect(sites.filter((site) => site.file === routeFile)).toEqual([]);
		} finally {
			unlinkSync(fixturePath(reExportFile));
			unlinkSync(fixturePath(routeFile));
		}
	});

	test('react-i18next is NOT mocked in this file', () => {
		// #1269 exists because the rest of the suite fakes `<Trans>` with a
		// regex. If this file ever grows a react-i18next module mock, the
		// real shapes below fail loudly.
		expect(
			vi.isMockFunction(Trans),
			'Trans must be the real react-i18next component, not a vi.fn',
		).toBe(false);
		expect(
			(initReactI18next as { type?: string }).type,
			'initReactI18next must be the real react-i18next plugin object',
		).toBe('3rdParty');
	});

	test('this file initialises i18n ONLY through createI18nFromResources', () => {
		const source = readSource('lib/i18n/trans-render.guard.test.tsx');
		expect(source).toContain('createI18nFromResources');
		expect(
			source.match(/\.init\(/),
			'the guard must not carry its own init mirror (makeRealI18n regression)',
		).toBeNull();
		expect(source.match(/\bcreateInstance\b/)).toBeNull();
		// Joined at runtime so THIS source line is not itself a match.
		const reactMockNeedle = ['vi.mock', "('react-i18next'"].join('');
		expect(
			source.includes(reactMockNeedle),
			'react-i18next must never be mocked here',
		).toBe(false);
	});

	test('every discovered <Trans> still passes the production strong components map', () => {
		// Pins the seam this guard asserts against: the `text-foreground`
		// className is only reachable through this map, so the call-site tests
		// below can only stay green while every real call site keeps passing
		// it. Structural (AST), so reformatting the attribute stays green and
		// deleting the entry flips red — the old substring pin did neither reliably.
		const bareSites = DISCOVERED_SITES.filter(
			(discoveredSite) => !discoveredSite.hasStrongMap,
		).map((discoveredSite) => `${discoveredSite.file}:${discoveredSite.line}`);

		expect(
			bareSites.sort(),
			'these <Trans> call sites lost the production strong components map',
		).toEqual([]);
	});

	test('every production <Trans> key exists in BOTH language resources', () => {
		for (const spec of CALL_SITES) {
			expect(
				resourceEN.auth[spec.key],
				`en/auth.json must contain ${spec.key}`,
			).toBeTypeOf('string');
			expect(
				resourceFR.auth[spec.key],
				`fr/auth.json must contain ${spec.key}`,
			).toBeTypeOf('string');
		}
	});

	for (const language of ['en', 'fr'] as const) {
		describe(language, () => {
			for (const spec of CALL_SITES) {
				test(`${spec.site}: ${spec.key} renders the pinned DOM through the real route`, async () => {
					const { container } = await renderCallSite(spec, language);

					let scope: Element = container;
					if (spec.scopeTestId) {
						const found = container.querySelector(
							`[data-testid="${spec.scopeTestId}"]`,
						);
						if (found === null) {
							throw new Error(
								`missing scope [data-testid="${spec.scopeTestId}"]`,
							);
						}
						scope = found;
					}
					assertTransDom(scope, spec, language, 'call-site');
				});
			}
		});
	}

	for (const language of ['en', 'fr'] as const) {
		describe(`${language} (bare resource, no components map)`, () => {
			for (const spec of CALL_SITES) {
				test(`${spec.key} keeps the resource's own <strong> as real DOM elements`, () => {
					// Direct <Trans> over the same real helper: with no components
					// map, rendering rides the resource's raw <strong> markup and
					// therefore on transKeepBasicHtmlNodesFor — the parser canary.
					const instance = makeAppI18n(language);
					const { container } = render(
						<I18nextProvider i18n={instance}>
							<Trans i18nKey={spec.key} ns="auth" values={{ ...spec.values }} />
						</I18nextProvider>,
					);

					assertTransDom(container, spec, language, 'bare-resource');
				});
			}
		});
	}
});

/**
 * Shared DOM pins: tag names + counts, the production className (call-site
 * mode only), email placement, escaped-markup detection, and the verbatim
 * sentence pin for the language.
 */
const assertTransDom = (
	scope: Element,
	spec: CallSiteSpec,
	language: SupportedLanguage,
	mode: 'call-site' | 'bare-resource',
): void => {
	const expectedEmails = Object.values(spec.values);
	const strongs = [...scope.querySelectorAll('strong')];

	expect(
		strongs.length,
		mode === 'bare-resource'
			? `${language}/${spec.key}: the resource's <strong> must survive parsing (transKeepBasicHtmlNodesFor)`
			: `${language}/${spec.key} (${mode}): expected one <strong> per interpolated value`,
	).toBe(expectedEmails.length);
	for (const strong of strongs) {
		expect(strong.tagName).toBe('STRONG');
	}

	if (mode === 'call-site') {
		for (const strong of strongs) {
			expect(
				strong.className,
				`${language}/${spec.key}: production className from the route's components map`,
			).toBe('text-foreground');
		}
	}

	expect(strongs.map((el) => el.textContent)).toEqual(expectedEmails);

	// Scope the text pins to the BLOCK-LEVEL element hosting the rendered
	// <Trans> (#1312 round 1): the real routes render plenty of other copy
	// (headings, labels, buttons) around the call site, and this guard must
	// judge only the Trans DOM. Generic over the usual block hosts instead of
	// hardcoding <p>, and the host is ASSERTED, never silently swapped for
	// the whole scope — a missing block host is a markup regression and gets
	// its own explicit failure instead of a misleading sentence-drift one.
	const BLOCK_HOST_SELECTOR = 'p, li, dd, dt, blockquote';
	let host = strongs[0]?.closest<Element>(BLOCK_HOST_SELECTOR) ?? null;

	if (mode === 'call-site') {
		expect(
			host,
			`${language}/${spec.key}: the <Trans> must render inside a block-level element (${BLOCK_HOST_SELECTOR})`,
		).toBeTruthy();
	} else {
		// Bare-resource mounts render straight into the testing-library
		// container, which IS the intended scope there.
		host ??= scope;
	}

	if (!host) {
		throw new Error('unreachable: host asserted above');
	}

	// Never escaped-markup text (`&lt;strong&gt;…`): that is how a broken
	// parser renders these resources.
	const text = host.textContent ?? '';
	expect(text).not.toContain('&lt;');
	for (const email of expectedEmails) {
		expect(countOccurrences(text, email)).toBe(1);
	}

	// Full-sentence pin against the verbatim expected text for this language —
	// NOT recomputed from the resource file, so wording drift flips this red.
	expect(
		text,
		`${language}/${spec.key} (${mode}): rendered sentence drifted from the pinned copy`,
	).toBe(spec[language]);
};
