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
 * (ambient declarations never render), and the e2e/__tests__ directories
 * (browser specs, not app source). A parse failure anywhere scanned throws
 * instead of walking a recovered partial tree. Two documented residuals: an
 * aliased import (`Trans as X`) and a spread-only `<Trans {...props} />`
 * carry no static `i18nKey` identity and stay outside discovery — neither
 * shape exists in src today.
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
 *   in `apps/front/src/routes/reset-password.tsx` turns this guard red: all
 *   four reset-password call-site tests fail on the className pin
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
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import type { i18n as I18nInstance } from 'i18next';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { I18nextProvider, initReactI18next, Trans } from 'react-i18next';
import { ts } from 'ts-morph';
import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest';

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
		if (from === '/accept-invitation') return mocks.invitationLoaderData;
		if (from === '/verify-email') return mocks.verifyEmailLoaderData;
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
		| 'routes/reset-password.tsx'
		| 'routes/_accept-invitation-views.tsx'
		| 'routes/verify-email.tsx';
	route: 'reset-password' | 'accept-invitation' | 'verify-email';
	loaderData:
		| ResetPasswordLoaderData
		| VerifyEmailLoaderData
		| InvitationLoaderData;
	flow?: 'submit-reset-request';
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
		site: 'routes/reset-password.tsx (request form -> sent confirmation)',
		file: 'routes/reset-password.tsx',
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
		site: 'routes/reset-password.tsx (set-new-password form)',
		file: 'routes/reset-password.tsx',
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

const ROUTE_COMPONENTS: Record<
	CallSiteSpec['route'],
	() => () => ReactElement
> = {
	'reset-password': () =>
		(
			ResetPasswordRoute as unknown as {
				component: () => ReactElement;
			}
		).component,
	'accept-invitation': () =>
		(
			AcceptInvitationRoute as unknown as {
				component: () => ReactElement;
			}
		).component,
	'verify-email': () =>
		(
			VerifyEmailRoute as unknown as {
				component: () => ReactElement;
			}
		).component,
};

const setRouteLoader = (
	route: CallSiteSpec['route'],
	loaderData: CallSiteSpec['loaderData'],
): void => {
	if (route === 'reset-password')
		mocks.resetPasswordLoaderData = loaderData as ResetPasswordLoaderData;
	else if (route === 'verify-email')
		mocks.verifyEmailLoaderData = loaderData as VerifyEmailLoaderData;
	else mocks.invitationLoaderData = loaderData as InvitationLoaderData;
};

const renderThroughRealI18n = (
	ui: ReactElement,
	language: SupportedLanguage,
): { container: HTMLElement; instance: I18nInstance } => {
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
		if (emailInput === null) throw new Error('request form email input');
		fireEvent.change(emailInput, {
			target: { value: RESET_REQUEST_EMAIL },
		});
		const form = rendered.container.querySelector(
			'[data-testid="reset-password-request-form"]',
		);
		if (form === null) throw new Error('request form');
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
// Documented residuals rather than silent blind spots: an aliased import
// (`Trans as T`) and a spread-only element (`<Trans {...props} />`) carry no
// static identity this scan can pin. Neither shape exists in src today; if
// one lands, discovery cannot see it and this comment is where the gap lives.
// ---------------------------------------------------------------------------

// vitest's import.meta.url may be a plain path rather than a file:// URL,
// depending on transform mode — normalise both shapes.
const THIS_FILE = import.meta.url.startsWith('file:')
	? fileURLToPath(import.meta.url)
	: import.meta.url;
const SRC_ROOT = path.resolve(THIS_FILE, '..', '..', '..');
const readSource = (relative: string): string =>
	readFileSync(path.join(SRC_ROOT, relative), 'utf8');

/**
 * Lists every source file under src, excluding the suite/spec/stories/d.ts
 * shapes listed above.
 */
const listSourceFiles = (): string[] => {
	const files: string[] = [];

	const walk = (relative: string): void => {
		for (const entry of readdirSync(path.join(SRC_ROOT, relative), {
			withFileTypes: true,
		})) {
			const child = `${relative}${relative === '' ? '' : '/'}${entry.name}`;

			if (entry.isDirectory()) {
				if (child === 'e2e') continue;
				walk(child);
				continue;
			}

			if (!/\.(ts|tsx)$/.test(child)) continue;
			if (/\.d\.ts$/.test(child)) continue;
			if (/\.test\.(ts|tsx)$/.test(child)) continue;
			if (/\.spec\./.test(child)) continue;
			if (/\.stories\.tsx$/.test(child)) continue;
			files.push(child);
		}
	};

	walk('');

	return files.sort();
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
};

/**
 * Walks every listed file's syntax tree and collects each JSX element whose
 * tag name is exactly `Trans`, with its static `i18nKey` / `ns` attributes
 * when present.
 */
const discoverTransCallSites = (): DiscoveredTransSite[] => {
	const sites: DiscoveredTransSite[] = [];
	let sawTransImport = false;

	for (const relative of listSourceFiles()) {
		const source = readFileSync(path.join(SRC_ROOT, relative), 'utf8');

		if (!source.includes('react-i18next')) continue;

		const sourceFile = createScannedSourceFile(source, relative);
		const visit = (node: ts.Node): void => {
			if (ts.isImportDeclaration(node)) {
				const module_ = node.moduleSpecifier;
				if (
					ts.isStringLiteral(module_) &&
					module_.text === 'react-i18next' &&
					node.importClause?.namedBindings &&
					ts.isNamedImports(node.importClause.namedBindings)
				) {
					sawTransImport =
						sawTransImport ||
						node.importClause.namedBindings.elements.some(
							(element) => element.name.text === 'Trans',
						);
				}
			}

			if (
				ts.isJsxElement(node) &&
				node.openingElement.tagName.getText() === 'Trans'
			) {
				sites.push(
					describeSite(relative, sourceFile, node.openingElement.attributes),
				);
				// Nested <Trans> inside <Trans> children would double-count the
				// outer element's own text; react-i18next does not nest them and
				// none exist in src, but keep walking anyway so a nested one is
				// still discovered as its own site.
			} else if (
				ts.isJsxSelfClosingElement(node) &&
				node.tagName.getText() === 'Trans'
			) {
				sites.push(describeSite(relative, sourceFile, node.attributes));
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
	};
};

const DISCOVERED_SITES: DiscoveredTransSite[] = discoverTransCallSites();

// The exact production components-map snippet every call site passes.
const STRONG_MAP_SNIPPET =
	'components={{ strong: <strong className="text-foreground" /> }}';

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

		const discoveredByFile = new Map<string, DiscoveredTransSite[]>();
		for (const discoveredSite of DISCOVERED_SITES) {
			discoveredByFile.set(discoveredSite.file, [
				...(discoveredByFile.get(discoveredSite.file) ?? []),
				discoveredSite,
			]);
		}

		for (const spec of CALL_SITES) {
			const sitesInFile = discoveredByFile.get(spec.file);
			expect(sitesInFile, `no discovered site in ${spec.file}`).toBeDefined();
			if (!sitesInFile) continue;

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
			if (matchedIndex >= 0) remaining.splice(matchedIndex, 1);
			discoveredByFile.set(spec.file, remaining);
		}

		const unpinned = [...discoveredByFile.entries()]
			.flatMap(([file, remainingSites]) =>
				remainingSites.map(
					(discoveredSite) => `${file}:${discoveredSite.line}`,
				),
			)
			.sort();

		expect(unpinned).toEqual([]);
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
			(initReactI18next as unknown as { type?: string }).type,
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

	test('every guarded route file still passes the production components map', () => {
		// Pins the seam this guard asserts against: the `text-foreground`
		// className is only reachable through this map, so the call-site tests
		// below can only stay green while the real files keep passing it.
		expect(
			countOccurrences(
				readSource('routes/reset-password.tsx'),
				STRONG_MAP_SNIPPET,
			),
			'reset-password.tsx must pass the strong components map at both sites',
		).toBe(2);
		expect(
			countOccurrences(
				readSource('routes/_accept-invitation-views.tsx'),
				STRONG_MAP_SNIPPET,
			),
			'_accept-invitation-views.tsx must pass the strong components map at both mismatch sites',
		).toBe(2);
		expect(
			countOccurrences(
				readSource('routes/verify-email.tsx'),
				STRONG_MAP_SNIPPET,
			),
			'verify-email.tsx must pass the strong components map once',
		).toBe(1);
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
						if (found === null)
							throw new Error(
								`missing scope [data-testid="${spec.scopeTestId}"]`,
							);
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

	// Scope the text pins to the <p> hosting the rendered <Trans>: the real
	// routes render plenty of other copy (headings, labels, buttons) around
	// the call site, and this guard must judge only the Trans DOM.
	const host =
		(strongs[0]?.closest('p') as Element | null | undefined) ?? scope;

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
