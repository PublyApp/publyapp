/**
 * @vitest-environment jsdom
 *
 * Guard for fix/990 — a drawer whose `DrawerBody` + `DrawerFooter` are wrapped
 * in a plain `Form`/`<form>` breaks `.publy-drawer`'s flex column, and so does
 * any intermediate block (a `<div>`) between the drawer's form and the
 * body/footer: the intermediate block owns the unconstrained height with
 * `min-height: auto`, the body's `min-h-0 flex-1 overflow-y-auto` is inert,
 * and the footer is clipped below the viewport edge with no scrollbar.
 *
 * jsdom has no layout engine, so no computed-height or scrolling assertion can
 * work here. The call-site drawers' own suites mock `~/components/ui/drawer`
 * wholesale — a model, not the artifact — so this guard instead renders every
 * inventoried REAL drawer against the REAL drawer components and asserts the
 * parent chain the geometry depends on:
 *
 *  1. `DrawerForm`'s `<form>` carries `.publy-drawer-form` and is a direct
 *     child of the `.publy-drawer` surface;
 *  2. `DrawerBody` and `DrawerFooter` are DIRECT children of that `<form>`
 *     (`parentElement === form`) — a `<div>` (or any other wrapper) inserted
 *     between them fails this and reintroduces the original bug;
 *  3. the `.publy-drawer-form` rule in app.css is parsed with postcss (so a
 *     commented-out rule produces no rule node and cannot pass) and is the
 *     LAST rule whose selector matches — a later winning rule that deletes the
 *     geometry is caught instead of silently winning the cascade.
 *
 * The browser-side proof — computed flex geometry and real scrolling at a
 * constrained viewport — is the captain's Playwright suite, not this file.
 *
 * Discovery is inverted from earlier rounds: the scanner does NOT key on
 * `DrawerForm` usage, it discovers every non-test file whose JSX contains a
 * `DrawerBody` or `DrawerFooter` tag — the exact set issue #990 names. A new
 * drawer that wraps the parts in the plain `Form` contains no `DrawerForm`
 * tag, so a `DrawerForm`-import-based scan never visits it; a body/footer
 * scan cannot miss it — discovery resolves each part tag through the SAME
 * binding machinery as the wrapper check below (direct import, alias
 * (`DrawerBody as Body`), namespace member, re-export barrel including
 * aliased re-exports), so the part cannot hide in an import spelling the
 * wrapper side would accept. Each discovered file is then required to put
 * every body/footer tag directly inside one of exactly two wrappers:
 *
 *   - `DrawerForm` — the drawer-owned `<form>` that carries the flex
 *     geometry (`form.publy-drawer-form`); or
 *   - `DrawerContent` — the `.publy-drawer` surface itself, for formless
 *     drawers (the assign-members, mobile-nav and cookie-prefs drawers put
 *     body/footer straight into the surface).
 *
 * A wrapper counts only when the tag's local binding RESOLVES to the drawer
 * module's export — through a direct import, an alias
 * (`import { DrawerForm as Form }`), a namespace import
 * (`import * as Drawer` + `<Drawer.DrawerForm>`), or a re-export barrel
 * (this repo's convention — `export { DrawerForm } from './drawer'`). A
 * same-named local declaration shadows imports and is NOT the shared
 * component, and an import that cannot be resolved is rejected rather than
 * guessed: the wrapper rule fails closed, so the #990 defect shape (the plain
 * field `Form`) is a structural violation with no discovery gap to hide in.
 *  Round 16 resolves the exception class instead of enumerating it: a tag is
 *  a drawer marker iff its binding is the SAME VALUE as a drawer-module
 *  export in TypeScript's own symbol graph — getSymbol()/getAliasedSymbol()/
 *  declaration identity against the drawer module's exported declarations.
 *  Direct import, alias (`DrawerForm as Form`), namespace member
 *  (`Drawer.DrawerForm`), re-export barrel, identity chain
 *  (`const Form = DrawerForm`), object-literal component map
 *  (`const Parts = { Form: DrawerForm }` + `<Parts.Form>`, longhand,
 *  shorthand `{ DrawerForm }` — resolved by the checker's own shorthand
 *  value symbol, round 17's BLOCKER 1 — spread, computed-with-a-literal-key),
 *  cross-file `export const X = DrawerX` shim, same-symbol conditional, and
 *  shapes nobody has written yet all terminate at the same declaration, so a
 *  spelling cannot evade the resolver by being written in four lines. A
 *  binding the symbol graph cannot resolve (a call, a mixed-symbol
 *  conditional, a reassigned `let`) is UNVERIFIABLE and reddens instead of
 *  silently not being an anchor — and since round 18, so is ANY declaration
 *  kind the resolver does not handle: not knowing means UNVERIFIABLE, never
 *  null, so the next unknown spelling costs a red build and a one-line
 *  addition instead of a silent escape. A runtime component factory whose
 *  loader is not statically a drawer symbol (`lazy`, `useMemo`, an HOC) is a
 *  real local component — never a marker — and a factory whose loader IS a
 *  drawer symbol resolves to it, because the factory adds no DOM node of its
 *  own. Tag-name resolution is keyed on the ACTUAL JSX node, in its own
 *  scope: a same-named local declaration shadows an import by scope, and
 *  two same-text tags in different scopes get their own verdicts (round
 *  17's BLOCKER 2). Round 20 closes the two paths that never reached the
 *  fail-closed terminal: a lowercase-leading DOTTED tag is a value
 *  expression, not an intrinsic element (round 19's BLOCKER 1 — only a
 *  plain Identifier tag can be intrinsic), and a member that resolves to
 *  a TYPE-side symbol is followed to its value side — the annotated
 *  object literal's own property — instead of being allowed to read
 *  "definitely not a drawer" (round 19's BLOCKER 2; the signature kinds
 *  are deleted from the definite-non-drawer allowlist, so a type-side
 *  member whose value side the scan cannot read is UNVERIFIABLE).
 *
 * The wrapper walk is DOM-faithful, not syntactic: it sees through
 * everything that creates no node — JSX expressions, conditionals, `&&`
 * chains, calls, parentheses, the `<>` shorthand, and the nodeless React
 * wrappers `Fragment`/`Suspense`/`StrictMode` (only when actually imported
 * from `react`, in a named or namespace-member spelling). A part whose walk
 * finds NO enclosing element at all sits inside a component DEFINITION (a
 * composition helper that renders the part), not at a drawer call site: its
 * DOM position is decided by the helper's call site, and a definition site
 * has no drawer to break. A helper that wraps the part in a real element IS
 * discovered and judged — the walk then finds that element and it is a
 * violation.
 *
 * Definition-site parts do NOT exempt the rest of the file — and this is
 * where round 12 (the drawer-section resolution block below) closes the two
 * escapes round 11 filed against the definition-site rule:
 *
 *  - a same-file sub-component that renders the `DrawerForm` used to make
 *    the file legally "formless": 28/28 green with `.publy-drawer > div >
 *    form.publy-drawer-form`, and the CORRECT inventory filing was the one
 *    that reddened (round 11's IMPORTANT 1);
 *  - parts extracted into a helper FILE left the call site with zero part
 *    tags, so discovery never visited it at all (round 11's IMPORTANT 2).
 *
 * The round-12 rule is therefore not a third marker to enumerate: from
 * every `DrawerContent`/`DrawerForm` tag the file renders — at a call site
 * or as a definition-root component (the drawer module itself excluded,
 * since its composition is the render half's and the Playwright spec's
 * business) — the scan RESOLVES WHAT THE DRAWER RENDERS: it follows
 * same-file sub-components and cross-file helpers through their definitions
 * to the parts and forms they ultimately produce, and judges those
 * occurrences by the element chain around them (a part or form behind a
 * `<div>`, anywhere in the chain, is a violation; directly under the
 * surface/form, clean). The resolution boundary is stated in the
 * drawer-section block below, and the ENTRY-point half is stated above
 *  (round 14, BLOCKER 1): everything the scan cannot resolve statically —
 *  at the walk roots and at the anchors themselves — is UNVERIFIABLE and
 *  reddens the file, so a drawer whose geometry cannot be verified is never
 *  silently green. Round 16 closes the boundary the round-14 report
 *  nominated and round 15 reproduced: a file that imports the drawer module
 *  AND carries an unverifiable tag is a drawer file with an opaque marker —
 *  it is discovered and reddens. The discriminator (a drawer-module import)
 *  is exactly the thing the no-signal file (`const Form = getForm()` with
 *  no drawer import anywhere) lacks, so the inventory does not flood. The
 *  only files left undiscovered are ones whose markers carry no drawer
 *  signal at all — not even an import — and such a file is not a drawer
 *  file.
 *
 * Deliberate friction: every file the scanner discovers must appear in the
 * inventory (the `DRAWER_FORM_CALL_SITES` union below, or
 * `FORM_LESS_DRAWER_SURFACE_FILES`), so a new drawer is visible to this suite
 * before it is reviewed. Form-bearing drawers additionally land in the e2e
 * helper and its exhaustive openers, which is where the author must supply a
 * real route, a drawer test id and a Playwright opener. The two lists are
 * NOT interchangeable: a discovered file that renders a resolved `DrawerForm`
 * tag — directly, inside a same-file sub-component, or behind a cross-file
 * helper (the scan reports every such file as `formBearing`) — must be in
 * `DRAWER_FORM_CALL_SITES`, because the formless list carries no render
 * obligation — filing a form-bearing drawer there used to be the silent
 * escape, and round 11 proved the correct filing used to be the one that
 * reddened.
 *
 * The scan additionally asserts the `DrawerContent → DrawerForm` link for
 * every form the anchored walks find: the form must be a direct child of
 * the `.publy-drawer` surface. A `<div>` between the surface and the form is
 * the #990 break one level up — the div owns the unconstrained height and
 * the body's scrolling is inert — and it reddens the structural test even
 * when every part tag has a legal wrapper, and even when the form itself
 * sits behind a same-file sub-component or a cross-file helper (round 9's
 * IMPORTANT 1 + round 11's IMPORTANT 1 + 2: the definition-site rule cannot
 * silence the form-link verdict or hide the file from discovery).
 */

import { spawn } from 'node:child_process';
import {
	existsSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { cleanup, render, screen } from '@testing-library/react';
import postcss from 'postcss';
import type { AnyNode, AtRule, Rule } from 'postcss';
import { createElement, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import {
	Node,
	Project,
	SyntaxKind,
	ts,
	type Symbol as TsMorphSymbol,
	type ArrayLiteralExpression,
	type ArrowFunction,
	type BinaryExpression,
	type Block,
	type CallExpression,
	type CaseClause,
	type CatchClause,
	type ConditionalExpression,
	type ElementAccessExpression,
	type FunctionDeclaration,
	type GetAccessorDeclaration,
	type IfStatement,
	type Identifier,
	type JsxAttribute,
	type JsxElement,
	type JsxExpression,
	type JsxFragment,
	type JsxOpeningElement,
	type JsxSelfClosingElement,
	type LabeledStatement,
	type MethodDeclaration,
	type ObjectLiteralExpression,
	type PrefixUnaryExpression,
	type PropertyAccessExpression,
	type PropertyAssignment,
	type ReturnStatement,
	type ShorthandPropertyAssignment,
	type SourceFile,
	type Statement,
	type StringLiteral,
	type SwitchStatement,
	type TryStatement,
	type VariableDeclaration,
} from 'ts-morph';
import { afterAll, afterEach, describe, expect, test, vi } from 'vitest';
import { Form } from '~/components/field/form';

import {
	DRAWER_FORM_CALL_SITES,
	type DrawerFormCallSiteId,
} from '../../../e2e/helpers/drawer-form-call-sites';

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => key,
		i18n: { language: 'en' },
	}),
}));

vi.mock('@tanstack/react-query', () => ({
	useQueryClient: () => ({}),
	// The create-post drawer's image hooks call useMutation; without it the
	// drawer surface guard cannot render the real component.
	useMutation: () => ({
		mutateAsync: () => Promise.resolve(undefined),
		isPending: false,
	}),
}));

vi.mock('~/lib/query/tenant-projects', () => ({
	useTenantProjectsQuery: () => ({ data: undefined, isPending: true }),
	toTenantProjectItems: () => [],
}));

// The Bluesky drawer reads its mutations through the social slice; the guard
// only measures drawer geometry, so the hooks resolve as inert stubs.
vi.mock('~/lib/query/social-accounts', async (importOriginal) => ({
	...(await importOriginal<object>()),
	useConnectSocialAccountMutation: () => ({
		mutateAsync: vi.fn(),
		isPending: false,
	}),
	useReconnectSocialAccountMutation: () => ({
		mutateAsync: vi.fn(),
		isPending: false,
	}),
}));

vi.mock('~/lib/query/tenant-posts', () => ({
	savePost: vi.fn(),
	invalidateTenantPosts: vi.fn(),
}));

vi.mock('~/lib/query/staff-global-tenant-users', async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import('~/lib/query/staff-global-tenant-users')
		>();

	return {
		...actual,
		useGlobalTenantUsersPickerQuery: () => ({
			data: undefined,
			isPending: true,
		}),
		useLinkGlobalTenantUserCompaniesMutation: () => ({
			isPending: false,
			mutate: vi.fn(),
			mutateAsync: vi.fn().mockResolvedValue(undefined),
		}),
	};
});

vi.mock('~/components/ui/button', () => ({
	Button: ({
		children,
		type,
		onClick,
		disabled,
		...props
	}: {
		children: ReactNode;
		type?: 'button' | 'submit' | 'reset';
		onClick?: () => void;
		disabled?: boolean;
	}) =>
		createElement(
			'button',
			{ type: type ?? 'button', onClick, disabled, ...props },
			children,
		),
}));

vi.mock('~/components/field', () => ({
	Field: {
		Text: () => null,
		Textarea: () => null,
		Select: () => null,
		Email: () => null,
	},
}));

vi.mock('~/components/ui/icon-color-picker', () => ({
	IconColorPicker: () => null,
}));

vi.mock('~/components/ui/confirm-dialog', () => ({
	ConfirmDialog: () => null,
}));

vi.mock('~/lib/mutation-toast', () => ({
	displayLocalMutationFailure: () => Promise.resolve(),
	toastLocalMutationResult: { success: () => undefined },
}));

vi.mock('@org/shared-ts/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: () => false,
}));

vi.mock('~/lib/query/staff-tenants', () => ({
	invalidateAllStaffTenantScopes: () => Promise.resolve(),
}));

vi.mock('~/lib/query/staff-profiles', () => ({
	invalidateStaffProfiles: () => Promise.resolve(),
	useUpdateStaffProfileMutation: () => ({
		mutateAsync: () => Promise.resolve(undefined),
		isPending: false,
	}),
}));

vi.mock('~/lib/query/staff-tenant-profiles', async () => {
	const actual = await vi.importActual<
		typeof import('~/lib/query/staff-tenant-profiles')
	>('~/lib/query/staff-tenant-profiles');

	return {
		...actual,
		useStaffTenantPermissionCatalogQuery: () => ({
			data: { additionalData: {} },
			isPending: false,
			isError: false,
			error: null,
		}),
		useCreateStaffTenantProfileMutation: () => ({
			mutateAsync: () => Promise.resolve({ profile: { id: 'profile-1' } }),
			isPending: false,
		}),
		useUpdateStaffTenantProfileMutation: () => ({
			mutateAsync: () => Promise.resolve(undefined),
			isPending: false,
		}),
	};
});

vi.mock('~/lib/query/staff-tenant-users', () => ({
	useBulkInviteTenantUsersMutation: () => ({
		mutateAsync: () => Promise.resolve(undefined),
		isPending: false,
	}),
	toStaffTenantInvitationBulkCreateSummary: (result: unknown) => result,
}));

vi.mock('~/lib/query/staff-users', () => ({
	useUpdateStaffUserEmailMutation: () => ({
		mutateAsync: () => Promise.resolve(undefined),
		isPending: false,
	}),
	invalidateStaffUsers: () => Promise.resolve(),
}));

vi.mock(
	'../../routes/authed/staff/tenants/$tenantId/_invite-profile-select',
	() => ({
		InviteProfileSelect: () => null,
	}),
);

import { StaffProfileEditDetailsDrawer } from '../../routes/authed/staff/profiles/$profileId/_profile-edit-details-drawer';
import { ChangeStaffUserEmailDialog } from '../../routes/authed/staff/staff-users/_change-email-dialog';
import { LinkCompaniesDrawerHost } from '../../routes/authed/staff/tenant-users/$userId-organizations-drawer';
import { InviteTenantUserDrawer } from '../../routes/authed/staff/tenants/$tenantId/_invite-user-drawer';
import { ProfileEditDetailsDrawer } from '../../routes/authed/staff/tenants/$tenantId/profiles/_profile-edit-details-drawer';
import { ProfileFormDrawer } from '../../routes/authed/staff/tenants/$tenantId/profiles/_profile-form-drawer';
import {
	getProfileFormValues,
	type ProfileFormValues,
} from '../../routes/authed/staff/tenants/$tenantId/profiles/_profile-form-schema';
import { CreatePostDrawer } from '../../routes/authed/tenant/posts/_create-post-drawer';
import { BlueskyConnectDrawer } from '../../routes/authed/tenant/settings/_bluesky-connect-drawer';

const noop = () => undefined;

const FRONT_ROOT = path.resolve(import.meta.dirname, '../../..');
const DRAWER_MODULE_RELATIVE_PATH = 'src/components/ui/drawer.tsx';
const DRAWER_MODULE_PATH = path.join(FRONT_ROOT, DRAWER_MODULE_RELATIVE_PATH);

// Round 11's IMPORTANT 3: the fixture files must NOT live under
// `apps/front/src`. The guard writes and deletes them mid-suite, and a
// parallel src-wide scanner (i18n-key-coverage.test.ts) lists src files and
// then reads each one — a fixture deleted between the list and the read is
// an ENOENT that reddens an innocent suite (reproduced at HEAD in round 11:
// five i18n tests red). They live in a per-run temp directory instead,
// created once here by drawer-guard-tmp-dir.cjs, which registers the
// cleanup on every exit path: an 'exit' handler (crashes and failures) and
// explicit SIGINT/SIGTERM handlers (cancellation — round 13's IMPORTANT 4:
// `exit` never runs on a signal, so a cancelled run used to leak the whole
// directory; a sibling guard once leaked 60,000 /tmp directories).
const guardTempDirRequire = createRequire(import.meta.url);
const { createGuardTempDir } = guardTempDirRequire(
	'./drawer-guard-tmp-dir.cjs',
) as {
	createGuardTempDir: (prefix: string) => {
		dir: string;
		remove: () => void;
	};
};
const FIXTURE_TMP_DIR = createGuardTempDir('publy-drawer-guard-').dir;

// ---------------------------------------------------------------------------
// Round 14, IMPORTANT 4: the SIGTERM probe. The "with handlers" child
// requires the SAME drawer-guard-tmp-dir.cjs module the guard itself uses,
// so a killed child exercises the guard's exact registration — the child
// creates the directory through createGuardTempDir and then waits for the
// signal. The exit-only child is the round-13 shape (raw mkdtempSync + an
// 'exit' handler only) and documents the defect the signal handlers close.
// Every directory the probe creates is registered here so the afterAll
// removes it even if a test dies mid-probe; the `publy-drawer-sigterm-`
// prefix deliberately differs from the guard's own prefix so a probe leak
// can never be miscounted as a guard leak.
// ---------------------------------------------------------------------------

const GUARD_TMP_DIR_MODULE_PATH = path.join(
	import.meta.dirname,
	'drawer-guard-tmp-dir.cjs',
);

const SIGNAL_PROBE_WITH_HANDLERS = `
const { createGuardTempDir } = require(${JSON.stringify(GUARD_TMP_DIR_MODULE_PATH)});
const { dir } = createGuardTempDir('publy-drawer-sigterm-probe-');
process.stdout.write(dir + '\\n');
setInterval(() => undefined, 60000);
`;

const SIGNAL_PROBE_EXIT_ONLY = `
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const dir = mkdtempSync(path.join(tmpdir(), 'publy-drawer-sigterm-probe-'));
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
process.stdout.write(dir + '\\n');
setInterval(() => undefined, 60000);
`;

const signalProbeDirs: string[] = [];

const runSignalProbeChild = (
	childSource: string,
	signal: NodeJS.Signals,
): Promise<{
	dirPath: string;
	exitCode: number | null;
	exitSignal: NodeJS.Signals | null;
}> =>
	new Promise((resolve, reject) => {
		const child = spawn(process.execPath, ['-e', childSource], {
			stdio: ['ignore', 'pipe', 'inherit'],
		});
		let buffer = '';
		let dirPath: string | null = null;
		let exitCode: number | null = null;
		let exitSignal: NodeJS.Signals | null = null;
		child.stdout.on('data', (chunk: Buffer) => {
			buffer += chunk.toString();
			if (dirPath === null && buffer.includes('\n')) {
				dirPath = buffer.split('\n')[0];
				signalProbeDirs.push(dirPath);
				child.kill(signal);
			}
		});
		child.on('error', reject);
		child.on('exit', (code, childSignal) => {
			exitCode = code;
			exitSignal = childSignal;
			if (dirPath !== null) {
				resolve({ dirPath, exitCode, exitSignal });
			} else {
				reject(
					new Error(
						`signal probe exited before printing its temp dir (output: ${buffer})`,
					),
				);
			}
		});
	});

// Maps a fixture's logical `src/components/ui/...` name (used in the SOURCE
// constants below) to its actual temp-directory path, and to the portable
// FRONT_ROOT-relative path the scan reports — the assertions compare against
// `fixtureRel(...)`, never against the logical name.
const fixturePath = (logicalFile: string): string =>
	path.join(FIXTURE_TMP_DIR, path.basename(logicalFile));
const fixtureRel = (logicalFile: string): string =>
	toPortableSourcePath(fixturePath(logicalFile));

// React wrappers that render no DOM node of their own; the wrapper walk
// treats them as transparent (see isNodelessReactWrapper).
const NODELESS_REACT_WRAPPER_NAMES = new Set([
	'Fragment',
	'Suspense',
	'StrictMode',
]);

const TEMPORARY_NEW_DRAWER_FILE =
	'src/components/ui/_drawer-surface-new-fixture.tsx';
const TEMPORARY_NEW_DRAWER_PATH = fixturePath(TEMPORARY_NEW_DRAWER_FILE);
const TEMPORARY_NEW_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';

import { DrawerBody, DrawerFooter, DrawerForm } from '~/components/ui/drawer';

export const NewDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<DrawerForm methods={methods}>
		<DrawerBody />
		<DrawerFooter />
	</DrawerForm>
);
`;

const TEMPORARY_ALIASED_DRAWER_FILE =
	'src/components/ui/_drawer-surface-aliased-fixture.tsx';
const TEMPORARY_ALIASED_DRAWER_PATH = fixturePath(
	TEMPORARY_ALIASED_DRAWER_FILE,
);
const TEMPORARY_ALIASED_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';

import { DrawerBody, DrawerFooter } from '~/components/ui/drawer';
import { DrawerForm as Form } from '~/components/ui/drawer';

export const AliasedDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<Form methods={methods}>
		<DrawerBody />
		<DrawerFooter />
	</Form>
);
`;

const TEMPORARY_BARREL_FILE =
	'src/components/ui/_drawer-form-barrel-fixture.ts';
const TEMPORARY_BARREL_PATH = fixturePath(TEMPORARY_BARREL_FILE);
const TEMPORARY_BARREL_SOURCE = `export { DrawerForm } from '~/components/ui/drawer';
`;
const TEMPORARY_BARREL_CALL_SITE_FILE =
	'src/components/ui/_drawer-surface-barrel-fixture.tsx';
const TEMPORARY_BARREL_CALL_SITE_PATH = fixturePath(
	TEMPORARY_BARREL_CALL_SITE_FILE,
);
const TEMPORARY_BARREL_CALL_SITE_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';

import { DrawerBody, DrawerFooter } from '~/components/ui/drawer';
import { DrawerForm } from './_drawer-form-barrel-fixture';

export const BarrelDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<DrawerForm methods={methods}>
		<DrawerBody />
		<DrawerFooter />
	</DrawerForm>
);
`;

const TEMPORARY_NAMESPACE_DRAWER_FILE =
	'src/components/ui/_drawer-surface-namespace-fixture.tsx';
const TEMPORARY_NAMESPACE_DRAWER_PATH = fixturePath(
	TEMPORARY_NAMESPACE_DRAWER_FILE,
);
const TEMPORARY_NAMESPACE_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';

import * as Drawer from '~/components/ui/drawer';

export const NamespaceDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<Drawer.DrawerForm methods={methods}>
		<Drawer.DrawerBody />
		<Drawer.DrawerFooter />
	</Drawer.DrawerForm>
);
`;

const TEMPORARY_REGRESSED_DRAWER_FILE =
	'src/components/ui/_drawer-surface-regressed-fixture.tsx';
const TEMPORARY_REGRESSED_DRAWER_PATH = fixturePath(
	TEMPORARY_REGRESSED_DRAWER_FILE,
);
// Reproduces the exact #990 shape: DrawerBody + DrawerFooter wrapped in the
// plain `Form` block. This is the bug the PR exists to prevent recurring.
const TEMPORARY_REGRESSED_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { Form } from '~/components/field';
import {
	Drawer,
	DrawerBody,
	DrawerContent,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from '~/components/ui/drawer';

export const RegressedDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<Drawer open>
		<DrawerContent data-testid="r6-regressed-drawer">
			<DrawerHeader>
				<DrawerTitle />
			</DrawerHeader>
			<Form methods={methods}>
				<DrawerBody />
				<DrawerFooter>
					<button type="submit" />
				</DrawerFooter>
			</Form>
		</DrawerContent>
	</Drawer>
);
`;

// The #990 shape with ALIASED part imports — `DrawerBody as Body` /
// `DrawerFooter as Footer` inside the plain field `Form`. Round 7's I1: the
// parts were discovered by literal tag text, so this spelling shipped
// 17/17 green. Discovery now resolves part tags through the same binding
// machinery as the wrapper check.
const TEMPORARY_ALIASED_PARTS_DRAWER_FILE =
	'src/components/ui/_drawer-surface-aliased-parts-fixture.tsx';
const TEMPORARY_ALIASED_PARTS_DRAWER_PATH = fixturePath(
	TEMPORARY_ALIASED_PARTS_DRAWER_FILE,
);
const TEMPORARY_ALIASED_PARTS_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { Form } from '~/components/field';
import {
	Drawer,
	DrawerBody as Body,
	DrawerContent,
	DrawerFooter as Footer,
	DrawerHeader,
	DrawerTitle,
} from '~/components/ui/drawer';

export const AliasedPartsRegressedDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<Drawer open>
		<DrawerContent data-testid="r8-aliased-parts">
			<DrawerHeader>
				<DrawerTitle />
			</DrawerHeader>
			<Form methods={methods}>
				<Body />
				<Footer>
					<button type="submit" />
				</Footer>
			</Form>
		</DrawerContent>
	</Drawer>
);
`;

// The same #990 shape one hop deeper: the parts come ALIASED through a
// re-export barrel (`export { DrawerBody as Body }`), which is also how an
// author would share a part under a shorter name. The chain resolver must
// match the alias at the barrel and follow the ORIGINAL name to the drawer
// module.
const TEMPORARY_ALIASED_BARREL_PARTS_FILE =
	'src/components/ui/_drawer-parts-aliased-barrel-fixture.ts';
const TEMPORARY_ALIASED_BARREL_PARTS_PATH = fixturePath(
	TEMPORARY_ALIASED_BARREL_PARTS_FILE,
);
const TEMPORARY_ALIASED_BARREL_PARTS_SOURCE = `export { DrawerBody as Body, DrawerFooter as Footer } from '~/components/ui/drawer';
`;
const TEMPORARY_ALIASED_BARREL_PARTS_CALL_SITE_FILE =
	'src/components/ui/_drawer-surface-aliased-barrel-parts-fixture.tsx';
const TEMPORARY_ALIASED_BARREL_PARTS_CALL_SITE_PATH = fixturePath(
	TEMPORARY_ALIASED_BARREL_PARTS_CALL_SITE_FILE,
);
const TEMPORARY_ALIASED_BARREL_PARTS_CALL_SITE_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { Form } from '~/components/field';
import { DrawerContent, DrawerHeader, DrawerTitle } from '~/components/ui/drawer';
import { Body, Footer } from './_drawer-parts-aliased-barrel-fixture';

export const AliasedBarrelPartsDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<DrawerContent data-testid="r8-aliased-barrel-parts">
		<DrawerHeader>
			<DrawerTitle />
		</DrawerHeader>
		<Form methods={methods}>
			<Body />
			<Footer>
				<button type="submit" />
			</Footer>
		</Form>
	</DrawerContent>
);
`;

const TEMPORARY_LOCAL_SHADOW_DRAWER_FILE =
	'src/components/ui/_drawer-surface-local-shadow-fixture.tsx';
const TEMPORARY_LOCAL_SHADOW_DRAWER_PATH = fixturePath(
	TEMPORARY_LOCAL_SHADOW_DRAWER_FILE,
);
const TEMPORARY_LOCAL_SHADOW_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';

import { DrawerBody, DrawerFooter } from '~/components/ui/drawer';
import { DrawerForm as Form } from '~/components/ui/drawer';

const Form = () => <div />;

export const LocalShadowDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<Form methods={methods}>
		<DrawerBody />
		<DrawerFooter />
	</Form>
);
`;

const TEMPORARY_UNRESOLVED_DRAWER_FILE =
	'src/components/ui/_drawer-surface-unresolved-fixture.tsx';
const TEMPORARY_UNRESOLVED_DRAWER_PATH = fixturePath(
	TEMPORARY_UNRESOLVED_DRAWER_FILE,
);
const TEMPORARY_UNRESOLVED_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';

import { DrawerBody, DrawerFooter } from '~/components/ui/drawer';
import { DrawerForm as Form } from './_drawer-form-module-that-does-not-exist';

export const UnresolvedDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<Form methods={methods}>
		<DrawerBody />
		<DrawerFooter />
	</Form>
);
`;

const TEMPORARY_BARE_WRAPPER_DRAWER_FILE =
	'src/components/ui/_drawer-surface-bare-fixture.tsx';
const TEMPORARY_BARE_WRAPPER_DRAWER_PATH = fixturePath(
	TEMPORARY_BARE_WRAPPER_DRAWER_FILE,
);
// A wrapper that is neither imported nor declared anywhere in the file is
// not the shared component — the bare-name fallback of earlier rounds is
// deliberately gone.
const TEMPORARY_BARE_WRAPPER_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';

export const BareWrapperDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<DrawerForm methods={methods}>
		<DrawerBody />
		<DrawerFooter />
	</DrawerForm>
);
`;

const TEMPORARY_CONDITIONAL_DRAWER_FILE =
	'src/components/ui/_drawer-surface-conditional-fixture.tsx';
const TEMPORARY_CONDITIONAL_DRAWER_PATH = fixturePath(
	TEMPORARY_CONDITIONAL_DRAWER_FILE,
);
// A conditional body is still a DIRECT child of the form in the DOM — the
// ternary creates no node, so the wrapper walk must see through it.
const TEMPORARY_CONDITIONAL_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';

import { DrawerBody, DrawerFooter, DrawerForm } from '~/components/ui/drawer';

export const ConditionalDrawerFixture = ({
	methods,
	isEmpty,
}: {
	methods: UseFormReturn<FieldValues>;
	isEmpty: boolean;
}) => (
	<DrawerForm methods={methods}>
		{isEmpty ? <DrawerBody /> : <DrawerBody />}
		<DrawerFooter />
	</DrawerForm>
);
`;

// Round 7's I2: a drawer body under `<Suspense>` and a footer inside an
// explicit `<Fragment>` render exactly the chain the guard protects — both
// wrappers are nodeless — so the wrapper walk must see through them. The
// shorthand `<>` was already transparent; the named form and Suspense are
// the same class.
const TEMPORARY_NODELESS_WRAPPERS_DRAWER_FILE =
	'src/components/ui/_drawer-surface-nodeless-wrappers-fixture.tsx';
const TEMPORARY_NODELESS_WRAPPERS_DRAWER_PATH = fixturePath(
	TEMPORARY_NODELESS_WRAPPERS_DRAWER_FILE,
);
const TEMPORARY_NODELESS_WRAPPERS_DRAWER_SOURCE = `import { Fragment, Suspense } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerFooter, DrawerForm } from '~/components/ui/drawer';

export const NodelessWrappersDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<DrawerForm methods={methods}>
		<Suspense fallback={null}>
			<DrawerBody />
		</Suspense>
		<Fragment>
			<DrawerFooter>
				<button type="submit" />
			</DrawerFooter>
		</Fragment>
	</DrawerForm>
);
`;

// Round 7's I2: a composition helper that renders `<DrawerBody>` directly —
// its rendered output is a drawer part at the helper's instantiation
// position, and the part has NO enclosing element in this file, so the walk
// returns null. That is a component DEFINITION, not a drawer call site; a
// definition site has no drawer to break, so it is neither discovered nor a
// violation (a helper that wraps the part in an element IS discovered and
// judged — the walk then finds that element).
const TEMPORARY_DEFINITION_HELPER_FILE =
	'src/components/ui/_drawer-section-body-fixture.tsx';
const TEMPORARY_DEFINITION_HELPER_PATH = fixturePath(
	TEMPORARY_DEFINITION_HELPER_FILE,
);
const TEMPORARY_DEFINITION_HELPER_SOURCE = `import type { ReactNode } from 'react';
import { DrawerBody } from '~/components/ui/drawer';

export const DrawerSectionBody = ({ children }: { children: ReactNode }) => (
	<DrawerBody className="flex flex-col gap-4">{children}</DrawerBody>
);
`;

// The boundary of the I2 decision: a part wrapped in a REAL element (a
// `<div>`) is a structural violation — the div owns the unconstrained
// height between the form and the part. Nodeless wrappers are transparent;
// element wrappers are not.
const TEMPORARY_DIV_WRAPPED_PARTS_DRAWER_FILE =
	'src/components/ui/_drawer-surface-div-wrapped-parts-fixture.tsx';
const TEMPORARY_DIV_WRAPPED_PARTS_DRAWER_PATH = fixturePath(
	TEMPORARY_DIV_WRAPPED_PARTS_DRAWER_FILE,
);
const TEMPORARY_DIV_WRAPPED_PARTS_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerFooter, DrawerForm } from '~/components/ui/drawer';

export const DivWrappedPartsDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<DrawerForm methods={methods}>
		<div className="p-4">
			<DrawerBody />
		</div>
		<DrawerFooter>
			<button type="submit" />
		</DrawerFooter>
	</DrawerForm>
);
`;

// Round 7's I3: the #990 break one level up. Body and footer are correctly
// inside the form, but a `<div>` sits between the `.publy-drawer` surface
// and the form — the div owns the unconstrained height and the body's
// scrolling is inert again. The form-link check must flag this even though
// every part tag has a legal wrapper.
const TEMPORARY_DIV_ABOVE_FORM_DRAWER_FILE =
	'src/components/ui/_drawer-surface-div-above-form-fixture.tsx';
const TEMPORARY_DIV_ABOVE_FORM_DRAWER_PATH = fixturePath(
	TEMPORARY_DIV_ABOVE_FORM_DRAWER_FILE,
);
const TEMPORARY_DIV_ABOVE_FORM_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import {
	Drawer,
	DrawerBody,
	DrawerContent,
	DrawerFooter,
	DrawerForm,
	DrawerHeader,
	DrawerTitle,
} from '~/components/ui/drawer';

export const DivAboveFormDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<Drawer open>
		<DrawerContent data-testid="r8-div-above-form">
			<DrawerHeader>
				<DrawerTitle />
			</DrawerHeader>
			<div className="p-4">
				<DrawerForm methods={methods}>
					<DrawerBody />
					<DrawerFooter>
						<button type="submit" />
					</DrawerFooter>
				</DrawerForm>
			</div>
		</DrawerContent>
	</Drawer>
);
`;

// Round 9's IMPORTANT 1: the SAME break one level up, with the parts
// factored into chain-preserving one-line helpers (each renders its part
// directly, no element between). The rendered DOM is byte-identical to
// DivAboveFormDrawerFixture above, but every part tag in this file resolves
// to a null wrapper — the helpers are definition sites. The file is still a
// drawer call site (it renders the form at a call site), so it must still be
// discovered, inventoried as form-bearing, and rejected on the broken
// surface-to-form link.
const TEMPORARY_HELPER_HIDDEN_DIV_ABOVE_FORM_DRAWER_FILE =
	'src/components/ui/_drawer-surface-helper-hidden-div-above-form-fixture.tsx';
const TEMPORARY_HELPER_HIDDEN_DIV_ABOVE_FORM_DRAWER_PATH = fixturePath(
	TEMPORARY_HELPER_HIDDEN_DIV_ABOVE_FORM_DRAWER_FILE,
);
const TEMPORARY_HELPER_HIDDEN_DIV_ABOVE_FORM_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import {
	Drawer,
	DrawerBody,
	DrawerContent,
	DrawerFooter,
	DrawerForm,
	DrawerHeader,
	DrawerTitle,
} from '~/components/ui/drawer';

const BodySection = () => <DrawerBody />;
const FooterSection = () => (
	<DrawerFooter>
		<button type="submit" />
	</DrawerFooter>
);

export const HelperHiddenDivAboveFormDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<Drawer open>
		<DrawerContent data-testid="r10-helper-hidden-div-above-form">
			<DrawerHeader>
				<DrawerTitle />
			</DrawerHeader>
			<div className="p-4">
				<DrawerForm methods={methods}>
					<BodySection />
					<FooterSection />
				</DrawerForm>
			</div>
		</DrawerContent>
	</Drawer>
);
`;

// Round 9's MINOR 2: a LOCAL component named `Suspense` that renders a real
// layout box must NOT be treated as React's nodeless wrapper — the walk must
// find the `<div>` it renders and judge it. The nodeless transparency is
// conditioned on the name actually being imported from `react`; this fixture
// pins that verification (deleting it is fail-open: the div disappears and
// the wrapped body looks like a direct form child).
const TEMPORARY_FAKE_SUSPENSE_DRAWER_FILE =
	'src/components/ui/_drawer-surface-fake-suspense-fixture.tsx';
const TEMPORARY_FAKE_SUSPENSE_DRAWER_PATH = fixturePath(
	TEMPORARY_FAKE_SUSPENSE_DRAWER_FILE,
);
const TEMPORARY_FAKE_SUSPENSE_DRAWER_SOURCE = `import type { ReactNode } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerFooter, DrawerForm } from '~/components/ui/drawer';

const Suspense = ({ children }: { children: ReactNode }) => (
	<div className="p-4">{children}</div>
);

export const FakeSuspenseDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<DrawerForm methods={methods}>
		<Suspense>
			<DrawerBody />
		</Suspense>
		<DrawerFooter>
			<button type="submit" />
		</DrawerFooter>
	</DrawerForm>
);
`;

// Round 9's MINOR 3: a member-expression part tag whose base is a NAMED
// binding rather than a namespace import — `export * as Drawer from './drawer'`
// in a barrel, reached as `import { Drawer }`, then `<Drawer.DrawerBody />`.
// The base binding must be followed like any named import, and the barrel's
// `export * as` hop must forward the member lookup to the drawer module.
const TEMPORARY_NS_BARREL_FILE =
	'src/components/ui/_drawer-ns-barrel-fixture.ts';
const TEMPORARY_NS_BARREL_PATH = fixturePath(TEMPORARY_NS_BARREL_FILE);
const TEMPORARY_NS_BARREL_SOURCE = `export * as Drawer from '~/components/ui/drawer';
`;
const TEMPORARY_NS_BARREL_CALL_SITE_FILE =
	'src/components/ui/_drawer-surface-ns-barrel-parts-fixture.tsx';
const TEMPORARY_NS_BARREL_CALL_SITE_PATH = fixturePath(
	TEMPORARY_NS_BARREL_CALL_SITE_FILE,
);
const TEMPORARY_NS_BARREL_CALL_SITE_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { Form } from '~/components/field';
import { Drawer } from './_drawer-ns-barrel-fixture';

export const NsBarrelPartsDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<Form methods={methods}>
		<Drawer.DrawerBody />
		<Drawer.DrawerFooter>
			<button type="submit" />
		</Drawer.DrawerFooter>
	</Form>
);
`;

// Round 7's MINOR 4: the `DrawerFooter` half of the discovery predicate was
// the one branch whose deletion was fail-open — a footer-only drawer became
// invisible with a fully green suite (app-shell.tsx pins the `DrawerBody`
// half: it has a body and no footer, so dropping the body half reddens the
// inventory). This fixture pins the footer half the same way.
const TEMPORARY_FOOTER_ONLY_DRAWER_FILE =
	'src/components/ui/_drawer-surface-footer-only-fixture.tsx';
const TEMPORARY_FOOTER_ONLY_DRAWER_PATH = fixturePath(
	TEMPORARY_FOOTER_ONLY_DRAWER_FILE,
);
const TEMPORARY_FOOTER_ONLY_DRAWER_SOURCE = `import { DrawerContent, DrawerFooter } from '~/components/ui/drawer';

export const FooterOnlyDrawerFixture = () => (
	<DrawerContent data-testid="r8-footer-only">
		<DrawerFooter />
	</DrawerContent>
);
`;

// Round 11's IMPORTANT 1: the SAME break one level up (a `<div>` between the
// surface and the form), with the form extracted into a SAME-FILE
// sub-component. The file still renders a drawer form at a call site — the
// walk must resolve what `<InnerForm />` renders, judge the form occurrence
// with the div on its chain (formLinkBroken), and report the file as
// form-bearing so the correct inventory filing is the passing one.
const TEMPORARY_INNER_FORM_DIV_ABOVE_DRAWER_FILE =
	'src/components/ui/_drawer-surface-inner-form-div-above-fixture.tsx';
const TEMPORARY_INNER_FORM_DIV_ABOVE_DRAWER_PATH = fixturePath(
	TEMPORARY_INNER_FORM_DIV_ABOVE_DRAWER_FILE,
);
const TEMPORARY_INNER_FORM_DIV_ABOVE_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import {
	Drawer,
	DrawerBody,
	DrawerContent,
	DrawerFooter,
	DrawerForm,
	DrawerHeader,
	DrawerTitle,
} from '~/components/ui/drawer';

const InnerForm = ({ methods }: { methods: UseFormReturn<FieldValues> }) => (
	<DrawerForm methods={methods}>
		<DrawerBody />
		<DrawerFooter>
			<button type="submit" />
		</DrawerFooter>
	</DrawerForm>
);

export const InnerFormDivAboveDrawer = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<Drawer open>
		<DrawerContent data-testid="r12-inner-form-div-above">
			<DrawerHeader>
				<DrawerTitle />
			</DrawerHeader>
			<div className="p-4">
				<InnerForm methods={methods} />
			</div>
		</DrawerContent>
	</Drawer>
);
`;

// The CORRECT same-file sub-component arrangement: the sub-component renders
// the form directly under the surface, no intermediate element. The
// round-13 standard — a mutation that keeps this green while restoring the
// #990 break must not exist — starts with the correct arrangement staying
// green.
const TEMPORARY_INNER_FORM_DIRECT_DRAWER_FILE =
	'src/components/ui/_drawer-surface-inner-form-direct-fixture.tsx';
const TEMPORARY_INNER_FORM_DIRECT_DRAWER_PATH = fixturePath(
	TEMPORARY_INNER_FORM_DIRECT_DRAWER_FILE,
);
const TEMPORARY_INNER_FORM_DIRECT_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import {
	Drawer,
	DrawerBody,
	DrawerContent,
	DrawerFooter,
	DrawerForm,
	DrawerHeader,
	DrawerTitle,
} from '~/components/ui/drawer';

const InnerForm = ({ methods }: { methods: UseFormReturn<FieldValues> }) => (
	<DrawerForm methods={methods}>
		<DrawerBody />
		<DrawerFooter>
			<button type="submit" />
		</DrawerFooter>
	</DrawerForm>
);

export const InnerFormDirectDrawer = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<Drawer open>
		<DrawerContent data-testid="r12-inner-form-direct">
			<DrawerHeader>
				<DrawerTitle />
			</DrawerHeader>
			<InnerForm methods={methods} />
		</DrawerContent>
	</Drawer>
);
`;

// Round 11's IMPORTANT 2: the parts extracted into a CROSS-FILE helper. The
// call site has no part tags of its own — discovery used to never visit it.
// The helper file is a definition site and stays out of the inventory; the
// call site is judged through the walk, and this variant carries the #990
// break one level up (the div between the surface and the form).
const TEMPORARY_CROSSFILE_PARTS_FILE =
	'src/components/ui/_drawer-crossfile-parts-fixture.tsx';
const TEMPORARY_CROSSFILE_PARTS_PATH = fixturePath(
	TEMPORARY_CROSSFILE_PARTS_FILE,
);
const TEMPORARY_CROSSFILE_PARTS_SOURCE = `import { DrawerBody, DrawerFooter } from '~/components/ui/drawer';

export const BodySection = () => <DrawerBody />;
export const FooterSection = () => (
	<DrawerFooter>
		<button type="submit" />
	</DrawerFooter>
);
`;
const TEMPORARY_CROSSFILE_DIV_ABOVE_FORM_FILE =
	'src/components/ui/_drawer-surface-crossfile-div-above-form-fixture.tsx';
const TEMPORARY_CROSSFILE_DIV_ABOVE_FORM_PATH = fixturePath(
	TEMPORARY_CROSSFILE_DIV_ABOVE_FORM_FILE,
);
const TEMPORARY_CROSSFILE_DIV_ABOVE_FORM_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import {
	Drawer,
	DrawerContent,
	DrawerForm,
	DrawerHeader,
	DrawerTitle,
} from '~/components/ui/drawer';
import { BodySection, FooterSection } from './_drawer-crossfile-parts-fixture';

export const CrossFileDivAboveFormDrawer = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<Drawer open>
		<DrawerContent data-testid="r12-crossfile-div-above-form">
			<DrawerHeader>
				<DrawerTitle />
			</DrawerHeader>
			<div className="p-4">
				<DrawerForm methods={methods}>
					<BodySection />
					<FooterSection />
				</DrawerForm>
			</div>
		</DrawerContent>
	</Drawer>
);
`;

// The CORRECT cross-file arrangement: the same helpers, the form directly
// under the surface. The parts the helpers produce must resolve with an
// empty chain — this must stay green.
const TEMPORARY_CROSSFILE_DIRECT_FORM_FILE =
	'src/components/ui/_drawer-surface-crossfile-direct-form-fixture.tsx';
const TEMPORARY_CROSSFILE_DIRECT_FORM_PATH = fixturePath(
	TEMPORARY_CROSSFILE_DIRECT_FORM_FILE,
);
const TEMPORARY_CROSSFILE_DIRECT_FORM_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import {
	Drawer,
	DrawerContent,
	DrawerForm,
	DrawerHeader,
	DrawerTitle,
} from '~/components/ui/drawer';
import { BodySection, FooterSection } from './_drawer-crossfile-parts-fixture';

export const CrossFileDirectFormDrawer = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<Drawer open>
		<DrawerContent data-testid="r12-crossfile-direct-form">
			<DrawerHeader>
				<DrawerTitle />
			</DrawerHeader>
			<DrawerForm methods={methods}>
				<BodySection />
				<FooterSection />
			</DrawerForm>
		</DrawerContent>
	</Drawer>
);
`;

// Round 11's MINOR 4: a `Suspense` imported from a NON-react module must not
// be treated as React's nodeless wrapper — it renders a real layout box, so
// the box's div is an element between the form and the part. These pin the
// two `isNodelessReactWrapper` conditions round 11 showed were still
// fail-open: the named-import module check (`getModuleSpecifierValue() ===
// 'react'`) and the member-expression branch (`resolveNamespaceImport(...)
// === 'react'`). The positive control — a REAL `React.Suspense` reached as
// `<React.Suspense>` — stays transparent.
const TEMPORARY_NONREACT_SUSPENSE_MODULE_FILE =
	'src/components/ui/_r12-nonreact-suspense-box-fixture.tsx';
const TEMPORARY_NONREACT_SUSPENSE_MODULE_PATH = fixturePath(
	TEMPORARY_NONREACT_SUSPENSE_MODULE_FILE,
);
const TEMPORARY_NONREACT_SUSPENSE_MODULE_SOURCE = `import type { ReactNode } from 'react';

export const Suspense = ({ children }: { children: ReactNode }) => (
	<div className="p-4">{children}</div>
);
`;
const TEMPORARY_NAMED_NONREACT_SUSPENSE_FILE =
	'src/components/ui/_drawer-surface-named-nonreact-suspense-fixture.tsx';
const TEMPORARY_NAMED_NONREACT_SUSPENSE_PATH = fixturePath(
	TEMPORARY_NAMED_NONREACT_SUSPENSE_FILE,
);
const TEMPORARY_NAMED_NONREACT_SUSPENSE_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerFooter, DrawerForm } from '~/components/ui/drawer';
import { Suspense } from './_r12-nonreact-suspense-box-fixture';

export const NamedNonReactSuspenseDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<DrawerForm methods={methods}>
		<Suspense>
			<DrawerBody />
		</Suspense>
		<DrawerFooter>
			<button type="submit" />
		</DrawerFooter>
	</DrawerForm>
);
`;
const TEMPORARY_NS_MEMBER_NONREACT_SUSPENSE_FILE =
	'src/components/ui/_drawer-surface-ns-member-nonreact-suspense-fixture.tsx';
const TEMPORARY_NS_MEMBER_NONREACT_SUSPENSE_PATH = fixturePath(
	TEMPORARY_NS_MEMBER_NONREACT_SUSPENSE_FILE,
);
const TEMPORARY_NS_MEMBER_NONREACT_SUSPENSE_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerFooter, DrawerForm } from '~/components/ui/drawer';
import * as Layout from './_r12-nonreact-suspense-box-fixture';

export const NsMemberNonReactSuspenseDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<DrawerForm methods={methods}>
		<Layout.Suspense>
			<DrawerBody />
		</Layout.Suspense>
		<DrawerFooter>
			<button type="submit" />
		</DrawerFooter>
	</DrawerForm>
);
`;
const TEMPORARY_REACT_NS_SUSPENSE_FILE =
	'src/components/ui/_drawer-surface-react-ns-suspense-fixture.tsx';
const TEMPORARY_REACT_NS_SUSPENSE_PATH = fixturePath(
	TEMPORARY_REACT_NS_SUSPENSE_FILE,
);
const TEMPORARY_REACT_NS_SUSPENSE_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import * as React from 'react';
import { DrawerBody, DrawerFooter, DrawerForm } from '~/components/ui/drawer';

export const ReactNsSuspenseDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<DrawerForm methods={methods}>
		<React.Suspense fallback={null}>
			<DrawerBody />
		</React.Suspense>
		<DrawerFooter>
			<button type="submit" />
		</DrawerFooter>
	</DrawerForm>
);
`;

// The FORM extracted into a CROSS-FILE helper (round 11's I1 one hop
// further): the call site has no `DrawerForm` tag of its own, so
// formBearing must come from the walk, and the div above the helper must
// redden through the expansion — the same #990 break, one file away.
const TEMPORARY_CROSSFILE_FORM_HELPER_FILE =
	'src/components/ui/_drawer-crossfile-form-helper-fixture.tsx';
const TEMPORARY_CROSSFILE_FORM_HELPER_PATH = fixturePath(
	TEMPORARY_CROSSFILE_FORM_HELPER_FILE,
);
const TEMPORARY_CROSSFILE_FORM_HELPER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerFooter, DrawerForm } from '~/components/ui/drawer';

export const FormSection = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<DrawerForm methods={methods}>
		<DrawerBody />
		<DrawerFooter>
			<button type="submit" />
		</DrawerFooter>
	</DrawerForm>
);
`;
const TEMPORARY_CROSSFILE_FORM_DIV_ABOVE_FILE =
	'src/components/ui/_drawer-surface-crossfile-form-div-above-fixture.tsx';
const TEMPORARY_CROSSFILE_FORM_DIV_ABOVE_PATH = fixturePath(
	TEMPORARY_CROSSFILE_FORM_DIV_ABOVE_FILE,
);
const TEMPORARY_CROSSFILE_FORM_DIV_ABOVE_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '~/components/ui/drawer';
import { FormSection } from './_drawer-crossfile-form-helper-fixture';

export const CrossFileFormDivAboveDrawer = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<Drawer open>
		<DrawerContent data-testid="r12-crossfile-form-div-above">
			<DrawerHeader>
				<DrawerTitle />
			</DrawerHeader>
			<div className="p-4">
				<FormSection methods={methods} />
			</div>
		</DrawerContent>
	</Drawer>
);
`;
const TEMPORARY_CROSSFILE_FORM_DIRECT_FILE =
	'src/components/ui/_drawer-surface-crossfile-form-direct-fixture.tsx';
const TEMPORARY_CROSSFILE_FORM_DIRECT_PATH = fixturePath(
	TEMPORARY_CROSSFILE_FORM_DIRECT_FILE,
);
const TEMPORARY_CROSSFILE_FORM_DIRECT_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '~/components/ui/drawer';
import { FormSection } from './_drawer-crossfile-form-helper-fixture';

export const CrossFileFormDirectDrawer = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<Drawer open>
		<DrawerContent data-testid="r12-crossfile-form-direct">
			<DrawerHeader>
				<DrawerTitle />
			</DrawerHeader>
			<FormSection methods={methods} />
		</DrawerContent>
	</Drawer>
);
`;

// A helper whose OWN body wraps the part in an element: the div sits inside
// the definition, so only the expansion can see it — the chain must carry it
// and redden (the round-8 "a helper that wraps the part in a real element IS
// discovered and judged" contract, enforced across the file boundary).
const TEMPORARY_HELPER_DIV_WRAPPED_PART_FILE =
	'src/components/ui/_drawer-surface-helper-div-wrapped-part-fixture.tsx';
const TEMPORARY_HELPER_DIV_WRAPPED_PART_PATH = fixturePath(
	TEMPORARY_HELPER_DIV_WRAPPED_PART_FILE,
);
const TEMPORARY_HELPER_DIV_WRAPPED_PART_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerFooter, DrawerForm } from '~/components/ui/drawer';

const BodySection = () => (
	<div className="p-4">
		<DrawerBody />
	</div>
);

export const HelperDivWrappedPartDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<DrawerForm methods={methods}>
		<BodySection />
		<DrawerFooter>
			<button type="submit" />
		</DrawerFooter>
	</DrawerForm>
);
`;

// A div-passthrough helper: `<Box>{children}</Box>`. Parts passed INTO the
// helper land behind the div at runtime — the `{children}` marker must hand
// the reference's own JSX children to the walk with the div on their chain.
const TEMPORARY_DIV_PASSTHROUGH_HELPER_FILE =
	'src/components/ui/_drawer-surface-div-passthrough-helper-fixture.tsx';
const TEMPORARY_DIV_PASSTHROUGH_HELPER_PATH = fixturePath(
	TEMPORARY_DIV_PASSTHROUGH_HELPER_FILE,
);
const TEMPORARY_DIV_PASSTHROUGH_HELPER_SOURCE = `import type { ReactNode } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerFooter, DrawerForm } from '~/components/ui/drawer';

const Box = ({ children }: { children: ReactNode }) => (
	<div className="p-4">{children}</div>
);

export const DivPassthroughHelperDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<DrawerForm methods={methods}>
		<Box>
			<DrawerBody />
		</Box>
		<DrawerFooter>
			<button type="submit" />
		</DrawerFooter>
	</DrawerForm>
);
`;

// The positive control: a FRAGMENT passthrough helper is transparent — parts
// passed into it stay direct children of the form.
const TEMPORARY_FRAGMENT_PASSTHROUGH_HELPER_FILE =
	'src/components/ui/_drawer-surface-fragment-passthrough-helper-fixture.tsx';
const TEMPORARY_FRAGMENT_PASSTHROUGH_HELPER_PATH = fixturePath(
	TEMPORARY_FRAGMENT_PASSTHROUGH_HELPER_FILE,
);
const TEMPORARY_FRAGMENT_PASSTHROUGH_HELPER_SOURCE = `import type { ReactNode } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerFooter, DrawerForm } from '~/components/ui/drawer';

const Wrap = ({ children }: { children: ReactNode }) => <>{children}</>;

export const FragmentPassthroughHelperDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<DrawerForm methods={methods}>
		<Wrap>
			<DrawerBody />
		</Wrap>
		<DrawerFooter>
			<button type="submit" />
		</DrawerFooter>
	</DrawerForm>
);
`;

// A `{children}` passthrough as a DIRECT child of the surface or the form is
// unverifiable: the parts would arrive at runtime from the caller, and the
// scan has no way to check their geometry — fail loud, per the round-12
// boundary. Same for a passthrough inside an element of the anchored
// subtree (the parts would land inside that element).
const TEMPORARY_CHILDREN_IN_FORM_FILE =
	'src/components/ui/_drawer-surface-children-in-form-fixture.tsx';
const TEMPORARY_CHILDREN_IN_FORM_PATH = fixturePath(
	TEMPORARY_CHILDREN_IN_FORM_FILE,
);
const TEMPORARY_CHILDREN_IN_FORM_SOURCE = `import type { ReactNode } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerForm } from '~/components/ui/drawer';

export const ChildrenInFormDrawerFixture = ({
	methods,
	children,
}: {
	methods: UseFormReturn<FieldValues>;
	children: ReactNode;
}) => <DrawerForm methods={methods}>{children}</DrawerForm>;
`;
const TEMPORARY_CHILDREN_IN_SURFACE_ELEMENT_FILE =
	'src/components/ui/_drawer-surface-children-in-surface-element-fixture.tsx';
const TEMPORARY_CHILDREN_IN_SURFACE_ELEMENT_PATH = fixturePath(
	TEMPORARY_CHILDREN_IN_SURFACE_ELEMENT_FILE,
);
const TEMPORARY_CHILDREN_IN_SURFACE_ELEMENT_SOURCE = `import type { ReactNode } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import {
	Drawer,
	DrawerContent,
	DrawerForm,
	DrawerHeader,
	DrawerTitle,
} from '~/components/ui/drawer';

export const ChildrenInSurfaceElementDrawerFixture = ({
	methods,
	children,
}: {
	methods: UseFormReturn<FieldValues>;
	children: ReactNode;
}) => (
	<Drawer open>
		<DrawerContent data-testid="r12-children-in-surface-element">
			<DrawerHeader>
				<DrawerTitle />
			</DrawerHeader>
			<DrawerForm methods={methods}>
				<div className="p-4">{children}</div>
			</DrawerForm>
		</DrawerContent>
	</Drawer>
);
`;

// Formless drawers that put DrawerBody + DrawerFooter straight into the
// `.publy-drawer` surface instead of into the drawer-owned form. They are
// deliberately not in DRAWER_FORM_CALL_SITES: the e2e spec and the render map
// measure the form geometry, which a formless drawer does not have.
const FORM_LESS_DRAWER_SURFACE_FILES = [
	'src/components/app-shell/app-shell.tsx',
	'src/components/marketing/cookie-prefs-drawer.tsx',
	'src/components/marketing/marketing-mobile-nav.tsx',
	'src/routes/authed/staff/audit-logs/_audit-log-export-drawer.tsx',
	'src/routes/authed/staff/tenants/$tenantId/profiles/$profileId/_assign-members-drawer.tsx',
] as const;

// ---------------------------------------------------------------------------
// Round 14 fixtures.
//
// BLOCKER 1 (review-r13): the walk could only begin at tags whose local
// binding RESOLVED to the drawer module, and a local declaration was a
// dead end — `const Surface = DrawerContent; const Form = DrawerForm;
// const Body = DrawerBody; const Footer = DrawerFooter;` moved every
// marker behind a local name and the exact #990 break walked through
// 43/43 green. The entry point now resolves identity chains, same-symbol
// conditionals and (through the wrapper rule) mixed conditionals and
// reassigned `let`s. Each shape below gets a broken fixture and a clean
// control.
//
// IMPORTANT 2: function-block parsing read only top-level returns, so an
// `if (true) { return <div><Body/></div>; } return <DrawerBody />;`
// substituted the unreachable clean return for the one actually taken.
// The collector now reads every return that can execute, and a return
// that cannot be extracted fails loud.
//
// IMPORTANT 3: the two round-12 cross-file-part tests could not fail —
// the negative carried the div at the call site and the positive only
// asserted green. The pair below puts the div INSIDE the helper and keeps
// the call-site link clean, so both tests die when the imported helper
// bodies resolve to nothing.
// ---------------------------------------------------------------------------

// The exact round-13 reproduction: every drawer marker behind a local
// identity alias, with the #990 `<div>` between the surface and the form.
const TEMPORARY_ALIASED_ENTIRE_DRAWER_FILE =
	'src/components/ui/_drawer-surface-aliased-entire-fixture.tsx';
const TEMPORARY_ALIASED_ENTIRE_DRAWER_PATH = fixturePath(
	TEMPORARY_ALIASED_ENTIRE_DRAWER_FILE,
);
const TEMPORARY_ALIASED_ENTIRE_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import {
	Drawer,
	DrawerBody,
	DrawerContent,
	DrawerFooter,
	DrawerForm,
	DrawerHeader,
	DrawerTitle,
} from '~/components/ui/drawer';

const Surface = DrawerContent;
const Form = DrawerForm;
const Body = DrawerBody;
const Footer = DrawerFooter;

export const AliasedEntireDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<Drawer open>
		<Surface data-testid="r14-aliased-entire">
			<DrawerHeader>
				<DrawerTitle />
			</DrawerHeader>
			<div className="p-4">
				<Form methods={methods}>
					<Body />
					<Footer>
						<button type="submit" />
					</Footer>
				</Form>
			</div>
		</Surface>
	</Drawer>
);
`;

// The clean control for the aliased shape — no intermediate element, so
// the same aliases must stay green.
const TEMPORARY_ALIASED_ENTIRE_CLEAN_DRAWER_FILE =
	'src/components/ui/_drawer-surface-aliased-entire-clean-fixture.tsx';
const TEMPORARY_ALIASED_ENTIRE_CLEAN_DRAWER_PATH = fixturePath(
	TEMPORARY_ALIASED_ENTIRE_CLEAN_DRAWER_FILE,
);
const TEMPORARY_ALIASED_ENTIRE_CLEAN_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import {
	Drawer,
	DrawerBody,
	DrawerContent,
	DrawerFooter,
	DrawerForm,
	DrawerHeader,
	DrawerTitle,
} from '~/components/ui/drawer';

const Surface = DrawerContent;
const Form = DrawerForm;
const Body = DrawerBody;
const Footer = DrawerFooter;

export const AliasedEntireCleanDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<Drawer open>
		<Surface data-testid="r14-aliased-clean">
			<DrawerHeader>
				<DrawerTitle />
			</DrawerHeader>
			<Form methods={methods}>
				<Body />
				<Footer>
					<button type="submit" />
				</Footer>
			</Form>
		</Surface>
	</Drawer>
);
`;

// One hop deeper: an identity chain through a second local name —
// `const Surface2 = Surface` must follow to `DrawerContent`, not stop at
// the first local hop.
const TEMPORARY_ALIASED_CHAIN_DRAWER_FILE =
	'src/components/ui/_drawer-surface-aliased-chain-fixture.tsx';
const TEMPORARY_ALIASED_CHAIN_DRAWER_PATH = fixturePath(
	TEMPORARY_ALIASED_CHAIN_DRAWER_FILE,
);
const TEMPORARY_ALIASED_CHAIN_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import {
	Drawer,
	DrawerBody,
	DrawerContent,
	DrawerFooter,
	DrawerForm,
	DrawerHeader,
	DrawerTitle,
} from '~/components/ui/drawer';

const Surface = DrawerContent;
const Form = DrawerForm;
const Body = DrawerBody;
const Footer = DrawerFooter;
const Surface2 = Surface;
const Form2 = Form;
const Body2 = Body;
const Footer2 = Footer;

export const AliasedChainDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<Drawer open>
		<Surface2 data-testid="r14-aliased-chain">
			<DrawerHeader>
				<DrawerTitle />
			</DrawerHeader>
			<div className="p-4">
				<Form2 methods={methods}>
					<Body2 />
					<Footer2>
						<button type="submit" />
					</Footer2>
				</Form2>
			</div>
		</Surface2>
	</Drawer>
);
`;

// A conditional assignment whose branches are the SAME drawer symbol is
// statically an alias — `open ? DrawerContent : DrawerContent` is always
// the surface, and the div above the form must redden.
const TEMPORARY_CONDITIONAL_SAME_SYMBOL_DRAWER_FILE =
	'src/components/ui/_drawer-surface-conditional-same-symbol-fixture.tsx';
const TEMPORARY_CONDITIONAL_SAME_SYMBOL_DRAWER_PATH = fixturePath(
	TEMPORARY_CONDITIONAL_SAME_SYMBOL_DRAWER_FILE,
);
const TEMPORARY_CONDITIONAL_SAME_SYMBOL_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import {
	Drawer,
	DrawerBody,
	DrawerContent,
	DrawerFooter,
	DrawerForm,
	DrawerHeader,
	DrawerTitle,
} from '~/components/ui/drawer';

const Surface = isOpen ? DrawerContent : DrawerContent;
const Form = DrawerForm;
const Body = DrawerBody;
const Footer = DrawerFooter;

export const ConditionalSameSymbolDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<Drawer open>
		<Surface data-testid="r14-conditional-same-symbol">
			<DrawerHeader>
				<DrawerTitle />
			</DrawerHeader>
			<div className="p-4">
				<Form methods={methods}>
					<Body />
					<Footer>
						<button type="submit" />
					</Footer>
				</Form>
			</div>
		</Surface>
	</Drawer>
);
`;

// A conditional whose branches DISAGREE — one the drawer form, one not —
// is not statically decidable: the parts under it must redden through the
// wrapper rule (UNVERIFIABLE is 'other'), never resolve to the drawer
// form.
const TEMPORARY_CONDITIONAL_MIXED_FORM_DRAWER_FILE =
	'src/components/ui/_drawer-surface-conditional-mixed-form-fixture.tsx';
const TEMPORARY_CONDITIONAL_MIXED_FORM_DRAWER_PATH = fixturePath(
	TEMPORARY_CONDITIONAL_MIXED_FORM_DRAWER_FILE,
);
const TEMPORARY_CONDITIONAL_MIXED_FORM_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { Form as PlainForm } from '~/components/field';
import { DrawerBody, DrawerFooter, DrawerForm } from '~/components/ui/drawer';

const Form = isOpen ? DrawerForm : PlainForm;

export const ConditionalMixedFormDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<Form methods={methods}>
		<DrawerBody />
		<DrawerFooter>
			<button type="submit" />
		</DrawerFooter>
	</Form>
);
`;

// A `let` whose binding is reassigned after initialization renders a
// different component at runtime — the alias the initializer started from
// is not the binding the JSX tag sees, so the file is unverifiable. Round
// 15's IMPORTANT 4: this fixture used to carry a `<div>` between the
// surface and the form, so the anchored walk reddened it on the div alone
// and the reassignment rule was not what the assertion measured. The div is
// gone — the ONLY mechanism that can redden this file is the reassignment
// (kill isReassigned and the file goes green).
const TEMPORARY_REASSIGNED_FORM_DRAWER_FILE =
	'src/components/ui/_drawer-surface-reassigned-form-fixture.tsx';
const TEMPORARY_REASSIGNED_FORM_DRAWER_PATH = fixturePath(
	TEMPORARY_REASSIGNED_FORM_DRAWER_FILE,
);
const TEMPORARY_REASSIGNED_FORM_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import {
	Drawer,
	DrawerBody,
	DrawerContent,
	DrawerFooter,
	DrawerForm,
	DrawerHeader,
	DrawerTitle,
} from '~/components/ui/drawer';

const Surface = DrawerContent;
const Body = DrawerBody;
const Footer = DrawerFooter;
let Form = DrawerForm;
if (someCondition) {
	Form = OtherForm;
}

export const ReassignedFormDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<Drawer open>
		<Surface data-testid="r14-reassigned-form">
			<DrawerHeader>
				<DrawerTitle />
			</DrawerHeader>
			<Form methods={methods}>
				<Body />
				<Footer>
					<button type="submit" />
				</Footer>
			</Form>
		</Surface>
	</Drawer>
);
`;

// IMPORTANT 2 — the exact round-13 probe: the executing nested return
// wraps the body in a div; the top-level return it hid behind was clean.
// The broken return lives in a HELPER FILE: a same-file div-wrapped part
// is caught by the legacy wrapper pass regardless of which return the
// function-block parser reads, but the call site below has a clean
// surface-to-form link and no part tags of its own — only the expansion
// through the return collector can redden it, so these fixtures die when
// nested returns stop being read.
const TEMPORARY_NESTED_RETURN_PARTS_FILE =
	'src/components/ui/_drawer-nested-return-parts-fixture.tsx';
const TEMPORARY_NESTED_RETURN_PARTS_PATH = fixturePath(
	TEMPORARY_NESTED_RETURN_PARTS_FILE,
);
const TEMPORARY_NESTED_RETURN_PARTS_SOURCE = `import { DrawerBody } from '~/components/ui/drawer';

export const BranchBody = () => {
	if (true) {
		return (
			<div className="p-4">
				<DrawerBody />
			</div>
		);
	}
	return <DrawerBody />;
};
`;
const TEMPORARY_NESTED_RETURN_DIV_DRAWER_FILE =
	'src/components/ui/_drawer-surface-nested-return-div-fixture.tsx';
const TEMPORARY_NESTED_RETURN_DIV_DRAWER_PATH = fixturePath(
	TEMPORARY_NESTED_RETURN_DIV_DRAWER_FILE,
);
const TEMPORARY_NESTED_RETURN_DIV_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerFooter, DrawerForm } from '~/components/ui/drawer';
import { BranchBody } from './_drawer-nested-return-parts-fixture';

export const NestedReturnDivDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<DrawerForm methods={methods}>
		<BranchBody />
		<DrawerFooter>
			<button type="submit" />
		</DrawerFooter>
	</DrawerForm>
);
`;

// Same shape with a NON-literal condition: both branches can execute, so
// the broken nested return must still be read — never silently dropped.
const TEMPORARY_CONDITIONED_NESTED_RETURN_PARTS_FILE =
	'src/components/ui/_drawer-conditioned-nested-return-parts-fixture.tsx';
const TEMPORARY_CONDITIONED_NESTED_RETURN_PARTS_PATH = fixturePath(
	TEMPORARY_CONDITIONED_NESTED_RETURN_PARTS_FILE,
);
const TEMPORARY_CONDITIONED_NESTED_RETURN_PARTS_SOURCE = `import { DrawerBody } from '~/components/ui/drawer';

export const BranchBody = () => {
	if (shouldSplit) {
		return (
			<div className="p-4">
				<DrawerBody />
			</div>
		);
	}
	return <DrawerBody />;
};
`;
const TEMPORARY_CONDITIONED_NESTED_RETURN_DRAWER_FILE =
	'src/components/ui/_drawer-surface-conditioned-nested-return-fixture.tsx';
const TEMPORARY_CONDITIONED_NESTED_RETURN_DRAWER_PATH = fixturePath(
	TEMPORARY_CONDITIONED_NESTED_RETURN_DRAWER_FILE,
);
const TEMPORARY_CONDITIONED_NESTED_RETURN_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerFooter, DrawerForm } from '~/components/ui/drawer';
import { BranchBody } from './_drawer-conditioned-nested-return-parts-fixture';

export const ConditionedNestedReturnDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<DrawerForm methods={methods}>
		<BranchBody />
		<DrawerFooter>
			<button type="submit" />
		</DrawerFooter>
	</DrawerForm>
);
`;

// The clean control for multi-return bodies: an idiomatic early-return
// (`if (isEmpty) return null;` then the real body) stays green — the
// union of both return paths is statically clean.
const TEMPORARY_EARLY_RETURN_PARTS_FILE =
	'src/components/ui/_drawer-early-return-parts-fixture.tsx';
const TEMPORARY_EARLY_RETURN_PARTS_PATH = fixturePath(
	TEMPORARY_EARLY_RETURN_PARTS_FILE,
);
const TEMPORARY_EARLY_RETURN_PARTS_SOURCE = `import { DrawerBody } from '~/components/ui/drawer';

export const EarlyReturnBody = ({ isEmpty }: { isEmpty: boolean }) => {
	if (isEmpty) {
		return null;
	}
	return <DrawerBody />;
};
`;
const TEMPORARY_EARLY_RETURN_CLEAN_DRAWER_FILE =
	'src/components/ui/_drawer-surface-early-return-clean-fixture.tsx';
const TEMPORARY_EARLY_RETURN_CLEAN_DRAWER_PATH = fixturePath(
	TEMPORARY_EARLY_RETURN_CLEAN_DRAWER_FILE,
);
const TEMPORARY_EARLY_RETURN_CLEAN_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerFooter, DrawerForm } from '~/components/ui/drawer';
import { EarlyReturnBody } from './_drawer-early-return-parts-fixture';

export const EarlyReturnCleanDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<DrawerForm methods={methods}>
		<EarlyReturnBody isEmpty={false} />
		<DrawerFooter>
			<button type="submit" />
		</DrawerFooter>
	</DrawerForm>
);
`;

// The literal-condition precision control: the executing branch is clean
// and the branch behind `if (true)` is DEAD — but it is still a violation
// in the source. Only the literal evaluation keeps the union from
// reddening the call site with a return that can never execute.
const TEMPORARY_LITERAL_DEAD_BRANCH_PARTS_FILE =
	'src/components/ui/_drawer-literal-dead-branch-parts-fixture.tsx';
const TEMPORARY_LITERAL_DEAD_BRANCH_PARTS_PATH = fixturePath(
	TEMPORARY_LITERAL_DEAD_BRANCH_PARTS_FILE,
);
const TEMPORARY_LITERAL_DEAD_BRANCH_PARTS_SOURCE = `import { DrawerBody } from '~/components/ui/drawer';

export const BranchBody = () => {
	if (true) {
		return <DrawerBody />;
	}
	return (
		<div className="p-4">
			<DrawerBody />
		</div>
	);
};
`;
const TEMPORARY_LITERAL_DEAD_BRANCH_DRAWER_FILE =
	'src/components/ui/_drawer-surface-literal-dead-branch-fixture.tsx';
const TEMPORARY_LITERAL_DEAD_BRANCH_DRAWER_PATH = fixturePath(
	TEMPORARY_LITERAL_DEAD_BRANCH_DRAWER_FILE,
);
const TEMPORARY_LITERAL_DEAD_BRANCH_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerFooter, DrawerForm } from '~/components/ui/drawer';
import { BranchBody } from './_drawer-literal-dead-branch-parts-fixture';

export const LiteralDeadBranchDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<DrawerForm methods={methods}>
		<BranchBody />
		<DrawerFooter>
			<button type="submit" />
		</DrawerFooter>
	</DrawerForm>
);
`;

// IMPORTANT 3 — the div lives INSIDE the helper file. The call site has a
// clean surface-to-form link, so ONLY the expansion can see the break.
const TEMPORARY_CROSSFILE_DIV_IN_HELPER_FILE =
	'src/components/ui/_drawer-crossfile-div-in-helper-fixture.tsx';
const TEMPORARY_CROSSFILE_DIV_IN_HELPER_PATH = fixturePath(
	TEMPORARY_CROSSFILE_DIV_IN_HELPER_FILE,
);
const TEMPORARY_CROSSFILE_DIV_IN_HELPER_SOURCE = `import { DrawerBody, DrawerFooter } from '~/components/ui/drawer';

export const DivWrappedBodySection = () => (
	<div className="p-4">
		<DrawerBody />
	</div>
);
export const DivWrappedFooterSection = () => (
	<DrawerFooter>
		<button type="submit" />
	</DrawerFooter>
);
`;
const TEMPORARY_CROSSFILE_DIV_IN_HELPER_CALL_SITE_FILE =
	'src/components/ui/_drawer-surface-crossfile-div-in-helper-fixture.tsx';
const TEMPORARY_CROSSFILE_DIV_IN_HELPER_CALL_SITE_PATH = fixturePath(
	TEMPORARY_CROSSFILE_DIV_IN_HELPER_CALL_SITE_FILE,
);
const TEMPORARY_CROSSFILE_DIV_IN_HELPER_CALL_SITE_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import {
	Drawer,
	DrawerContent,
	DrawerForm,
	DrawerHeader,
	DrawerTitle,
} from '~/components/ui/drawer';
import {
	DivWrappedBodySection,
	DivWrappedFooterSection,
} from './_drawer-crossfile-div-in-helper-fixture';

export const CrossFileDivInHelperDrawer = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<Drawer open>
		<DrawerContent data-testid="r14-crossfile-div-in-helper">
			<DrawerHeader>
				<DrawerTitle />
			</DrawerHeader>
			<DrawerForm methods={methods}>
				<DivWrappedBodySection />
				<DivWrappedFooterSection />
			</DrawerForm>
		</DrawerContent>
	</Drawer>
);
`;

// The clean counterpart of the pair: every section in the helper is
// chain-preserving, and the FORM also comes from the helper — so the
// call site's formBearing verdict depends on the expansion too, and the
// positive dies with the same mutation as the negative.
const TEMPORARY_CROSSFILE_CLEAN_SECTIONS_FILE =
	'src/components/ui/_drawer-crossfile-clean-sections-fixture.tsx';
const TEMPORARY_CROSSFILE_CLEAN_SECTIONS_PATH = fixturePath(
	TEMPORARY_CROSSFILE_CLEAN_SECTIONS_FILE,
);
const TEMPORARY_CROSSFILE_CLEAN_SECTIONS_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerFooter, DrawerForm } from '~/components/ui/drawer';

export const CleanBodySection = () => <DrawerBody />;
export const CleanFooterSection = () => (
	<DrawerFooter>
		<button type="submit" />
	</DrawerFooter>
);

export const CleanFormSection = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<DrawerForm methods={methods}>
		<CleanBodySection />
		<CleanFooterSection />
	</DrawerForm>
);
`;
const TEMPORARY_CROSSFILE_CLEAN_SECTIONS_CALL_SITE_FILE =
	'src/components/ui/_drawer-surface-crossfile-clean-sections-fixture.tsx';
const TEMPORARY_CROSSFILE_CLEAN_SECTIONS_CALL_SITE_PATH = fixturePath(
	TEMPORARY_CROSSFILE_CLEAN_SECTIONS_CALL_SITE_FILE,
);
const TEMPORARY_CROSSFILE_CLEAN_SECTIONS_CALL_SITE_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
} from '~/components/ui/drawer';
import { CleanFormSection } from './_drawer-crossfile-clean-sections-fixture';

export const CrossFileCleanSectionsDrawer = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<Drawer open>
		<DrawerContent data-testid="r14-crossfile-clean-sections">
			<DrawerHeader>
				<DrawerTitle />
			</DrawerHeader>
			<CleanFormSection methods={methods} />
		</DrawerContent>
	</Drawer>
);
`;

// A file-level unverifiable tag OUTSIDE the anchored drawer subtree: the
// drawer itself is clean, but the file also renders a locally-declared
// component whose binding cannot be classified (`const Mystery =
// getSurface();`) — it could be a hidden drawer marker, so the FILE must
// redden even though no anchor walk reaches it.
const TEMPORARY_UNVERIFIABLE_TAG_DRAWER_FILE =
	'src/components/ui/_drawer-surface-unverifiable-tag-fixture.tsx';
const TEMPORARY_UNVERIFIABLE_TAG_DRAWER_PATH = fixturePath(
	TEMPORARY_UNVERIFIABLE_TAG_DRAWER_FILE,
);
const TEMPORARY_UNVERIFIABLE_TAG_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import {
	Drawer,
	DrawerBody,
	DrawerContent,
	DrawerFooter,
	DrawerForm,
	DrawerHeader,
	DrawerTitle,
} from '~/components/ui/drawer';

const Mystery = getSurface();

export const UnverifiableTagDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<Drawer open>
		<DrawerContent data-testid="r14-unverifiable-tag">
			<DrawerHeader>
				<DrawerTitle />
			</DrawerHeader>
			<DrawerForm methods={methods}>
				<DrawerBody />
				<DrawerFooter>
					<button type="submit" />
				</DrawerFooter>
			</DrawerForm>
		</DrawerContent>
		<Mystery />
	</Drawer>
);
`;

// A namespace member reached through a LOCAL alias of the namespace
// import: `const D = Drawer;` + `<D.DrawerContent>...` is the same
// identity chain as the named-alias shape, one spelling over.
const TEMPORARY_NS_BASE_ALIAS_DRAWER_FILE =
	'src/components/ui/_drawer-surface-ns-base-alias-fixture.tsx';
const TEMPORARY_NS_BASE_ALIAS_DRAWER_PATH = fixturePath(
	TEMPORARY_NS_BASE_ALIAS_DRAWER_FILE,
);
const TEMPORARY_NS_BASE_ALIAS_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import * as Drawer from '~/components/ui/drawer';

const D = Drawer;

export const NsBaseAliasDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<D.Drawer open>
		<D.DrawerContent data-testid="r14-ns-base-alias">
			<D.DrawerHeader>
				<D.DrawerTitle />
			</D.DrawerHeader>
			<div className="p-4">
				<D.DrawerForm methods={methods}>
					<D.DrawerBody />
					<D.DrawerFooter>
						<button type="submit" />
					</D.DrawerFooter>
				</D.DrawerForm>
			</div>
		</D.DrawerContent>
	</D.Drawer>
);
`;

// ---------------------------------------------------------------------------
// Round 16 fixtures.
//
// Round 15's review (`.dump/review-r15.md`) found the resolution walk was
// still keyed on which SPELLINGS of an alias the matcher happened to
// enumerate: an object-literal component map and a cross-file
// `export const X = DrawerX` shim moved every drawer marker behind a
// binding the matcher classified as "definitely not the drawer module",
// and the exact #990 defect shipped 58/58 green. Round 16 replaces the
// matcher with TypeScript's own symbol graph (see the resolution block
// below), so each reviewer shape below is now resolved to the drawer
// module's declaration — and each shape gets a broken fixture and a
// control, as before.
//
// IMPORTANT 3 (the round-14 boundary that reproduced): a file whose every
// drawer marker is an opaque local binding (`const Surface =
// pick(DrawerContent)`) imports the drawer module and is therefore a
// drawer file — it is discovered and reddens. IMPORTANT 5 (the false
// positive that would block real work): a runtime component factory
// (`lazy(() => import('./chart'))`) is a real local component, so a
// structurally perfect drawer that merely contains one stays green — and
// a factory whose loader IS a drawer symbol (`lazy(() => DrawerBody)`)
// resolves to it, because the factory adds no DOM node.
// ---------------------------------------------------------------------------

// BLOCKER 1 (review-r15), verbatim: the drawer module's exports spelled
// through a local OBJECT-LITERAL component map. The member lookup must
// resolve the property's initializer to the drawer module — the #990 div
// between the surface and the form reddens only then.
const TEMPORARY_OBJECT_NS_DRAWER_FILE =
	'src/components/ui/_drawer-surface-object-ns-fixture.tsx';
const TEMPORARY_OBJECT_NS_DRAWER_PATH = fixturePath(
	TEMPORARY_OBJECT_NS_DRAWER_FILE,
);
const TEMPORARY_OBJECT_NS_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import {
	DrawerBody,
	DrawerContent,
	DrawerFooter,
	DrawerForm,
} from '~/components/ui/drawer';

const Parts = {
	Surface: DrawerContent,
	Form: DrawerForm,
	Body: DrawerBody,
	Footer: DrawerFooter,
};

export const ObjectNsDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<Parts.Surface data-testid="r16-object-ns">
		<div className="p-4">
			<Parts.Form methods={methods}>
				<Parts.Body />
				<Parts.Footer>
					<button type="submit" />
				</Parts.Footer>
			</Parts.Form>
		</div>
	</Parts.Surface>
);
`;

// BLOCKER 2 (review-r15), verbatim: the drawer exports re-exported by a
// CROSS-FILE shim (`export const Surface = DrawerContent;`) and consumed at
// a call site. The identity chain must follow the export to the shim's
// initializer and from there to the drawer module — across the file
// boundary.
const TEMPORARY_SHIM_FILE = 'src/components/ui/_drawer-r16-shim-fixture.tsx';
const TEMPORARY_SHIM_PATH = fixturePath(TEMPORARY_SHIM_FILE);
const TEMPORARY_SHIM_SOURCE = `import {
	DrawerBody,
	DrawerContent,
	DrawerFooter,
	DrawerForm,
} from '~/components/ui/drawer';

export const Surface = DrawerContent;
export const Form = DrawerForm;
export const Body = DrawerBody;
export const Footer = DrawerFooter;
`;
const TEMPORARY_SHIM_CALL_SITE_FILE =
	'src/components/ui/_drawer-surface-shim-call-site-fixture.tsx';
const TEMPORARY_SHIM_CALL_SITE_PATH = fixturePath(
	TEMPORARY_SHIM_CALL_SITE_FILE,
);
const TEMPORARY_SHIM_CALL_SITE_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { Body, Footer, Form, Surface } from './_drawer-r16-shim-fixture';

export const ShimCallSiteDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<Surface data-testid="r16-shim-call-site">
		<div className="p-4">
			<Form methods={methods}>
				<Body />
				<Footer>
					<button type="submit" />
				</Footer>
			</Form>
		</div>
	</Surface>
);
`;

// IMPORTANT 3 (review-r15), verbatim: every drawer marker is an OPAQUE
// local binding (`const Surface = pick(DrawerContent)`). No tag resolves,
// so there are no anchors and no call-site parts — but the file imports
// the drawer module and carries an unverifiable marker, so it IS a drawer
// file and must be discovered and reddened.
const TEMPORARY_OPAQUE_DRAWER_FILE =
	'src/components/ui/_drawer-surface-opaque-fixture.tsx';
const TEMPORARY_OPAQUE_DRAWER_PATH = fixturePath(TEMPORARY_OPAQUE_DRAWER_FILE);
const TEMPORARY_OPAQUE_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import {
	DrawerBody,
	DrawerContent,
	DrawerFooter,
	DrawerForm,
} from '~/components/ui/drawer';

const pick = <T,>(value: T): T => value;

const Surface = pick(DrawerContent);
const Form = pick(DrawerForm);
const Body = pick(DrawerBody);
const Footer = pick(DrawerFooter);

export const OpaqueDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<Surface>
		<div className="p-4">
			<Form methods={methods}>
				<Body />
				<Footer />
			</Form>
		</div>
	</Surface>
);
`;

// IMPORTANT 5 (review-r15), verbatim: a structurally PERFECT drawer that
// also declares a lazy() component. The lazy factory is a real local
// component — the file must stay green; `_r16-lazy-chart-fixture.tsx` is
// the trivial module it loads. The paired proof with the opaque fixture:
// `pick(DrawerContent)` is a genuinely unresolvable drawer marker (its
// argument is the drawer symbol, not a function), `lazy(() => import(...))`
// is a runtime component factory (its argument is a function).
const TEMPORARY_LAZY_CHART_FILE =
	'src/components/ui/_r16-lazy-chart-fixture.tsx';
const TEMPORARY_LAZY_CHART_PATH = fixturePath(TEMPORARY_LAZY_CHART_FILE);
const TEMPORARY_LAZY_CHART_SOURCE = `export const LazyChart = () => <div>chart</div>;
`;
const TEMPORARY_LAZY_DRAWER_FILE =
	'src/components/ui/_drawer-surface-lazy-fixture.tsx';
const TEMPORARY_LAZY_DRAWER_PATH = fixturePath(TEMPORARY_LAZY_DRAWER_FILE);
const TEMPORARY_LAZY_DRAWER_SOURCE = `import { lazy, Suspense } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import {
	Drawer,
	DrawerBody,
	DrawerContent,
	DrawerFooter,
	DrawerForm,
	DrawerHeader,
	DrawerTitle,
} from '~/components/ui/drawer';

const LazyChart = lazy(() => import('./_r16-lazy-chart-fixture'));

export const LazyDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<Drawer open>
		<DrawerContent data-testid="r16-lazy">
			<DrawerHeader>
				<DrawerTitle />
			</DrawerHeader>
			<DrawerForm methods={methods}>
				<DrawerBody />
				<DrawerFooter>
					<button type="submit" />
				</DrawerFooter>
			</DrawerForm>
		</DrawerContent>
		<Suspense fallback={null}>
			<LazyChart />
		</Suspense>
	</Drawer>
);
`;

// The round-9 gate ("only names the drawer module actually exports")
// pinned directly: importing a name the module does not export must not
// resolve to a drawer symbol. The old pin drove the hand-rolled resolver
// directly; round 16 deletes that resolver, so the pin now drives the
// symbol-graph entry through a fixture — the unbound export is an alias
// with no target, the parts under it sit in an 'other' wrapper, and the
// file is rejected rather than guessed.
const TEMPORARY_NONEXPORT_DRAWER_FILE =
	'src/components/ui/_drawer-surface-nonexport-fixture.tsx';
const TEMPORARY_NONEXPORT_DRAWER_PATH = fixturePath(
	TEMPORARY_NONEXPORT_DRAWER_FILE,
);
const TEMPORARY_NONEXPORT_DRAWER_SOURCE = `import { DrawerBody, DrawerFooter } from '~/components/ui/drawer';
import { NotADrawerExport } from '~/components/ui/drawer';

export const NonexportDrawerFixture = () => (
	<NotADrawerExport>
		<DrawerBody />
		<DrawerFooter />
	</NotADrawerExport>
);
`;

// MINOR 6 (review-r15) — the missing control that makes the capability
// measurable: a same-symbol-conditional SURFACE with a clean
// surface-to-form link must stay green, and only the same-symbol
// conditional resolution keeps it green (kill that resolution and the
// surface becomes unverifiable and the file reddens). The broken fixture
// above it keeps the div, so its red is the walk's, not the resolution's.
const TEMPORARY_CONDITIONAL_SAME_SYMBOL_CLEAN_DRAWER_FILE =
	'src/components/ui/_drawer-surface-conditional-same-symbol-clean-fixture.tsx';
const TEMPORARY_CONDITIONAL_SAME_SYMBOL_CLEAN_DRAWER_PATH = fixturePath(
	TEMPORARY_CONDITIONAL_SAME_SYMBOL_CLEAN_DRAWER_FILE,
);
const TEMPORARY_CONDITIONAL_SAME_SYMBOL_CLEAN_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import {
	Drawer,
	DrawerBody,
	DrawerContent,
	DrawerFooter,
	DrawerForm,
	DrawerHeader,
	DrawerTitle,
} from '~/components/ui/drawer';

const Surface = isOpen ? DrawerContent : DrawerContent;
const Form = isOpen ? DrawerForm : DrawerForm;
const Body = isOpen ? DrawerBody : DrawerBody;
const Footer = isOpen ? DrawerFooter : DrawerFooter;

export const ConditionalSameSymbolCleanDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<Drawer open>
		<Surface data-testid="r16-conditional-same-symbol-clean">
			<DrawerHeader>
				<DrawerTitle />
			</DrawerHeader>
			<Form methods={methods}>
				<Body />
				<Footer>
					<button type="submit" />
				</Footer>
			</Form>
		</Surface>
	</Drawer>
);
`;

// ---------------------------------------------------------------------------
// Round 18 fixtures.
//
// Round 17's review (`.dump/review-r17.md`) filed three BLOCKERs and three
// IMPORTANTs against the round-16 symbol-graph resolution:
//
//  - BLOCKER 1: `const Parts = { DrawerContent, ... }` — the SHORTHAND
//    object map — resolved every member to null because the value walk
//    enumerated `VariableDeclaration`/`PropertyAssignment` and nothing
//    else, and the terminal default was null ("definitely not a drawer").
//    Round 18 resolves shorthand members through the checker's own
//    shorthand value symbol, and flips the terminal default to
//    UNVERIFIABLE — not knowing reddens, it never silently passes.
//  - BLOCKER 2: tag resolution was cached per (file, tag TEXT) at the
//    first JSX node, so a component whose props were named `Surface`/
//    `Form`/`Body`/`Footer` silenced a later drawer built from imports
//    under those same names. Resolution is now keyed on the actual node.
//  - BLOCKER 3: an opaque marker file whose namespace import came through
//    an `export *` barrel was invisible to the discriminator (the
//    namespace branch compared the resolved module path to the drawer
//    module instead of asking the symbol graph). It now resolves the
//    namespace binding's exports.
//  - IMPORTANT 4: `import type * as Drawer` made an unrelated opaque
//    component redden. Type-only imports are skipped.
//  - IMPORTANT 6 (the seam): the drawerModuleExports terminal is pinned
//    directly by a unit test below, so "the module does not export this
//    name" dies when the export-list check dies.
// ---------------------------------------------------------------------------

// BLOCKER 1 (review-r17), verbatim: the drawer exports spelled through a
// SHORTHAND object map — the most ordinary way anyone would write it. The
// property symbols carry only the declaration; the member value must come
// from the checker's shorthand value symbol. The #990 div between the
// surface and the form reddens only then. The clean control below stays
// green only when the shorthand branch resolves instead of reddening the
// whole map as UNVERIFIABLE.
const TEMPORARY_SHORTHAND_MAP_DRAWER_FILE =
	'src/components/ui/_drawer-surface-shorthand-map-fixture.tsx';
const TEMPORARY_SHORTHAND_MAP_DRAWER_PATH = fixturePath(
	TEMPORARY_SHORTHAND_MAP_DRAWER_FILE,
);
const TEMPORARY_SHORTHAND_MAP_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerContent, DrawerFooter, DrawerForm } from '~/components/ui/drawer';

const Parts = { DrawerContent, DrawerForm, DrawerBody, DrawerFooter };

export const ShorthandMapDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<Parts.DrawerContent data-testid="r18-shorthand-map">
		<div className="p-4">
			<Parts.DrawerForm methods={methods}>
				<Parts.DrawerBody />
				<Parts.DrawerFooter>
					<button type="submit" />
				</Parts.DrawerFooter>
			</Parts.DrawerForm>
		</div>
	</Parts.DrawerContent>
);
`;

const TEMPORARY_SHORTHAND_MAP_CLEAN_DRAWER_FILE =
	'src/components/ui/_drawer-surface-shorthand-map-clean-fixture.tsx';
const TEMPORARY_SHORTHAND_MAP_CLEAN_DRAWER_PATH = fixturePath(
	TEMPORARY_SHORTHAND_MAP_CLEAN_DRAWER_FILE,
);
const TEMPORARY_SHORTHAND_MAP_CLEAN_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerContent, DrawerFooter, DrawerForm } from '~/components/ui/drawer';

const Parts = { DrawerContent, DrawerForm, DrawerBody, DrawerFooter };

export const ShorthandMapCleanDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<Parts.DrawerContent data-testid="r18-shorthand-map-clean">
		<Parts.DrawerForm methods={methods}>
			<Parts.DrawerBody />
			<Parts.DrawerFooter>
				<button type="submit" />
			</Parts.DrawerFooter>
		</Parts.DrawerForm>
	</Parts.DrawerContent>
);
`;

// BLOCKER 2 (review-r17), verbatim: an earlier component whose props are
// named `Surface`/`Form`/`Body`/`Footer` followed by a broken drawer whose
// markers are IMPORTS under those same local names. A text-keyed cache
// answers the first `Surface` (the parameter — a definite null) and
// applies it to every later same-text node; per-node resolution gives the
// later import-bound nodes their own verdicts and the #990 div between the
// surface and the form reddens. The earlier tags are PLAIN (non-
// destructured) parameters because a destructured parameter is a
// BindingElement — unverifiable under the round-18 default — so the
// round-17 probe's destructured-param shape would redden through the
// default even with a text-keyed cache; the live escape needs earlier tags
// that resolve to definite nulls. They are OPENING elements so they
// precede the drawer's tags in the scan's tag list, exactly like the
// round-17 probe.
const TEMPORARY_SCOPE_CACHE_DRAWER_FILE =
	'src/components/ui/_drawer-surface-scope-cache-fixture.tsx';
const TEMPORARY_SCOPE_CACHE_DRAWER_PATH = fixturePath(
	TEMPORARY_SCOPE_CACHE_DRAWER_FILE,
);
const TEMPORARY_SCOPE_CACHE_DRAWER_SOURCE = `import type { ComponentType } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import {
	DrawerBody as Body,
	DrawerContent as Surface,
	DrawerFooter as Footer,
	DrawerForm as Form,
} from '~/components/ui/drawer';

const Earlier = (
	Surface: ComponentType,
	Form: ComponentType,
	Body: ComponentType,
	Footer: ComponentType,
) => (
	<div>
		<Surface>{null}</Surface>
		<Form>{null}</Form>
		<Body>{null}</Body>
		<Footer>{null}</Footer>
	</div>
);

export const ScopeCacheDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<Surface data-testid="r18-scope-cache">
		<div className="p-4">
			<Form methods={methods}>
				<Body />
				<Footer>
					<button type="submit" />
				</Footer>
			</Form>
		</div>
	</Surface>
);
`;

// BLOCKER 3 (review-r17), verbatim: every drawer marker is OPAQUE and the
// namespace import comes through an `export *` BARREL — the repo's normal
// way of organising exports. The discriminator must resolve the barrel the
// way the tag machinery does; the round-17 shape shipped green because the
// namespace branch compared the resolved path to the drawer module only.
const TEMPORARY_R18_BARREL_FILE =
	'src/components/ui/_r18-drawer-barrel-fixture.ts';
const TEMPORARY_R18_BARREL_PATH = fixturePath(TEMPORARY_R18_BARREL_FILE);
const TEMPORARY_R18_BARREL_SOURCE = `export * from '~/components/ui/drawer';
`;
const TEMPORARY_BARREL_OPAQUE_DRAWER_FILE =
	'src/components/ui/_drawer-surface-barrel-opaque-fixture.tsx';
const TEMPORARY_BARREL_OPAQUE_DRAWER_PATH = fixturePath(
	TEMPORARY_BARREL_OPAQUE_DRAWER_FILE,
);
const TEMPORARY_BARREL_OPAQUE_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import * as Drawer from './_r18-drawer-barrel-fixture';

const choose = <T,>(value: T): T => value;

const Surface = choose(Drawer.DrawerContent);
const Form = choose(Drawer.DrawerForm);
const Body = choose(Drawer.DrawerBody);
const Footer = choose(Drawer.DrawerFooter);

export const BarrelOpaqueDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<Surface data-testid="r18-barrel-opaque">
		<div className="p-4">
			<Form methods={methods}>
				<Body />
				<Footer />
			</Form>
		</div>
	</Surface>
);
`;

// IMPORTANT 4 (review-r17), verbatim: a TYPE-ONLY namespace import of the
// drawer module next to an unrelated opaque component. There is no runtime
// drawer marker, so the file must stay out of the inventory — a type-only
// import is not a drawer signal. Dropping the type-only skip reddens this
// exact file.
const TEMPORARY_TYPE_ONLY_DRAWER_FILE =
	'src/components/ui/_drawer-surface-type-only-fixture.tsx';
const TEMPORARY_TYPE_ONLY_DRAWER_PATH = fixturePath(
	TEMPORARY_TYPE_ONLY_DRAWER_FILE,
);
const TEMPORARY_TYPE_ONLY_DRAWER_SOURCE = `import type { ComponentType } from 'react';
import type * as DrawerTypes from '~/components/ui/drawer';

declare const Mystery: ComponentType;
type DrawerNamespace = typeof DrawerTypes;

export const TypeOnlyDrawerFixture = () => <Mystery />;
void (null as unknown as DrawerNamespace);
`;

// The round-18 default, pinned by a fixture that does not care which shape
// is unhandled: a DESTRUCTURED binding — `const { DrawerContent: Surface,
// ... } = Drawer` — is a declaration kind the resolver does not enumerate
// (a BindingElement; the checker exposes no value symbol for it), so today
// every marker resolves UNVERIFIABLE and the file reddens through the
// default. If a future round learns to resolve destructuring, the markers
// become drawer symbols and the SAME file still reddens — the #990 div
// between the surface and the form is then found by the walk. Either way
// the break is red; only a fail-open terminal (unhandled means null) makes
// it green.
const TEMPORARY_DESTRUCTURED_DRAWER_FILE =
	'src/components/ui/_drawer-surface-destructured-fixture.tsx';
const TEMPORARY_DESTRUCTURED_DRAWER_PATH = fixturePath(
	TEMPORARY_DESTRUCTURED_DRAWER_FILE,
);
const TEMPORARY_DESTRUCTURED_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import * as Drawer from '~/components/ui/drawer';

const {
	DrawerBody: Body,
	DrawerContent: Surface,
	DrawerFooter: Footer,
	DrawerForm: Form,
} = Drawer;

export const DestructuredDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<Surface data-testid="r18-destructured">
		<div className="p-4">
			<Form methods={methods}>
				<Body />
				<Footer>
					<button type="submit" />
				</Footer>
			</Form>
		</div>
	</Surface>
);
`;

// ---------------------------------------------------------------------------
// Round 20 fixtures.
//
// Round 19's review (`.dump/review-r19.md`) filed two BLOCKERs against the
// round-18 resolution — the fail-closed terminal is only as closed as the
// paths that reach it:
//
//  - BLOCKER 1: the intrinsic-element cut read `/^[a-z]/` against the WHOLE
//    tag text, so a lowercase-leading DOTTED tag — `<kit.Surface>` — was
//    read as an intrinsic DOM element ("definitely not a drawer") even
//    though a dotted tag is a value expression regardless of case. The
//    repo already writes the shape: `icon-color-picker.tsx` renders
//    `<option.Icon />` and `<activeIconOption.Icon />`.
//  - BLOCKER 2: the checker resolves the member of a TYPE-ANNOTATED object
//    literal to the type's PropertySignature — never to the literal's
//    PropertyAssignment — and that kind sat in the definite-non-drawer
//    allowlist, so `const KIT: DrawerKit = {...}` resolved every marker to
//    null with the exact #990 break green. A type-side member is followed
//    to its value side (the annotated object literal's own property); a
//    value side the scan cannot read is UNVERIFIABLE.
//
// Each shape gets a broken fixture (the exact #990 div) and a clean
// control, plus the paired-proof fixture that keeps the shipped
// `option.Icon` shape from becoming a false positive.
// ---------------------------------------------------------------------------

// BLOCKER 1 (review-r19), verbatim spelling: an UNANNOTATED lowercase
// component map. The dotted tags are value expressions; only the
// intrinsic cut read them as DOM elements. Without the round-20 fix every
// marker resolves null and the file is never even discovered — the #990
// div between the surface and the form ships green.
const TEMPORARY_DOTTED_KIT_DRAWER_FILE =
	'src/components/ui/_drawer-surface-r20-dotted-kit-fixture.tsx';
const TEMPORARY_DOTTED_KIT_DRAWER_PATH = fixturePath(
	TEMPORARY_DOTTED_KIT_DRAWER_FILE,
);
const TEMPORARY_DOTTED_KIT_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerContent, DrawerFooter, DrawerForm } from '~/components/ui/drawer';

const kit = {
	Surface: DrawerContent,
	Form: DrawerForm,
	Body: DrawerBody,
	Footer: DrawerFooter,
};

export const DottedKitDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<kit.Surface data-testid="r20-dotted-kit">
		<div className="p-4">
			<kit.Form methods={methods}>
				<kit.Body />
				<kit.Footer>
					<button type="submit" />
				</kit.Footer>
			</kit.Form>
		</div>
	</kit.Surface>
);
`;

const TEMPORARY_DOTTED_KIT_CLEAN_DRAWER_FILE =
	'src/components/ui/_drawer-surface-r20-dotted-kit-clean-fixture.tsx';
const TEMPORARY_DOTTED_KIT_CLEAN_DRAWER_PATH = fixturePath(
	TEMPORARY_DOTTED_KIT_CLEAN_DRAWER_FILE,
);
const TEMPORARY_DOTTED_KIT_CLEAN_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerContent, DrawerFooter, DrawerForm } from '~/components/ui/drawer';

const kit = {
	Surface: DrawerContent,
	Form: DrawerForm,
	Body: DrawerBody,
	Footer: DrawerFooter,
};

export const DottedKitCleanDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<kit.Surface data-testid="r20-dotted-kit-clean">
		<kit.Form methods={methods}>
			<kit.Body />
			<kit.Footer>
				<button type="submit" />
			</kit.Footer>
		</kit.Form>
	</kit.Surface>
);
`;

// BLOCKER 2 (review-r19), verbatim: a TYPE-ANNOTATED component map whose
// markers are local aliases of `KIT.Surface`-style members. The checker
// resolves the member to the type's PropertySignature; only the value-side
// walk reaches the annotated object literal and then the drawer module.
const TEMPORARY_PROPSIG_DRAWER_FILE =
	'src/components/ui/_drawer-surface-r20-propsig-fixture.tsx';
const TEMPORARY_PROPSIG_DRAWER_PATH = fixturePath(
	TEMPORARY_PROPSIG_DRAWER_FILE,
);
const TEMPORARY_PROPSIG_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerContent, DrawerFooter, DrawerForm } from '~/components/ui/drawer';

type DrawerKit = {
	Surface: typeof DrawerContent;
	Form: typeof DrawerForm;
	Body: typeof DrawerBody;
	Footer: typeof DrawerFooter;
};

const KIT: DrawerKit = {
	Surface: DrawerContent,
	Form: DrawerForm,
	Body: DrawerBody,
	Footer: DrawerFooter,
};

const Surface = KIT.Surface;
const Form = KIT.Form;
const Body = KIT.Body;
const Footer = KIT.Footer;

export const PropSigDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<Surface data-testid="r20-propsig">
		<div className="p-4">
			<Form methods={methods}>
				<Body />
				<Footer>
					<button type="submit" />
				</Footer>
			</Form>
		</div>
	</Surface>
);
`;

const TEMPORARY_PROPSIG_CLEAN_DRAWER_FILE =
	'src/components/ui/_drawer-surface-r20-propsig-clean-fixture.tsx';
const TEMPORARY_PROPSIG_CLEAN_DRAWER_PATH = fixturePath(
	TEMPORARY_PROPSIG_CLEAN_DRAWER_FILE,
);
const TEMPORARY_PROPSIG_CLEAN_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerContent, DrawerFooter, DrawerForm } from '~/components/ui/drawer';

type DrawerKit = {
	Surface: typeof DrawerContent;
	Form: typeof DrawerForm;
	Body: typeof DrawerBody;
	Footer: typeof DrawerFooter;
};

const KIT: DrawerKit = {
	Surface: DrawerContent,
	Form: DrawerForm,
	Body: DrawerBody,
	Footer: DrawerFooter,
};

const Surface = KIT.Surface;
const Form = KIT.Form;
const Body = KIT.Body;
const Footer = KIT.Footer;

export const PropSigCleanDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<Surface data-testid="r20-propsig-clean">
		<Form methods={methods}>
			<Body />
			<Footer>
				<button type="submit" />
			</Footer>
		</Form>
	</Surface>
);
`;

// The paired proof (BLOCKER 1's note): `<option.Icon />`-shaped tags —
// a member of a TYPED `.map` callback parameter — must not false-positive
// a shipped file. Round 21's MINOR 5: the original version of this fixture
// carried no drawer import, so it could never be DISCOVERED at all — even
// mutating the classification this pins straight to UNVERIFIABLE left both
// assertions below green, because a file with no drawer signal is never
// visited (see the `importsDrawerModule` gate above). The drawer import and
// real anchor below make the file's discovery depend on the classification
// this fixture actually exercises: `option`'s iterable (`options`) IS a
// traceable array literal, so round 21's array walk runs and resolves
// `option.Icon` to `IconOne` — a real local component, still null — the
// same verdict the old blanket "parameter member is null" rule gave, but
// reached through the mechanism that must keep giving it. The shipped
// `app-shell.tsx` renders the harder variant with NO traceable iterable at
// all — `const Icon = item.Icon` with `item` a prop passed down from a
// `.map()` two components away — and stays covered by the inventory checks
// at the bottom of this file.
const TEMPORARY_MEMBER_OF_PARAMETER_FILE =
	'src/components/ui/_drawer-surface-r20-member-of-parameter-fixture.tsx';
const TEMPORARY_MEMBER_OF_PARAMETER_PATH = fixturePath(
	TEMPORARY_MEMBER_OF_PARAMETER_FILE,
);
const TEMPORARY_MEMBER_OF_PARAMETER_SOURCE = `import { DrawerBody, DrawerContent, DrawerFooter } from '~/components/ui/drawer';

const IconOne = () => <svg aria-hidden="true" />;

// Round 24's MINOR 5: the member type is deliberately REPO-LOCAL (typeof
// IconOne), so the untraced-Parameter fallback (UNVERIFIABLE, never null)
// is what yields if the array walk is killed — the walk is the ONLY path
// that resolves option.Icon to its element.
type IconOption = { Icon: typeof IconOne };

const options: IconOption[] = [{ Icon: IconOne }];

export const MemberOfParameterFixture = () => (
	<DrawerContent data-testid="r20-member-of-parameter">
		<DrawerBody>
			{options.map((option) => (
				<option.Icon aria-hidden="true" />
			))}
		</DrawerBody>
		<DrawerFooter>
			<button type="submit" />
		</DrawerFooter>
	</DrawerContent>
);
`;

// ---------------------------------------------------------------------------
// Round 21's BLOCKER 1: the false-positive fix above ("a member whose base
// is a callback parameter is a definite non-drawer") was wider than the
// false positive it closed — an explicitly typed array CAN carry the real
// drawer exports as its elements. `kits.map((kit) => <kit.Surface />)` with
// `const kits: DrawerKit[] = [{ Surface: DrawerContent, ... }]` must resolve
// through the array to the real exports, not read "a parameter is always a
// real local value."
// ---------------------------------------------------------------------------

const TEMPORARY_ARRAY_KIT_DRAWER_FILE =
	'src/components/ui/_drawer-surface-r21-array-kit-fixture.tsx';
const TEMPORARY_ARRAY_KIT_DRAWER_PATH = fixturePath(
	TEMPORARY_ARRAY_KIT_DRAWER_FILE,
);
const TEMPORARY_ARRAY_KIT_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerContent, DrawerFooter, DrawerForm } from '~/components/ui/drawer';

type DrawerKit = {
	Surface: typeof DrawerContent;
	Form: typeof DrawerForm;
	Body: typeof DrawerBody;
	Footer: typeof DrawerFooter;
};

const kits: DrawerKit[] = [
	{ Surface: DrawerContent, Form: DrawerForm, Body: DrawerBody, Footer: DrawerFooter },
];

export const ArrayKitDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<>
		{kits.map((kit) => (
			<kit.Surface key="r21-array-kit" data-testid="r21-array-kit">
				<div className="p-4">
					<kit.Form methods={methods}>
						<kit.Body />
						<kit.Footer>
							<button type="submit" />
						</kit.Footer>
					</kit.Form>
				</div>
			</kit.Surface>
		))}
	</>
);
`;

const TEMPORARY_ARRAY_KIT_CLEAN_DRAWER_FILE =
	'src/components/ui/_drawer-surface-r21-array-kit-clean-fixture.tsx';
const TEMPORARY_ARRAY_KIT_CLEAN_DRAWER_PATH = fixturePath(
	TEMPORARY_ARRAY_KIT_CLEAN_DRAWER_FILE,
);
const TEMPORARY_ARRAY_KIT_CLEAN_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerContent, DrawerFooter, DrawerForm } from '~/components/ui/drawer';

type DrawerKit = {
	Surface: typeof DrawerContent;
	Form: typeof DrawerForm;
	Body: typeof DrawerBody;
	Footer: typeof DrawerFooter;
};

const kits: DrawerKit[] = [
	{ Surface: DrawerContent, Form: DrawerForm, Body: DrawerBody, Footer: DrawerFooter },
];

export const ArrayKitCleanDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<>
		{kits.map((kit) => (
			<kit.Surface key="r21-array-kit-clean" data-testid="r21-array-kit-clean">
				<kit.Form methods={methods}>
					<kit.Body />
					<kit.Footer>
						<button type="submit" />
					</kit.Footer>
				</kit.Form>
			</kit.Surface>
		))}
	</>
);
`;

// ---------------------------------------------------------------------------
// Round 21's BLOCKER 2: object-literal getters were explicitly grouped with
// methods/setters and read as "the member's value IS the function" — false
// for a getter, since property access INVOKES it and returns whatever it
// returns. \`const kit = { get Surface() { return DrawerContent; }, ... }\`
// must resolve \`kit.Surface\` to the real \`DrawerContent\` export.
// ---------------------------------------------------------------------------

const TEMPORARY_GETTER_KIT_DRAWER_FILE =
	'src/components/ui/_drawer-surface-r21-getter-kit-fixture.tsx';
const TEMPORARY_GETTER_KIT_DRAWER_PATH = fixturePath(
	TEMPORARY_GETTER_KIT_DRAWER_FILE,
);
const TEMPORARY_GETTER_KIT_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerContent, DrawerFooter, DrawerForm } from '~/components/ui/drawer';

const kit = {
	get Surface() {
		return DrawerContent;
	},
	get Form() {
		return DrawerForm;
	},
	get Body() {
		return DrawerBody;
	},
	get Footer() {
		return DrawerFooter;
	},
};

export const GetterKitDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<kit.Surface data-testid="r21-getter-kit">
		<div className="p-4">
			<kit.Form methods={methods}>
				<kit.Body />
				<kit.Footer>
					<button type="submit" />
				</kit.Footer>
			</kit.Form>
		</div>
	</kit.Surface>
);
`;

const TEMPORARY_GETTER_KIT_CLEAN_DRAWER_FILE =
	'src/components/ui/_drawer-surface-r21-getter-kit-clean-fixture.tsx';
const TEMPORARY_GETTER_KIT_CLEAN_DRAWER_PATH = fixturePath(
	TEMPORARY_GETTER_KIT_CLEAN_DRAWER_FILE,
);
const TEMPORARY_GETTER_KIT_CLEAN_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerContent, DrawerFooter, DrawerForm } from '~/components/ui/drawer';

const kit = {
	get Surface() {
		return DrawerContent;
	},
	get Form() {
		return DrawerForm;
	},
	get Body() {
		return DrawerBody;
	},
	get Footer() {
		return DrawerFooter;
	},
};

export const GetterKitCleanDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<kit.Surface data-testid="r21-getter-kit-clean">
		<kit.Form methods={methods}>
			<kit.Body />
			<kit.Footer>
				<button type="submit" />
			</kit.Footer>
		</kit.Form>
	</kit.Surface>
);
`;

// ---------------------------------------------------------------------------
// Round 21's IMPORTANT 4: the wrapper guard rejected EVERY intermediate
// element, but #990 only asks it to forbid wrappers that BREAK the flex
// chain. A `display: contents` element generates no principal box — its
// child participates directly in the drawer's flex formatting context — so
// it is a legitimate wrapper. The broken control is the ordinary `<div
// className="p-4">` at the exact same position (still a real box, still a
// violation); only the `contents` variant must go green.
// ---------------------------------------------------------------------------

const TEMPORARY_CONTENTS_WRAPPER_BROKEN_FILE =
	'src/components/ui/_drawer-surface-r21-contents-wrapper-broken-fixture.tsx';
const TEMPORARY_CONTENTS_WRAPPER_BROKEN_PATH = fixturePath(
	TEMPORARY_CONTENTS_WRAPPER_BROKEN_FILE,
);
const TEMPORARY_CONTENTS_WRAPPER_BROKEN_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerContent, DrawerFooter, DrawerForm } from '~/components/ui/drawer';

export const ContentsWrapperBrokenDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<DrawerContent data-testid="r21-contents-wrapper-broken">
		<div className="p-4">
			<DrawerForm methods={methods}>
				<DrawerBody />
				<DrawerFooter>
					<button type="submit" />
				</DrawerFooter>
			</DrawerForm>
		</div>
	</DrawerContent>
);
`;

const TEMPORARY_CONTENTS_WRAPPER_CLEAN_FILE =
	'src/components/ui/_drawer-surface-r21-contents-wrapper-clean-fixture.tsx';
const TEMPORARY_CONTENTS_WRAPPER_CLEAN_PATH = fixturePath(
	TEMPORARY_CONTENTS_WRAPPER_CLEAN_FILE,
);
const TEMPORARY_CONTENTS_WRAPPER_CLEAN_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerContent, DrawerFooter, DrawerForm } from '~/components/ui/drawer';

export const ContentsWrapperCleanDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<DrawerContent data-testid="r21-contents-wrapper-clean">
		<div className="contents">
			<DrawerForm methods={methods}>
				<DrawerBody />
				<DrawerFooter>
					<button type="submit" />
				</DrawerFooter>
			</DrawerForm>
		</div>
	</DrawerContent>
);
`;

// ---------------------------------------------------------------------------
// Round 24's IMPORTANT 5 — the `contents` token must be ESTABLISHED, not
// spelled. `display: contents` only wins at a width where no *other* display
// utility is active. `className="contents min-[1100px]:block"` still contains
// the `contents` token but becomes a block at 1100px+, so it is NOT boxless at
// every width that matters — the wrapper must be treated as a real element.
// ---------------------------------------------------------------------------

const TEMPORARY_CONTENTS_BOX_RESTORING_FILE =
	'src/components/ui/_drawer-surface-r24-contents-box-restoring-fixture.tsx';
const TEMPORARY_CONTENTS_BOX_RESTORING_PATH = fixturePath(
	TEMPORARY_CONTENTS_BOX_RESTORING_FILE,
);
const TEMPORARY_CONTENTS_BOX_RESTORING_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerContent, DrawerFooter, DrawerForm } from '~/components/ui/drawer';

export const ContentsBoxRestoringDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<DrawerContent data-testid="r24-contents-box-restoring">
		<div className="contents min-[1100px]:block">
			<DrawerForm methods={methods}>
				<DrawerBody />
				<DrawerFooter>
					<button type="submit" />
				</DrawerFooter>
			</DrawerForm>
		</div>
	</DrawerContent>
);
`;

// Round 28's IMPORTANT 5 — the recognizer's display set is the canonical
// list, not a hand-written subset. Round 27 found `table-cell` and
// `list-item` missing, so a wrapper that restores a box with either of them
// above a breakpoint was accepted as established boxless.
const TEMPORARY_CONTENTS_BOX_RESTORING_TABLE_CELL_FILE =
	'src/components/ui/_drawer-surface-r28-contents-box-restoring-table-cell-fixture.tsx';
const TEMPORARY_CONTENTS_BOX_RESTORING_TABLE_CELL_PATH = fixturePath(
	TEMPORARY_CONTENTS_BOX_RESTORING_TABLE_CELL_FILE,
);
const TEMPORARY_CONTENTS_BOX_RESTORING_TABLE_CELL_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerContent, DrawerFooter, DrawerForm } from '~/components/ui/drawer';

export const ContentsBoxRestoringTableCellDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<DrawerContent data-testid="r28-contents-box-restoring-table-cell">
		<div className="contents min-[1100px]:table-cell">
			<DrawerForm methods={methods}>
				<DrawerBody />
				<DrawerFooter>
					<button type="submit" />
				</DrawerFooter>
			</DrawerForm>
		</div>
	</DrawerContent>
);
`;

// ---------------------------------------------------------------------------
// Round 26's IMPORTANT 5 — the WINNING display value, not the first evidence.
// The inline `style` attribute beats the class cascade, so a `contents` class
// with a later `style={{ display: 'block' }}` still generates a principal box
// and restores the #990 break; the old early return accepted the wrapper on
// the class evidence before ever reading the style. The clean control carries
// `style={{ display: 'contents' }}`, which PROVES boxlessness; a style that
// does not name display at all leaves the class cascade in charge; and a
// style the guard cannot see (a dynamic object) is not established boxless.
// ---------------------------------------------------------------------------

const TEMPORARY_CONTENTS_STYLE_RESTORING_FILE =
	'src/components/ui/_drawer-surface-r26-contents-style-restoring-fixture.tsx';
const TEMPORARY_CONTENTS_STYLE_RESTORING_PATH = fixturePath(
	TEMPORARY_CONTENTS_STYLE_RESTORING_FILE,
);
const TEMPORARY_CONTENTS_STYLE_RESTORING_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerContent, DrawerFooter, DrawerForm } from '~/components/ui/drawer';

export const ContentsStyleRestoringDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<DrawerContent data-testid="r26-contents-style-restoring">
		<div className="contents" style={{ display: 'block' }}>
			<DrawerForm methods={methods}>
				<DrawerBody />
				<DrawerFooter>
					<button type="submit" />
				</DrawerFooter>
			</DrawerForm>
		</div>
	</DrawerContent>
);
`;

const TEMPORARY_CONTENTS_STYLE_CLEAN_FILE =
	'src/components/ui/_drawer-surface-r26-contents-style-clean-fixture.tsx';
const TEMPORARY_CONTENTS_STYLE_CLEAN_PATH = fixturePath(
	TEMPORARY_CONTENTS_STYLE_CLEAN_FILE,
);
const TEMPORARY_CONTENTS_STYLE_CLEAN_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerContent, DrawerFooter, DrawerForm } from '~/components/ui/drawer';

export const ContentsStyleCleanDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<DrawerContent data-testid="r26-contents-style-clean">
		<div className="contents" style={{ display: 'contents' }}>
			<DrawerForm methods={methods}>
				<DrawerBody />
				<DrawerFooter>
					<button type="submit" />
				</DrawerFooter>
			</DrawerForm>
		</div>
	</DrawerContent>
);
`;

const TEMPORARY_CONTENTS_STYLE_NON_DISPLAY_FILE =
	'src/components/ui/_drawer-surface-r26-contents-style-non-display-fixture.tsx';
const TEMPORARY_CONTENTS_STYLE_NON_DISPLAY_PATH = fixturePath(
	TEMPORARY_CONTENTS_STYLE_NON_DISPLAY_FILE,
);
const TEMPORARY_CONTENTS_STYLE_NON_DISPLAY_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerContent, DrawerFooter, DrawerForm } from '~/components/ui/drawer';

export const ContentsStyleNonDisplayDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<DrawerContent data-testid="r26-contents-style-non-display">
		<div className="contents" style={{ padding: '1rem' }}>
			<DrawerForm methods={methods}>
				<DrawerBody />
				<DrawerFooter>
					<button type="submit" />
				</DrawerFooter>
			</DrawerForm>
		</div>
	</DrawerContent>
);
`;

const TEMPORARY_CONTENTS_STYLE_UNDECIDABLE_FILE =
	'src/components/ui/_drawer-surface-r26-contents-style-undecidable-fixture.tsx';
const TEMPORARY_CONTENTS_STYLE_UNDECIDABLE_PATH = fixturePath(
	TEMPORARY_CONTENTS_STYLE_UNDECIDABLE_FILE,
);
const TEMPORARY_CONTENTS_STYLE_UNDECIDABLE_SOURCE = `import type { CSSProperties } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerContent, DrawerFooter, DrawerForm } from '~/components/ui/drawer';

const wrapperStyle: CSSProperties = { display: 'block' };

export const ContentsStyleUndecidableDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<DrawerContent data-testid="r26-contents-style-undecidable">
		<div className="contents" style={wrapperStyle}>
			<DrawerForm methods={methods}>
				<DrawerBody />
				<DrawerFooter>
					<button type="submit" />
				</DrawerFooter>
			</DrawerForm>
		</div>
	</DrawerContent>
);
`;

// Round 28's IMPORTANT 7 — an inline style SPREAD does not establish the
// winning display value. `{ display: 'contents', ...wrapperStyle }` with
// `wrapperStyle = { display: 'block' as const }` is a real block at runtime
// (the later spread wins ordinary object construction); the old resolver
// found the direct `display: 'contents'` property and declared the wrapper
// boxless.
const TEMPORARY_CONTENTS_STYLE_SPREAD_RESTORING_FILE =
	'src/components/ui/_drawer-surface-r28-contents-style-spread-restoring-fixture.tsx';
const TEMPORARY_CONTENTS_STYLE_SPREAD_RESTORING_PATH = fixturePath(
	TEMPORARY_CONTENTS_STYLE_SPREAD_RESTORING_FILE,
);
const TEMPORARY_CONTENTS_STYLE_SPREAD_RESTORING_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerContent, DrawerFooter, DrawerForm } from '~/components/ui/drawer';

const wrapperStyle = { display: 'block' as const };

export const ContentsStyleSpreadRestoringDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<DrawerContent data-testid="r28-contents-style-spread-restoring">
		<div className="contents" style={{ display: 'contents', ...wrapperStyle }}>
			<DrawerForm methods={methods}>
				<DrawerBody />
				<DrawerFooter>
					<button type="submit" />
				</DrawerFooter>
			</DrawerForm>
		</div>
	</DrawerContent>
);
`;

// ---------------------------------------------------------------------------
// Round 24's BLOCKER 1 — components-as-props. A component passes the four
// drawer exports into a CHILD as a prop (`kit={{ Surface: DrawerContent,
// Form: DrawerForm, Body: DrawerBody, Footer: DrawerFooter }}`), and the child
// authors the broken `Surface > div > Form > Body/Footer` chain through
// `<kit.Surface>` etc. `kit` is a plain Parameter the resolver cannot trace to
// a value side, so the member value is NOT proved — round 24 makes it
// UNVERIFIABLE (fail closed) rather than the old "definitely not a drawer".
// The member base is typed `typeof DrawerContent` (repo-local), so the
// type-based NOT_DRAWER proof does not apply: the file must redden.
// ---------------------------------------------------------------------------

const TEMPORARY_PARAMETER_KIT_DRAWER_FILE =
	'src/components/ui/_drawer-surface-r24-parameter-kit-fixture.tsx';
const TEMPORARY_PARAMETER_KIT_DRAWER_PATH = fixturePath(
	TEMPORARY_PARAMETER_KIT_DRAWER_FILE,
);
const TEMPORARY_PARAMETER_KIT_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerContent, DrawerFooter, DrawerForm } from '~/components/ui/drawer';

type KitProps = {
	kit: {
		Surface: typeof DrawerContent;
		Form: typeof DrawerForm;
		Body: typeof DrawerBody;
		Footer: typeof DrawerFooter;
	};
	methods: UseFormReturn<FieldValues>;
};

const DrawerFromKit = ({ kit, methods }: KitProps) => (
	<kit.Surface>
		<div className="p-4">
			<kit.Form methods={methods}>
				<kit.Body />
				<kit.Footer />
			</kit.Form>
		</div>
	</kit.Surface>
);

export const ParameterKitDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<DrawerFromKit
		methods={methods}
		kit={{
			Surface: DrawerContent,
			Form: DrawerForm,
			Body: DrawerBody,
			Footer: DrawerFooter,
		}}
	/>
);
`;

// ---------------------------------------------------------------------------
// Round 24's BLOCKER 2a — an accessor pair with the SETTER declared FIRST.
// `getProperty(memberName)` returns whichever accessor comes first in source,
// so the setter-first pair read as a setter-only member ("value is undefined")
// while property access INVOKES the getter and returns the drawer export. The
// member must resolve through the GETTER.
// ---------------------------------------------------------------------------

const TEMPORARY_SETTER_GETTER_KIT_DRAWER_FILE =
	'src/components/ui/_drawer-surface-r24-setter-getter-kit-fixture.tsx';
const TEMPORARY_SETTER_GETTER_KIT_DRAWER_PATH = fixturePath(
	TEMPORARY_SETTER_GETTER_KIT_DRAWER_FILE,
);
const TEMPORARY_SETTER_GETTER_KIT_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerContent, DrawerFooter, DrawerForm } from '~/components/ui/drawer';

type DrawerKit = {
	Surface: typeof DrawerContent;
	Form: typeof DrawerForm;
	Body: typeof DrawerBody;
	Footer: typeof DrawerFooter;
};

const kit: DrawerKit = {
	set Surface(value: typeof DrawerContent) {
		void value;
	},
	get Surface() {
		return DrawerContent;
	},
	set Form(value: typeof DrawerForm) {
		void value;
	},
	get Form() {
		return DrawerForm;
	},
	set Body(value: typeof DrawerBody) {
		void value;
	},
	get Body() {
		return DrawerBody;
	},
	set Footer(value: typeof DrawerFooter) {
		void value;
	},
	get Footer() {
		return DrawerFooter;
	},
};

export const SetterGetterKitDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<kit.Surface>
		<div className="p-4">
			<kit.Form methods={methods}>
				<kit.Body />
				<kit.Footer />
			</kit.Form>
		</div>
	</kit.Surface>
);
`;

// ---------------------------------------------------------------------------
// Round 24's BLOCKER 2b — a METHOD-valued dotted member. `Surface(props) {
// return createElement(DrawerContent, props); }` used as `<kit.Surface>` is
// INVOKED and renders the real drawer. The old rule read a method reference as
// "the member's value IS the function, therefore not a drawer" — the method
// body's return value is what the tag actually renders.
// ---------------------------------------------------------------------------

const TEMPORARY_METHOD_KIT_DRAWER_FILE =
	'src/components/ui/_drawer-surface-r24-method-kit-fixture.tsx';
const TEMPORARY_METHOD_KIT_DRAWER_PATH = fixturePath(
	TEMPORARY_METHOD_KIT_DRAWER_FILE,
);
const TEMPORARY_METHOD_KIT_DRAWER_SOURCE = `import { createElement, type ComponentProps } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerContent, DrawerFooter, DrawerForm } from '~/components/ui/drawer';

const kit = {
	Surface(props: ComponentProps<typeof DrawerContent>) {
		return createElement(DrawerContent, props);
	},
	Form(props: ComponentProps<typeof DrawerForm>) {
		return createElement(DrawerForm, props);
	},
	Body(props: ComponentProps<typeof DrawerBody>) {
		return createElement(DrawerBody, props);
	},
	Footer(props: ComponentProps<typeof DrawerFooter>) {
		return createElement(DrawerFooter, props);
	},
};

export const MethodKitDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<kit.Surface>
		<div className="p-4">
			<kit.Form methods={methods}>
				<kit.Body />
				<kit.Footer />
			</kit.Form>
		</div>
	</kit.Surface>
);
`;

// ---------------------------------------------------------------------------
// Round 24's BLOCKER 3 — a traced array whose literal initializer names four
// LOCAL components, then a later `push` appends the real drawer kit. The
// `.map()` callback reads the array AFTER the mutation; classifying the
// literal initializer as "the array's definite contents" is the same mistake
// as trusting a reassigned variable's initializer. The array must be UNVERIFIABLE
// when the guard cannot prove it unmutated.
// ---------------------------------------------------------------------------

const TEMPORARY_MUTATED_ARRAY_KIT_DRAWER_FILE =
	'src/components/ui/_drawer-surface-r24-mutated-array-kit-fixture.tsx';
const TEMPORARY_MUTATED_ARRAY_KIT_DRAWER_PATH = fixturePath(
	TEMPORARY_MUTATED_ARRAY_KIT_DRAWER_FILE,
);
const TEMPORARY_MUTATED_ARRAY_KIT_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerContent, DrawerFooter, DrawerForm } from '~/components/ui/drawer';

type DrawerKit = {
	Surface: typeof DrawerContent;
	Form: typeof DrawerForm;
	Body: typeof DrawerBody;
	Footer: typeof DrawerFooter;
};

const LocalSurface = (() => <div />) as typeof DrawerContent;
const LocalForm = (({ methods: _methods }: { methods: UseFormReturn<FieldValues> }) => {
	void _methods;
	return <form />;
}) as typeof DrawerForm;
const LocalBody = (() => <div />) as typeof DrawerBody;
const LocalFooter = (() => <div />) as typeof DrawerFooter;

const kits: DrawerKit[] = [
	{
		Surface: LocalSurface,
		Form: LocalForm,
		Body: LocalBody,
		Footer: LocalFooter,
	},
];
kits.push({
	Surface: DrawerContent,
	Form: DrawerForm,
	Body: DrawerBody,
	Footer: DrawerFooter,
});

export const MutatedArrayKitDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<>
		{kits.map((kit) => (
			<kit.Surface>
				<div className="p-4">
					<kit.Form methods={methods}>
						<kit.Body />
						<kit.Footer />
					</kit.Form>
				</div>
			</kit.Surface>
		))}
	</>
);
`;

// ---------------------------------------------------------------------------
// Round 26's BLOCKER 3 — the array-alias residual. The mutation scan used to
// match only writes whose receiver TEXT was the traced binding's name
// (`kits.push(...)`), so a write through a second binding that ALIASES the
// same array (`const alias = kits; alias.push(...)`) was invisible: the
// callback was classified from the old local-only literal, every member read
// definite NOT_DRAWER, and the appended real drawer kit disappeared. The
// receiver must be resolved through the value side to the array's literal
// identity — not its spelling — so an alias mutation is caught too.
// ---------------------------------------------------------------------------

const TEMPORARY_ALIASED_MUTATED_ARRAY_KIT_DRAWER_FILE =
	'src/components/ui/_drawer-surface-r26-aliased-mutated-array-kit-fixture.tsx';
const TEMPORARY_ALIASED_MUTATED_ARRAY_KIT_DRAWER_PATH = fixturePath(
	TEMPORARY_ALIASED_MUTATED_ARRAY_KIT_DRAWER_FILE,
);
const TEMPORARY_ALIASED_MUTATED_ARRAY_KIT_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerContent, DrawerFooter, DrawerForm } from '~/components/ui/drawer';

type DrawerKit = {
	Surface: typeof DrawerContent;
	Form: typeof DrawerForm;
	Body: typeof DrawerBody;
	Footer: typeof DrawerFooter;
};

const LocalSurface = (() => <div />) as typeof DrawerContent;
const LocalForm = (({ methods: _methods }: { methods: UseFormReturn<FieldValues> }) => {
	void _methods;
	return <form />;
}) as typeof DrawerForm;
const LocalBody = (() => <div />) as typeof DrawerBody;
const LocalFooter = (() => <div />) as typeof DrawerFooter;

const kits: DrawerKit[] = [
	{
		Surface: LocalSurface,
		Form: LocalForm,
		Body: LocalBody,
		Footer: LocalFooter,
	},
];
const alias = kits;
alias.push({
	Surface: DrawerContent,
	Form: DrawerForm,
	Body: DrawerBody,
	Footer: DrawerFooter,
});

export const AliasedMutatedArrayKitDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<>
		{kits.map((kit) => (
			<kit.Surface>
				<div className="p-4">
					<kit.Form methods={methods}>
						<kit.Body />
						<kit.Footer />
					</kit.Form>
				</div>
			</kit.Surface>
		))}
	</>
);
`;

// ---------------------------------------------------------------------------
// Round 26's BLOCKER 1 — a structurally-typed member that can hold the real
// drawer exports. The reviewer's exact reproduction: the kit members are typed
// with React's EXTERNAL `FC<any>`, so the value is passed through a parameter
// whose declared type looks external. Round 24's type-shaped disproof
// (`isMemberTypeProvablyExternal`) read that external type as an identity
// proof and returned a definite NOT_DRAWER for every `<kit.Surface>` etc. —
// shipping the exact #990 break green with typecheck clean. TypeScript member
// types are structural, not nominal: a repo-local `DrawerContent` can legally
// inhabit `FC<any>`. The disproof must be about the VALUE's symbol, so a
// parameter member with no traceable value side is UNVERIFIABLE — and this
// drawer, which imports the drawer module and passes the real exports into the
// kit, is discovered and reddened.
// ---------------------------------------------------------------------------

const TEMPORARY_EXTERNAL_TYPED_KIT_DRAWER_FILE =
	'src/components/ui/_drawer-surface-r26-external-typed-kit-fixture.tsx';
const TEMPORARY_EXTERNAL_TYPED_KIT_DRAWER_PATH = fixturePath(
	TEMPORARY_EXTERNAL_TYPED_KIT_DRAWER_FILE,
);
const TEMPORARY_EXTERNAL_TYPED_KIT_DRAWER_SOURCE = `import type { FC } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerContent, DrawerFooter, DrawerForm } from '~/components/ui/drawer';

type ExternalTypedKit = {
	Surface: FC<any>;
	Form: FC<any>;
	Body: FC<any>;
	Footer: FC<any>;
};

type KitProps = {
	kit: ExternalTypedKit;
	methods: UseFormReturn<FieldValues>;
};

const DrawerFromKit = ({ kit, methods }: KitProps) => (
	<kit.Surface>
		<div className="p-4">
			<kit.Form methods={methods}>
				<kit.Body />
				<kit.Footer />
			</kit.Form>
		</div>
	</kit.Surface>
);

export const ExternalTypedKitDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<DrawerFromKit
		methods={methods}
		kit={{
			Surface: DrawerContent,
			Form: DrawerForm,
			Body: DrawerBody,
			Footer: DrawerFooter,
		}}
	/>
);
`;

// ---------------------------------------------------------------------------
// Round 26's BLOCKER 2 — the ordinary components-as-props SPLIT across files.
// The child writes `<kit.Surface>` etc. with NO drawer import of its own; the
// parent imports the four drawer exports and passes them into the child as a
// prop. Neither file alone satisfies round 15's same-file discriminator
// (`importsDrawerModule && hasUnverifiableTag`): the child has unverifiable
// tags but no import, the parent has the import but no opaque tags — so the
// whole #990 construction dropped out of discovery. Discovery must reason
// across the module graph: the child is a candidate (unresolved drawer-shaped
// tags) regardless of where the imports live, the parent is the anchor (it
// passes drawer exports into another component), and the pair fails closed.
// ---------------------------------------------------------------------------

const TEMPORARY_CROSSFILE_KIT_CHILD_FILE =
	'src/components/ui/_drawer-surface-r26-crossfile-kit-child.tsx';
const TEMPORARY_CROSSFILE_KIT_CHILD_PATH = fixturePath(
	TEMPORARY_CROSSFILE_KIT_CHILD_FILE,
);
const TEMPORARY_CROSSFILE_KIT_CHILD_SOURCE = `import type { FC } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';

type Kit = {
	Surface: FC;
	Form: FC;
	Body: FC;
	Footer: FC;
};

type KitProps = {
	kit: Kit;
	methods: UseFormReturn<FieldValues>;
};

export const CrossFileKitDrawer = ({ kit, methods }: KitProps) => (
	<kit.Surface>
		<div className="p-4">
			<kit.Form methods={methods}>
				<kit.Body />
				<kit.Footer />
			</kit.Form>
		</div>
	</kit.Surface>
);
`;

const TEMPORARY_CROSSFILE_KIT_DRAWER_FILE =
	'src/components/ui/_drawer-surface-r26-crossfile-kit-drawer.tsx';
const TEMPORARY_CROSSFILE_KIT_DRAWER_PATH = fixturePath(
	TEMPORARY_CROSSFILE_KIT_DRAWER_FILE,
);
const TEMPORARY_CROSSFILE_KIT_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerContent, DrawerFooter, DrawerForm } from '~/components/ui/drawer';
import { CrossFileKitDrawer } from './_drawer-surface-r26-crossfile-kit-child';

export const CrossFileParameterKitDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<CrossFileKitDrawer
		methods={methods}
		kit={{
			Surface: DrawerContent,
			Form: DrawerForm,
			Body: DrawerBody,
			Footer: DrawerFooter,
		}}
	/>
);
`;

// The BLOCKER 2 control: the SAME cross-file split, but the parent passes only
// real local components into the child — no drawer export flows across the
// module graph, so the child's opaque `kit.*` tags are never anchored and the
// pair stays out of the inventory entirely.
const TEMPORARY_CROSSFILE_KIT_CLEAN_CHILD_FILE =
	'src/components/ui/_drawer-surface-r26-crossfile-kit-clean-child.tsx';
const TEMPORARY_CROSSFILE_KIT_CLEAN_CHILD_PATH = fixturePath(
	TEMPORARY_CROSSFILE_KIT_CLEAN_CHILD_FILE,
);
const TEMPORARY_CROSSFILE_KIT_CLEAN_CHILD_SOURCE = `import type { FC } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';

type Kit = {
	Surface: FC;
	Form: FC;
	Body: FC;
	Footer: FC;
};

type KitProps = {
	kit: Kit;
	methods: UseFormReturn<FieldValues>;
};

export const CleanCrossFileKitDrawer = ({ kit, methods }: KitProps) => (
	<kit.Surface>
		<kit.Form methods={methods}>
			<kit.Body />
			<kit.Footer />
		</kit.Form>
	</kit.Surface>
);
`;

const TEMPORARY_CROSSFILE_KIT_CLEAN_DRAWER_FILE =
	'src/components/ui/_drawer-surface-r26-crossfile-kit-clean-drawer.tsx';
const TEMPORARY_CROSSFILE_KIT_CLEAN_DRAWER_PATH = fixturePath(
	TEMPORARY_CROSSFILE_KIT_CLEAN_DRAWER_FILE,
);
const TEMPORARY_CROSSFILE_KIT_CLEAN_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { CleanCrossFileKitDrawer } from './_drawer-surface-r26-crossfile-kit-clean-child';

const LocalSurface = () => <div data-testid="r26-clean-surface" />;
const LocalForm = ({
	methods,
	children,
}: {
	methods: UseFormReturn<FieldValues>;
	children: React.ReactNode;
}) => <form data-testid="r26-clean-form">{children}</form>;
const LocalBody = () => <div data-testid="r26-clean-body" />;
const LocalFooter = () => <div data-testid="r26-clean-footer" />;

export const CleanCrossFileParameterKitDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<CleanCrossFileKitDrawer
		methods={methods}
		kit={{
			Surface: LocalSurface,
			Form: LocalForm,
			Body: LocalBody,
			Footer: LocalFooter,
		}}
	/>
);
`;

// ---------------------------------------------------------------------------
// Round 28's BLOCKER 1 — the identifier-initialised kit. The anchor probe
// used to read only INLINE prop values, so moving the very same object to a
// `const kit = { ... }` binding and passing `kit={kit}` made the edge from
// the parent to the opaque child disappear: classification said the binding
// is a real local value (true — an object literal is never the drawer
// module's symbol) and the graph recorded "no edge", so both files fell
// through the silent gate while the child rendered the exact broken chain.
// The probe now follows the binding's VALUE SIDE — the object literal — and
// classifies its properties like the inline form, so `const kit` passes the
// same verdict as the literal it holds.
// ---------------------------------------------------------------------------

const TEMPORARY_CROSSFILE_CONST_KIT_CHILD_FILE =
	'src/components/ui/_drawer-surface-r28-crossfile-kit-const-child.tsx';
const TEMPORARY_CROSSFILE_CONST_KIT_CHILD_PATH = fixturePath(
	TEMPORARY_CROSSFILE_CONST_KIT_CHILD_FILE,
);
const TEMPORARY_CROSSFILE_CONST_KIT_CHILD_SOURCE = `import type { FC } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';

type Kit = {
	Surface: FC;
	Form: FC;
	Body: FC;
	Footer: FC;
};

type KitProps = {
	kit: Kit;
	methods: UseFormReturn<FieldValues>;
};

export const CrossFileConstKitDrawer = ({ kit, methods }: KitProps) => (
	<kit.Surface>
		<div className="p-4">
			<kit.Form methods={methods}>
				<kit.Body />
				<kit.Footer />
			</kit.Form>
		</div>
	</kit.Surface>
);
`;

const TEMPORARY_CROSSFILE_CONST_KIT_DRAWER_FILE =
	'src/components/ui/_drawer-surface-r28-crossfile-kit-const-drawer.tsx';
const TEMPORARY_CROSSFILE_CONST_KIT_DRAWER_PATH = fixturePath(
	TEMPORARY_CROSSFILE_CONST_KIT_DRAWER_FILE,
);
const TEMPORARY_CROSSFILE_CONST_KIT_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerContent, DrawerFooter, DrawerForm } from '~/components/ui/drawer';
import { CrossFileConstKitDrawer } from './_drawer-surface-r28-crossfile-kit-const-child';

const kit = {
	Surface: DrawerContent,
	Form: DrawerForm,
	Body: DrawerBody,
	Footer: DrawerFooter,
};

export const CrossFileConstKitDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => <CrossFileConstKitDrawer methods={methods} kit={kit} />;
`;

// The BLOCKER 1 control: the SAME const-kit spelling with only real local
// components — no drawer export flows across the module graph, so the pair
// stays out of the inventory entirely.
const TEMPORARY_CROSSFILE_CONST_KIT_CLEAN_CHILD_FILE =
	'src/components/ui/_drawer-surface-r28-crossfile-kit-const-clean-child.tsx';
const TEMPORARY_CROSSFILE_CONST_KIT_CLEAN_CHILD_PATH = fixturePath(
	TEMPORARY_CROSSFILE_CONST_KIT_CLEAN_CHILD_FILE,
);
const TEMPORARY_CROSSFILE_CONST_KIT_CLEAN_CHILD_SOURCE = `import type { FC } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';

type Kit = {
	Surface: FC;
	Form: FC;
	Body: FC;
	Footer: FC;
};

type KitProps = {
	kit: Kit;
	methods: UseFormReturn<FieldValues>;
};

export const CleanCrossFileConstKitDrawer = ({ kit, methods }: KitProps) => (
	<kit.Surface>
		<kit.Form methods={methods}>
			<kit.Body />
			<kit.Footer />
		</kit.Form>
	</kit.Surface>
);
`;

const TEMPORARY_CROSSFILE_CONST_KIT_CLEAN_DRAWER_FILE =
	'src/components/ui/_drawer-surface-r28-crossfile-kit-const-clean-drawer.tsx';
const TEMPORARY_CROSSFILE_CONST_KIT_CLEAN_DRAWER_PATH = fixturePath(
	TEMPORARY_CROSSFILE_CONST_KIT_CLEAN_DRAWER_FILE,
);
const TEMPORARY_CROSSFILE_CONST_KIT_CLEAN_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { CleanCrossFileConstKitDrawer } from './_drawer-surface-r28-crossfile-kit-const-clean-child';

const LocalSurface = () => <div data-testid="r28-const-clean-surface" />;
const LocalForm = ({
	methods,
	children,
}: {
	methods: UseFormReturn<FieldValues>;
	children: React.ReactNode;
}) => <form data-testid="r28-const-clean-form">{children}</form>;
const LocalBody = () => <div data-testid="r28-const-clean-body" />;
const LocalFooter = () => <div data-testid="r28-const-clean-footer" />;

const kit = {
	Surface: LocalSurface,
	Form: LocalForm,
	Body: LocalBody,
	Footer: LocalFooter,
};

export const CleanCrossFileConstKitDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => <CleanCrossFileConstKitDrawer methods={methods} kit={kit} />;
`;

// ---------------------------------------------------------------------------
// Round 28's BLOCKER 2 — parameter forwarding. The graph comments claimed
// transitive closure, but a component parameter was classified as a definite
// local value, so `({ kit }) => <CrossFileKitDrawer kit={kit} />` lost the
// forwarder-to-child edge: the parent-to-forwarder edge was recorded, the
// forwarder-to-opaque-child edge was not, and both files fell through the
// silent gate. A parameter's value comes from call sites — the honest probe
// answer is UNRESOLVED — and the unresolved edge from the anchored forwarder
// forces the child to surface.
// ---------------------------------------------------------------------------

const TEMPORARY_CROSSFILE_FORWARDED_KIT_CHILD_FILE =
	'src/components/ui/_drawer-surface-r28-crossfile-kit-forwarded-child.tsx';
const TEMPORARY_CROSSFILE_FORWARDED_KIT_CHILD_PATH = fixturePath(
	TEMPORARY_CROSSFILE_FORWARDED_KIT_CHILD_FILE,
);
const TEMPORARY_CROSSFILE_FORWARDED_KIT_CHILD_SOURCE = `import type { FC } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';

type Kit = {
	Surface: FC;
	Form: FC;
	Body: FC;
	Footer: FC;
};

type KitProps = {
	kit: Kit;
	methods: UseFormReturn<FieldValues>;
};

export const CrossFileForwardedKitDrawer = ({ kit, methods }: KitProps) => (
	<kit.Surface>
		<div className="p-4">
			<kit.Form methods={methods}>
				<kit.Body />
				<kit.Footer />
			</kit.Form>
		</div>
	</kit.Surface>
);
`;

const TEMPORARY_CROSSFILE_FORWARDED_KIT_DRAWER_FILE =
	'src/components/ui/_drawer-surface-r28-crossfile-kit-forwarded-drawer.tsx';
const TEMPORARY_CROSSFILE_FORWARDED_KIT_DRAWER_PATH = fixturePath(
	TEMPORARY_CROSSFILE_FORWARDED_KIT_DRAWER_FILE,
);
const TEMPORARY_CROSSFILE_FORWARDED_KIT_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerContent, DrawerFooter, DrawerForm } from '~/components/ui/drawer';
import { CrossFileForwardedKitDrawer } from './_drawer-surface-r28-crossfile-kit-forwarded-child';

type ForwardedKitProps = {
	kit: {
		Surface: typeof DrawerContent;
		Form: typeof DrawerForm;
		Body: typeof DrawerBody;
		Footer: typeof DrawerFooter;
	};
	methods: UseFormReturn<FieldValues>;
};

const ForwardedKitDrawer = ({ kit, methods }: ForwardedKitProps) => (
	<CrossFileForwardedKitDrawer methods={methods} kit={kit} />
);

export const CrossFileForwardedKitDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<ForwardedKitDrawer
		methods={methods}
		kit={{
			Surface: DrawerContent,
			Form: DrawerForm,
			Body: DrawerBody,
			Footer: DrawerFooter,
		}}
	/>
);
`;

// The BLOCKER 2 control: the SAME forwarding shape, but the call site passes
// only real local components. The forwarder still forwards a parameter
// (UNRESOLVED), but nothing anchors it — the forwarder never receives drawer
// exports — so the pair stays out of the inventory entirely.
const TEMPORARY_CROSSFILE_FORWARDED_KIT_CLEAN_CHILD_FILE =
	'src/components/ui/_drawer-surface-r28-crossfile-kit-forwarded-clean-child.tsx';
const TEMPORARY_CROSSFILE_FORWARDED_KIT_CLEAN_CHILD_PATH = fixturePath(
	TEMPORARY_CROSSFILE_FORWARDED_KIT_CLEAN_CHILD_FILE,
);
const TEMPORARY_CROSSFILE_FORWARDED_KIT_CLEAN_CHILD_SOURCE = `import type { FC } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';

type Kit = {
	Surface: FC;
	Form: FC;
	Body: FC;
	Footer: FC;
};

type KitProps = {
	kit: Kit;
	methods: UseFormReturn<FieldValues>;
};

export const CleanCrossFileForwardedKitDrawer = ({
	kit,
	methods,
}: KitProps) => (
	<kit.Surface>
		<kit.Form methods={methods}>
			<kit.Body />
			<kit.Footer />
		</kit.Form>
	</kit.Surface>
);
`;

const TEMPORARY_CROSSFILE_FORWARDED_KIT_CLEAN_DRAWER_FILE =
	'src/components/ui/_drawer-surface-r28-crossfile-kit-forwarded-clean-drawer.tsx';
const TEMPORARY_CROSSFILE_FORWARDED_KIT_CLEAN_DRAWER_PATH = fixturePath(
	TEMPORARY_CROSSFILE_FORWARDED_KIT_CLEAN_DRAWER_FILE,
);
const TEMPORARY_CROSSFILE_FORWARDED_KIT_CLEAN_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { CleanCrossFileForwardedKitDrawer } from './_drawer-surface-r28-crossfile-kit-forwarded-clean-child';

const LocalSurface = () => <div data-testid="r28-forwarded-clean-surface" />;
const LocalForm = ({
	methods,
	children,
}: {
	methods: UseFormReturn<FieldValues>;
	children: React.ReactNode;
}) => <form data-testid="r28-forwarded-clean-form">{children}</form>;
const LocalBody = () => <div data-testid="r28-forwarded-clean-body" />;
const LocalFooter = () => <div data-testid="r28-forwarded-clean-footer" />;

type ForwardedKitProps = {
	kit: {
		Surface: typeof LocalSurface;
		Form: typeof LocalForm;
		Body: typeof LocalBody;
		Footer: typeof LocalFooter;
	};
	methods: UseFormReturn<FieldValues>;
};

const ForwardedKitDrawer = ({ kit, methods }: ForwardedKitProps) => (
	<CleanCrossFileForwardedKitDrawer methods={methods} kit={kit} />
);

export const CleanCrossFileForwardedKitDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<ForwardedKitDrawer
		methods={methods}
		kit={{
			Surface: LocalSurface,
			Form: LocalForm,
			Body: LocalBody,
			Footer: LocalFooter,
		}}
	/>
);
`;

// ---------------------------------------------------------------------------
// Round 28's BLOCKER 3 — a default-imported component definition. The import
// loop in resolveComponentDefinition read only named imports, so a child that
// exports its kit drawer as `export default` and a parent that imports it
// default-style produced NO edge: the pair's halves each lacked the
// same-file discriminator and both fell through the silent gate. A default
// import is a normal in-repo arrangement — the definition must resolve
// through the same module machinery, including `export default <local
// binding>`.
// ---------------------------------------------------------------------------

const TEMPORARY_CROSSFILE_DEFAULT_KIT_CHILD_FILE =
	'src/components/ui/_drawer-surface-r28-crossfile-kit-default-child.tsx';
const TEMPORARY_CROSSFILE_DEFAULT_KIT_CHILD_PATH = fixturePath(
	TEMPORARY_CROSSFILE_DEFAULT_KIT_CHILD_FILE,
);
const TEMPORARY_CROSSFILE_DEFAULT_KIT_CHILD_SOURCE = `import type { FC } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';

type Kit = {
	Surface: FC;
	Form: FC;
	Body: FC;
	Footer: FC;
};

type KitProps = {
	kit: Kit;
	methods: UseFormReturn<FieldValues>;
};

export const CrossFileDefaultKitDrawer = ({ kit, methods }: KitProps) => (
	<kit.Surface>
		<div className="p-4">
			<kit.Form methods={methods}>
				<kit.Body />
				<kit.Footer />
			</kit.Form>
		</div>
	</kit.Surface>
);

export default CrossFileDefaultKitDrawer;
`;

const TEMPORARY_CROSSFILE_DEFAULT_KIT_DRAWER_FILE =
	'src/components/ui/_drawer-surface-r28-crossfile-kit-default-drawer.tsx';
const TEMPORARY_CROSSFILE_DEFAULT_KIT_DRAWER_PATH = fixturePath(
	TEMPORARY_CROSSFILE_DEFAULT_KIT_DRAWER_FILE,
);
const TEMPORARY_CROSSFILE_DEFAULT_KIT_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerContent, DrawerFooter, DrawerForm } from '~/components/ui/drawer';
import CrossFileDefaultKitDrawer from './_drawer-surface-r28-crossfile-kit-default-child';

export const CrossFileDefaultKitDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<CrossFileDefaultKitDrawer
		methods={methods}
		kit={{
			Surface: DrawerContent,
			Form: DrawerForm,
			Body: DrawerBody,
			Footer: DrawerFooter,
		}}
	/>
);
`;

// The BLOCKER 3 control: the SAME default-export/default-import arrangement
// with only real local components flowing across — no drawer signal, so the
// pair stays out of the inventory.
const TEMPORARY_CROSSFILE_DEFAULT_KIT_CLEAN_CHILD_FILE =
	'src/components/ui/_drawer-surface-r28-crossfile-kit-default-clean-child.tsx';
const TEMPORARY_CROSSFILE_DEFAULT_KIT_CLEAN_CHILD_PATH = fixturePath(
	TEMPORARY_CROSSFILE_DEFAULT_KIT_CLEAN_CHILD_FILE,
);
const TEMPORARY_CROSSFILE_DEFAULT_KIT_CLEAN_CHILD_SOURCE = `import type { FC } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';

type Kit = {
	Surface: FC;
	Form: FC;
	Body: FC;
	Footer: FC;
};

type KitProps = {
	kit: Kit;
	methods: UseFormReturn<FieldValues>;
};

export const CleanCrossFileDefaultKitDrawer = ({ kit, methods }: KitProps) => (
	<kit.Surface>
		<kit.Form methods={methods}>
			<kit.Body />
			<kit.Footer />
		</kit.Form>
	</kit.Surface>
);

export default CleanCrossFileDefaultKitDrawer;
`;

const TEMPORARY_CROSSFILE_DEFAULT_KIT_CLEAN_DRAWER_FILE =
	'src/components/ui/_drawer-surface-r28-crossfile-kit-default-clean-drawer.tsx';
const TEMPORARY_CROSSFILE_DEFAULT_KIT_CLEAN_DRAWER_PATH = fixturePath(
	TEMPORARY_CROSSFILE_DEFAULT_KIT_CLEAN_DRAWER_FILE,
);
const TEMPORARY_CROSSFILE_DEFAULT_KIT_CLEAN_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import CleanCrossFileDefaultKitDrawer from './_drawer-surface-r28-crossfile-kit-default-clean-child';

const LocalSurface = () => <div data-testid="r28-default-clean-surface" />;
const LocalForm = ({
	methods,
	children,
}: {
	methods: UseFormReturn<FieldValues>;
	children: React.ReactNode;
}) => <form data-testid="r28-default-clean-form">{children}</form>;
const LocalBody = () => <div data-testid="r28-default-clean-body" />;
const LocalFooter = () => <div data-testid="r28-default-clean-footer" />;

export const CleanCrossFileDefaultKitDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<CleanCrossFileDefaultKitDrawer
		methods={methods}
		kit={{
			Surface: LocalSurface,
			Form: LocalForm,
			Body: LocalBody,
			Footer: LocalFooter,
		}}
	/>
);
`;

// ---------------------------------------------------------------------------
// Round 28's BLOCKER 4 — array mutation through a helper parameter. The
// round-26 receiver change resolved a mutation receiver only when the
// receiver itself followed to the traced array literal; a helper parameter
// has no such initializer, so `appendDrawerKit(alias)` (whose body pushes
// the real drawer kit) was invisible — the callback was classified from the
// old local-only literal, every member read definite NOT_DRAWER, and the
// appended real drawer kit disappeared. Passing the array into a helper is
// exactly where the writes cannot be seen, so the escape makes the literal
// unsafe to classify: UNVERIFIABLE, not "unmutated".
// ---------------------------------------------------------------------------

const TEMPORARY_HELPER_MUTATED_ARRAY_KIT_DRAWER_FILE =
	'src/components/ui/_drawer-surface-r28-helper-mutated-array-kit-fixture.tsx';
const TEMPORARY_HELPER_MUTATED_ARRAY_KIT_DRAWER_PATH = fixturePath(
	TEMPORARY_HELPER_MUTATED_ARRAY_KIT_DRAWER_FILE,
);
const TEMPORARY_HELPER_MUTATED_ARRAY_KIT_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerContent, DrawerFooter, DrawerForm } from '~/components/ui/drawer';

type DrawerKit = {
	Surface: typeof DrawerContent;
	Form: typeof DrawerForm;
	Body: typeof DrawerBody;
	Footer: typeof DrawerFooter;
};

const LocalSurface = (() => <div />) as typeof DrawerContent;
const LocalForm = (({ methods: _methods }: { methods: UseFormReturn<FieldValues> }) => {
	void _methods;
	return <form />;
}) as typeof DrawerForm;
const LocalBody = (() => <div />) as typeof DrawerBody;
const LocalFooter = (() => <div />) as typeof DrawerFooter;

const kits: DrawerKit[] = [
	{
		Surface: LocalSurface,
		Form: LocalForm,
		Body: LocalBody,
		Footer: LocalFooter,
	},
];
const alias = kits;

const appendDrawerKit = (target: DrawerKit[]) =>
	target.push({
		Surface: DrawerContent,
		Form: DrawerForm,
		Body: DrawerBody,
		Footer: DrawerFooter,
	});

appendDrawerKit(alias);

export const HelperMutatedArrayKitDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<>
		{kits.map((kit) => (
			<kit.Surface>
				<div className="p-4">
					<kit.Form methods={methods}>
						<kit.Body />
						<kit.Footer />
					</kit.Form>
				</div>
			</kit.Surface>
		))}
	</>
);
`;

// The BLOCKER 4 control: the SAME helper-escape shape, but the helper
// receives a DIFFERENT array — the traced `kits` array never escapes, so its
// literal stays trustworthy, the real drawer exports resolve, and the broken
// chain is discovered and rejected for its own structural reason.
const TEMPORARY_HELPER_OTHER_ARRAY_KIT_DRAWER_FILE =
	'src/components/ui/_drawer-surface-r28-helper-other-array-kit-fixture.tsx';
const TEMPORARY_HELPER_OTHER_ARRAY_KIT_DRAWER_PATH = fixturePath(
	TEMPORARY_HELPER_OTHER_ARRAY_KIT_DRAWER_FILE,
);
const TEMPORARY_HELPER_OTHER_ARRAY_KIT_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { DrawerBody, DrawerContent, DrawerFooter, DrawerForm } from '~/components/ui/drawer';

type DrawerKit = {
	Surface: typeof DrawerContent;
	Form: typeof DrawerForm;
	Body: typeof DrawerBody;
	Footer: typeof DrawerFooter;
};

const kits: DrawerKit[] = [
	{
		Surface: DrawerContent,
		Form: DrawerForm,
		Body: DrawerBody,
		Footer: DrawerFooter,
	},
];

const other: DrawerKit[] = [];
const appendDrawerKit = (target: DrawerKit[]) =>
	target.push({
		Surface: DrawerContent,
		Form: DrawerForm,
		Body: DrawerBody,
		Footer: DrawerFooter,
	});

appendDrawerKit(other);

export const HelperOtherArrayKitDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<>
		{kits.map((kit) => (
			<kit.Surface>
				<div className="p-4">
					<kit.Form methods={methods}>
						<kit.Body />
						<kit.Footer />
					</kit.Form>
				</div>
			</kit.Surface>
		))}
	</>
);
`;

// ---------------------------------------------------------------------------
// The fixture registry. The round-16 scan loads ONE ts-morph project once
// (see getScanProject below) with every file it can ever touch, so every
// fixture the suite will write must already exist on disk before the first
// scan. This registry pre-writes them all at module scope; the per-test
// writeFileSync calls become rewrites of the same content (the freshness
// reconciliation detects identical content and does not re-read).
// ---------------------------------------------------------------------------

const FIXTURE_FILES: ReadonlyArray<{
	file: string;
	source: string;
}> = [
	{ file: TEMPORARY_NEW_DRAWER_FILE, source: TEMPORARY_NEW_DRAWER_SOURCE },
	{
		file: TEMPORARY_ALIASED_DRAWER_FILE,
		source: TEMPORARY_ALIASED_DRAWER_SOURCE,
	},
	{ file: TEMPORARY_BARREL_FILE, source: TEMPORARY_BARREL_SOURCE },
	{
		file: TEMPORARY_BARREL_CALL_SITE_FILE,
		source: TEMPORARY_BARREL_CALL_SITE_SOURCE,
	},
	{
		file: TEMPORARY_NAMESPACE_DRAWER_FILE,
		source: TEMPORARY_NAMESPACE_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_REGRESSED_DRAWER_FILE,
		source: TEMPORARY_REGRESSED_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_ALIASED_PARTS_DRAWER_FILE,
		source: TEMPORARY_ALIASED_PARTS_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_ALIASED_BARREL_PARTS_FILE,
		source: TEMPORARY_ALIASED_BARREL_PARTS_SOURCE,
	},
	{
		file: TEMPORARY_ALIASED_BARREL_PARTS_CALL_SITE_FILE,
		source: TEMPORARY_ALIASED_BARREL_PARTS_CALL_SITE_SOURCE,
	},
	{
		file: TEMPORARY_LOCAL_SHADOW_DRAWER_FILE,
		source: TEMPORARY_LOCAL_SHADOW_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_UNRESOLVED_DRAWER_FILE,
		source: TEMPORARY_UNRESOLVED_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_BARE_WRAPPER_DRAWER_FILE,
		source: TEMPORARY_BARE_WRAPPER_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_CONDITIONAL_DRAWER_FILE,
		source: TEMPORARY_CONDITIONAL_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_NODELESS_WRAPPERS_DRAWER_FILE,
		source: TEMPORARY_NODELESS_WRAPPERS_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_DEFINITION_HELPER_FILE,
		source: TEMPORARY_DEFINITION_HELPER_SOURCE,
	},
	{
		file: TEMPORARY_DIV_WRAPPED_PARTS_DRAWER_FILE,
		source: TEMPORARY_DIV_WRAPPED_PARTS_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_FOOTER_ONLY_DRAWER_FILE,
		source: TEMPORARY_FOOTER_ONLY_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_DIV_ABOVE_FORM_DRAWER_FILE,
		source: TEMPORARY_DIV_ABOVE_FORM_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_HELPER_HIDDEN_DIV_ABOVE_FORM_DRAWER_FILE,
		source: TEMPORARY_HELPER_HIDDEN_DIV_ABOVE_FORM_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_FAKE_SUSPENSE_DRAWER_FILE,
		source: TEMPORARY_FAKE_SUSPENSE_DRAWER_SOURCE,
	},
	{ file: TEMPORARY_NS_BARREL_FILE, source: TEMPORARY_NS_BARREL_SOURCE },
	{
		file: TEMPORARY_NS_BARREL_CALL_SITE_FILE,
		source: TEMPORARY_NS_BARREL_CALL_SITE_SOURCE,
	},
	{
		file: TEMPORARY_CONDITIONAL_SAME_SYMBOL_DRAWER_FILE,
		source: TEMPORARY_CONDITIONAL_SAME_SYMBOL_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_CONDITIONAL_MIXED_FORM_DRAWER_FILE,
		source: TEMPORARY_CONDITIONAL_MIXED_FORM_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_REASSIGNED_FORM_DRAWER_FILE,
		source: TEMPORARY_REASSIGNED_FORM_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_NESTED_RETURN_PARTS_FILE,
		source: TEMPORARY_NESTED_RETURN_PARTS_SOURCE,
	},
	{
		file: TEMPORARY_NESTED_RETURN_DIV_DRAWER_FILE,
		source: TEMPORARY_NESTED_RETURN_DIV_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_CONDITIONED_NESTED_RETURN_PARTS_FILE,
		source: TEMPORARY_CONDITIONED_NESTED_RETURN_PARTS_SOURCE,
	},
	{
		file: TEMPORARY_CONDITIONED_NESTED_RETURN_DRAWER_FILE,
		source: TEMPORARY_CONDITIONED_NESTED_RETURN_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_EARLY_RETURN_PARTS_FILE,
		source: TEMPORARY_EARLY_RETURN_PARTS_SOURCE,
	},
	{
		file: TEMPORARY_EARLY_RETURN_CLEAN_DRAWER_FILE,
		source: TEMPORARY_EARLY_RETURN_CLEAN_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_LITERAL_DEAD_BRANCH_PARTS_FILE,
		source: TEMPORARY_LITERAL_DEAD_BRANCH_PARTS_SOURCE,
	},
	{
		file: TEMPORARY_LITERAL_DEAD_BRANCH_DRAWER_FILE,
		source: TEMPORARY_LITERAL_DEAD_BRANCH_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_CROSSFILE_DIV_IN_HELPER_FILE,
		source: TEMPORARY_CROSSFILE_DIV_IN_HELPER_SOURCE,
	},
	{
		file: TEMPORARY_CROSSFILE_DIV_IN_HELPER_CALL_SITE_FILE,
		source: TEMPORARY_CROSSFILE_DIV_IN_HELPER_CALL_SITE_SOURCE,
	},
	{
		file: TEMPORARY_CROSSFILE_CLEAN_SECTIONS_FILE,
		source: TEMPORARY_CROSSFILE_CLEAN_SECTIONS_SOURCE,
	},
	{
		file: TEMPORARY_CROSSFILE_CLEAN_SECTIONS_CALL_SITE_FILE,
		source: TEMPORARY_CROSSFILE_CLEAN_SECTIONS_CALL_SITE_SOURCE,
	},
	{
		file: TEMPORARY_UNVERIFIABLE_TAG_DRAWER_FILE,
		source: TEMPORARY_UNVERIFIABLE_TAG_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_NS_BASE_ALIAS_DRAWER_FILE,
		source: TEMPORARY_NS_BASE_ALIAS_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_CROSSFILE_PARTS_FILE,
		source: TEMPORARY_CROSSFILE_PARTS_SOURCE,
	},
	{
		file: TEMPORARY_CROSSFILE_DIV_ABOVE_FORM_FILE,
		source: TEMPORARY_CROSSFILE_DIV_ABOVE_FORM_SOURCE,
	},
	{
		file: TEMPORARY_CROSSFILE_DIRECT_FORM_FILE,
		source: TEMPORARY_CROSSFILE_DIRECT_FORM_SOURCE,
	},
	{
		file: TEMPORARY_CROSSFILE_FORM_HELPER_FILE,
		source: TEMPORARY_CROSSFILE_FORM_HELPER_SOURCE,
	},
	{
		file: TEMPORARY_CROSSFILE_FORM_DIV_ABOVE_FILE,
		source: TEMPORARY_CROSSFILE_FORM_DIV_ABOVE_SOURCE,
	},
	{
		file: TEMPORARY_CROSSFILE_FORM_DIRECT_FILE,
		source: TEMPORARY_CROSSFILE_FORM_DIRECT_SOURCE,
	},
	{
		file: TEMPORARY_HELPER_DIV_WRAPPED_PART_FILE,
		source: TEMPORARY_HELPER_DIV_WRAPPED_PART_SOURCE,
	},
	{
		file: TEMPORARY_DIV_PASSTHROUGH_HELPER_FILE,
		source: TEMPORARY_DIV_PASSTHROUGH_HELPER_SOURCE,
	},
	{
		file: TEMPORARY_FRAGMENT_PASSTHROUGH_HELPER_FILE,
		source: TEMPORARY_FRAGMENT_PASSTHROUGH_HELPER_SOURCE,
	},
	{
		file: TEMPORARY_CHILDREN_IN_FORM_FILE,
		source: TEMPORARY_CHILDREN_IN_FORM_SOURCE,
	},
	{
		file: TEMPORARY_CHILDREN_IN_SURFACE_ELEMENT_FILE,
		source: TEMPORARY_CHILDREN_IN_SURFACE_ELEMENT_SOURCE,
	},
	{
		file: TEMPORARY_NONREACT_SUSPENSE_MODULE_FILE,
		source: TEMPORARY_NONREACT_SUSPENSE_MODULE_SOURCE,
	},
	{
		file: TEMPORARY_NAMED_NONREACT_SUSPENSE_FILE,
		source: TEMPORARY_NAMED_NONREACT_SUSPENSE_SOURCE,
	},
	{
		file: TEMPORARY_NS_MEMBER_NONREACT_SUSPENSE_FILE,
		source: TEMPORARY_NS_MEMBER_NONREACT_SUSPENSE_SOURCE,
	},
	{
		file: TEMPORARY_REACT_NS_SUSPENSE_FILE,
		source: TEMPORARY_REACT_NS_SUSPENSE_SOURCE,
	},
	{
		file: TEMPORARY_INNER_FORM_DIV_ABOVE_DRAWER_FILE,
		source: TEMPORARY_INNER_FORM_DIV_ABOVE_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_INNER_FORM_DIRECT_DRAWER_FILE,
		source: TEMPORARY_INNER_FORM_DIRECT_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_OBJECT_NS_DRAWER_FILE,
		source: TEMPORARY_OBJECT_NS_DRAWER_SOURCE,
	},
	{ file: TEMPORARY_SHIM_FILE, source: TEMPORARY_SHIM_SOURCE },
	{
		file: TEMPORARY_SHIM_CALL_SITE_FILE,
		source: TEMPORARY_SHIM_CALL_SITE_SOURCE,
	},
	{
		file: TEMPORARY_OPAQUE_DRAWER_FILE,
		source: TEMPORARY_OPAQUE_DRAWER_SOURCE,
	},
	{ file: TEMPORARY_LAZY_CHART_FILE, source: TEMPORARY_LAZY_CHART_SOURCE },
	{ file: TEMPORARY_LAZY_DRAWER_FILE, source: TEMPORARY_LAZY_DRAWER_SOURCE },
	{
		file: TEMPORARY_NONEXPORT_DRAWER_FILE,
		source: TEMPORARY_NONEXPORT_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_CONDITIONAL_SAME_SYMBOL_CLEAN_DRAWER_FILE,
		source: TEMPORARY_CONDITIONAL_SAME_SYMBOL_CLEAN_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_SHORTHAND_MAP_DRAWER_FILE,
		source: TEMPORARY_SHORTHAND_MAP_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_SHORTHAND_MAP_CLEAN_DRAWER_FILE,
		source: TEMPORARY_SHORTHAND_MAP_CLEAN_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_SCOPE_CACHE_DRAWER_FILE,
		source: TEMPORARY_SCOPE_CACHE_DRAWER_SOURCE,
	},
	{ file: TEMPORARY_R18_BARREL_FILE, source: TEMPORARY_R18_BARREL_SOURCE },
	{
		file: TEMPORARY_BARREL_OPAQUE_DRAWER_FILE,
		source: TEMPORARY_BARREL_OPAQUE_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_TYPE_ONLY_DRAWER_FILE,
		source: TEMPORARY_TYPE_ONLY_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_DESTRUCTURED_DRAWER_FILE,
		source: TEMPORARY_DESTRUCTURED_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_DOTTED_KIT_DRAWER_FILE,
		source: TEMPORARY_DOTTED_KIT_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_DOTTED_KIT_CLEAN_DRAWER_FILE,
		source: TEMPORARY_DOTTED_KIT_CLEAN_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_PROPSIG_DRAWER_FILE,
		source: TEMPORARY_PROPSIG_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_PROPSIG_CLEAN_DRAWER_FILE,
		source: TEMPORARY_PROPSIG_CLEAN_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_MEMBER_OF_PARAMETER_FILE,
		source: TEMPORARY_MEMBER_OF_PARAMETER_SOURCE,
	},
	{
		file: TEMPORARY_ARRAY_KIT_DRAWER_FILE,
		source: TEMPORARY_ARRAY_KIT_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_ARRAY_KIT_CLEAN_DRAWER_FILE,
		source: TEMPORARY_ARRAY_KIT_CLEAN_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_GETTER_KIT_DRAWER_FILE,
		source: TEMPORARY_GETTER_KIT_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_GETTER_KIT_CLEAN_DRAWER_FILE,
		source: TEMPORARY_GETTER_KIT_CLEAN_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_CONTENTS_WRAPPER_BROKEN_FILE,
		source: TEMPORARY_CONTENTS_WRAPPER_BROKEN_SOURCE,
	},
	{
		file: TEMPORARY_CONTENTS_WRAPPER_CLEAN_FILE,
		source: TEMPORARY_CONTENTS_WRAPPER_CLEAN_SOURCE,
	},
	{
		file: TEMPORARY_CONTENTS_BOX_RESTORING_FILE,
		source: TEMPORARY_CONTENTS_BOX_RESTORING_SOURCE,
	},
	{
		file: TEMPORARY_CONTENTS_BOX_RESTORING_TABLE_CELL_FILE,
		source: TEMPORARY_CONTENTS_BOX_RESTORING_TABLE_CELL_SOURCE,
	},
	{
		file: TEMPORARY_CONTENTS_STYLE_RESTORING_FILE,
		source: TEMPORARY_CONTENTS_STYLE_RESTORING_SOURCE,
	},
	{
		file: TEMPORARY_CONTENTS_STYLE_CLEAN_FILE,
		source: TEMPORARY_CONTENTS_STYLE_CLEAN_SOURCE,
	},
	{
		file: TEMPORARY_CONTENTS_STYLE_NON_DISPLAY_FILE,
		source: TEMPORARY_CONTENTS_STYLE_NON_DISPLAY_SOURCE,
	},
	{
		file: TEMPORARY_CONTENTS_STYLE_UNDECIDABLE_FILE,
		source: TEMPORARY_CONTENTS_STYLE_UNDECIDABLE_SOURCE,
	},
	{
		file: TEMPORARY_CONTENTS_STYLE_SPREAD_RESTORING_FILE,
		source: TEMPORARY_CONTENTS_STYLE_SPREAD_RESTORING_SOURCE,
	},
	{
		file: TEMPORARY_PARAMETER_KIT_DRAWER_FILE,
		source: TEMPORARY_PARAMETER_KIT_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_SETTER_GETTER_KIT_DRAWER_FILE,
		source: TEMPORARY_SETTER_GETTER_KIT_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_METHOD_KIT_DRAWER_FILE,
		source: TEMPORARY_METHOD_KIT_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_MUTATED_ARRAY_KIT_DRAWER_FILE,
		source: TEMPORARY_MUTATED_ARRAY_KIT_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_ALIASED_MUTATED_ARRAY_KIT_DRAWER_FILE,
		source: TEMPORARY_ALIASED_MUTATED_ARRAY_KIT_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_EXTERNAL_TYPED_KIT_DRAWER_FILE,
		source: TEMPORARY_EXTERNAL_TYPED_KIT_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_CROSSFILE_KIT_CHILD_FILE,
		source: TEMPORARY_CROSSFILE_KIT_CHILD_SOURCE,
	},
	{
		file: TEMPORARY_CROSSFILE_KIT_DRAWER_FILE,
		source: TEMPORARY_CROSSFILE_KIT_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_CROSSFILE_KIT_CLEAN_CHILD_FILE,
		source: TEMPORARY_CROSSFILE_KIT_CLEAN_CHILD_SOURCE,
	},
	{
		file: TEMPORARY_CROSSFILE_KIT_CLEAN_DRAWER_FILE,
		source: TEMPORARY_CROSSFILE_KIT_CLEAN_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_CROSSFILE_CONST_KIT_CHILD_FILE,
		source: TEMPORARY_CROSSFILE_CONST_KIT_CHILD_SOURCE,
	},
	{
		file: TEMPORARY_CROSSFILE_CONST_KIT_DRAWER_FILE,
		source: TEMPORARY_CROSSFILE_CONST_KIT_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_CROSSFILE_CONST_KIT_CLEAN_CHILD_FILE,
		source: TEMPORARY_CROSSFILE_CONST_KIT_CLEAN_CHILD_SOURCE,
	},
	{
		file: TEMPORARY_CROSSFILE_CONST_KIT_CLEAN_DRAWER_FILE,
		source: TEMPORARY_CROSSFILE_CONST_KIT_CLEAN_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_CROSSFILE_FORWARDED_KIT_CHILD_FILE,
		source: TEMPORARY_CROSSFILE_FORWARDED_KIT_CHILD_SOURCE,
	},
	{
		file: TEMPORARY_CROSSFILE_FORWARDED_KIT_DRAWER_FILE,
		source: TEMPORARY_CROSSFILE_FORWARDED_KIT_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_CROSSFILE_FORWARDED_KIT_CLEAN_CHILD_FILE,
		source: TEMPORARY_CROSSFILE_FORWARDED_KIT_CLEAN_CHILD_SOURCE,
	},
	{
		file: TEMPORARY_CROSSFILE_FORWARDED_KIT_CLEAN_DRAWER_FILE,
		source: TEMPORARY_CROSSFILE_FORWARDED_KIT_CLEAN_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_CROSSFILE_DEFAULT_KIT_CHILD_FILE,
		source: TEMPORARY_CROSSFILE_DEFAULT_KIT_CHILD_SOURCE,
	},
	{
		file: TEMPORARY_CROSSFILE_DEFAULT_KIT_DRAWER_FILE,
		source: TEMPORARY_CROSSFILE_DEFAULT_KIT_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_CROSSFILE_DEFAULT_KIT_CLEAN_CHILD_FILE,
		source: TEMPORARY_CROSSFILE_DEFAULT_KIT_CLEAN_CHILD_SOURCE,
	},
	{
		file: TEMPORARY_CROSSFILE_DEFAULT_KIT_CLEAN_DRAWER_FILE,
		source: TEMPORARY_CROSSFILE_DEFAULT_KIT_CLEAN_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_HELPER_MUTATED_ARRAY_KIT_DRAWER_FILE,
		source: TEMPORARY_HELPER_MUTATED_ARRAY_KIT_DRAWER_SOURCE,
	},
	{
		file: TEMPORARY_HELPER_OTHER_ARRAY_KIT_DRAWER_FILE,
		source: TEMPORARY_HELPER_OTHER_ARRAY_KIT_DRAWER_SOURCE,
	},
];

for (const fixture of FIXTURE_FILES) {
	writeFileSync(fixturePath(fixture.file), fixture.source);
}

type ModuleResolution = {
	compilerOptions: ts.CompilerOptions;
	host: ts.ModuleResolutionHost;
};

const toPortableSourcePath = (filePath: string): string =>
	path.relative(FRONT_ROOT, filePath).split(path.sep).join('/');

// The scan's ts-morph Project is expensive to construct (tsconfig parse,
// module-resolution host, TypeScript checker) and the per-file ASTs dominate
// the rest of the work, so ONE project is shared by every scanDrawerSurfaces()
// call in the suite (round 10's MINOR 4 — the suite used to pay one full-src
// parse per assertion). Round 16 stops reconciling it: the project is loaded
// ONCE with every file the scan can ever touch — the whole src tree and every
// fixture the suite knows (FIXTURE_FILES pre-writes them at module scope) —
// and is never torn down, so the TypeScript checker it carries is created
// once and cached. A scan only refreshes files whose CONTENT changed (the
// freshness reconciliation below compares text, not just stamps — the
// fixture tests rewrite their files with identical content between scans,
// and a no-op refresh would rebuild the checker), and iterates the current
// on-disk file set while stale copies of deleted fixtures simply sit
// unvisited. Refreshing one file bumps the compiler program and rebuilds
// the checker once (~2s) — only the "rewritten between scans" test pays it.
let sharedScanProject: Project | null = null;

const allScannableFilePaths = (): string[] => {
	const results: string[] = [];
	const walk = (dir: string, extension: string | null): void => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const fullPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(fullPath, extension);
			} else if (
				entry.isFile() &&
				(extension === null || entry.name.endsWith(extension))
			) {
				results.push(fullPath);
			}
		}
	};
	walk(path.join(FRONT_ROOT, 'src'), '.tsx');
	walk(path.join(FRONT_ROOT, 'src'), '.ts');
	// Fixtures live in a per-run temp directory outside src (round 11's
	// IMPORTANT 3 — see FIXTURE_TMP_DIR). Every file in it — including the
	// `.ts` re-export barrels — is loaded up front.
	walk(FIXTURE_TMP_DIR, null);
	return results;
};

const getScanProject = (): Project => {
	if (!sharedScanProject) {
		const project = new Project({
			tsConfigFilePath: path.join(FRONT_ROOT, 'tsconfig.json'),
			skipAddingFilesFromTsConfig: true,
		});
		for (const filePath of allScannableFilePaths()) {
			project.addSourceFileAtPathIfExists(filePath);
		}
		sharedScanProject = project;
	}
	return sharedScanProject;
};

const walkCurrentFixtureFiles = (): string[] => {
	const results: string[] = [];
	const walk = (dir: string): void => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const fullPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(fullPath);
			} else if (entry.isFile()) {
				results.push(fullPath);
			}
		}
	};
	walk(FIXTURE_TMP_DIR);
	return results;
};

// Round 11's MINOR 5: the shared project never re-reads a path it has
// parsed, so a fixture rewritten between scans (same path, new content) was
// scanned as its old self — a silent false negative. The round-16
// reconciliation compares CONTENT, not just (size, mtime): a rewrite with
// identical content (which every fixture test performs — FIXTURE_FILES
// pre-wrote the same text at module scope) must not refresh anything,
// because refreshing bumps the compiler program and rebuilds the checker;
// a rewrite with different content re-reads the file once. Deleted files
// are simply not visited.
const sourceFileFreshness = new Map<string, { stamp: string; text: string }>();

// Round 28's BLOCKERs 1-3 make the anchor probe three-valued, which turns
// the per-tag component-definition resolution from a rarity (only props that
// provably carried a drawer export) into the ordinary case (every prop the
// probe cannot follow). The old per-scan definition cache paid the full
// lookup on every one of the suite's ~60 scans, blowing the first scan past
// the 30s test timeout. The definition of a tag in a file depends only on
// the ASTs, which are stable until a file's content actually changes
// (refreshChangedSourceFiles re-reads only changed files and rebuilds the
// checker) — so the cache lives at module scope and is dropped wholesale
// when any file refreshes, because a refreshed file gives every node new
// identity and anything that resolved through it is stale.
const sharedDefinitionCache = new Map<
	string,
	Map<string, DrawerSectionDefinition | null>
>();

// The same stability argument memoizes the per-file local-declaration map
// (name -> declaration) that findLocalComponentDeclaration walks.
const localDeclarationsByFile = new Map<string, Map<string, Node>>();

// ts.resolveModuleName performs file-system lookups; the (file, specifier)
// answer is deterministic for the fixed tsconfig, so it is cached at module
// scope too and dropped with the other caches on any refresh.
const sharedModuleResolutionCache = new Map<string, string | null>();

const refreshChangedSourceFiles = (
	project: Project,
	desiredFilePaths: Set<string>,
): void => {
	let refreshedAny = false;
	for (const filePath of desiredFilePaths) {
		// Other tree-walking guards plant transient fixtures under src/ and
		// unlink them in their own `finally` blocks; when suites run
		// concurrently a discovered path can vanish between discovery and
		// this refresh. A vanished file contributes no drawer surface — skip
		// it instead of failing the whole guard on someone else's cleanup.
		let stamp: string;
		try {
			const fresh = statSync(filePath, { bigint: true });
			stamp = `${fresh.size}:${fresh.mtimeNs}`;
		} catch (error) {
			if (
				error instanceof Error &&
				'code' in error &&
				(error as NodeJS.ErrnoException).code === 'ENOENT'
			) {
				continue;
			}
			throw error;
		}
		const loaded = sourceFileFreshness.get(filePath);
		if (loaded && loaded.stamp === stamp) {
			continue;
		}
		let diskText: string;
		try {
			diskText = readFileSync(filePath, 'utf8');
		} catch (error) {
			if (
				error instanceof Error &&
				'code' in error &&
				(error as NodeJS.ErrnoException).code === 'ENOENT'
			) {
				continue;
			}
			throw error;
		}
		const existing = project.getSourceFile(filePath);
		if (existing && existing.getFullText() === diskText) {
			sourceFileFreshness.set(filePath, { stamp, text: diskText });
			continue;
		}
		if (existing) {
			existing.refreshFromFileSystemSync();
		} else {
			project.addSourceFileAtPathIfExists(filePath);
		}
		sourceFileFreshness.set(filePath, { stamp, text: diskText });
		refreshedAny = true;
	}
	if (refreshedAny) {
		sharedDefinitionCache.clear();
		localDeclarationsByFile.clear();
		sharedModuleResolutionCache.clear();
	}
};

/**
 * True when the drawer module (src/components/ui/drawer.tsx) exports
 * `exportName` through a specifier-less `export { ... }` declaration. The
 * module's export list is a plain named list today; if that ever changes
 * (e.g. `export * from`), resolution reddens everywhere, so the guard learns.
 */
const drawerModuleExports = (project: Project, exportName: string): boolean =>
	project
		.getSourceFile(DRAWER_MODULE_PATH)
		?.getExportDeclarations()
		.filter(
			(declaration) => declaration.getModuleSpecifierValue() === undefined,
		)
		.some((declaration) =>
			declaration
				.getNamedExports()
				.some((specifier) => specifier.getName() === exportName),
		) ?? false;

// ---------------------------------------------------------------------------
// Round 16 — ask the TypeScript symbol resolver.
//
// Rounds 1-15 extended a hand-written declaration matcher one shape at a
// time, and every round a reviewer wrote the next shape in four lines:
// round 15's BLOCKER 1 (a local object-literal component map) and
// BLOCKER 2 (a cross-file `export const X = DrawerX` shim) both shipped
// the exact #990 defect with 58/58 green, because the matcher classified
// them as "definitely not the drawer module". This round deletes the
// matcher. A tag is a drawer marker iff its binding is the SAME VALUE as a
// drawer-module export — asked of TypeScript's own symbol graph:
// `getSymbol()` resolves the binding (scope-accurately), `getAliasedSymbol()`
// undoes import/barrel aliasing to the terminal declaration, and the
// terminal is the drawer module's symbol exactly when one of its
// declarations lives in the drawer module file and the module exports its
// name. Identity chains, object-literal members, cross-file shims,
// namespace members and same-symbol conditionals are all followed by
// recursing into the declarations the checker hands back — the class, not
// the enumeration. Round 18 closes the two escapes round 17 demonstrated
// against that recursion:
//
//  - the value walk enumerated declaration node kinds and its terminal was
//    `null` — "definitely not a drawer" — for anything it did not
//    enumerate, so `const Parts = { DrawerContent, ... }` (shorthand
//    properties) shipped the #990 break green (BLOCKER 1). Shorthand
//    members now resolve through the checker's OWN shorthand value symbol,
//    and the terminal default is UNVERIFIABLE: a declaration kind the
//    resolver does not handle reddens the file (the only nulls left are
//    kinds whose value IS the symbol — local function/class/parameter/
//    namespace/type declarations — which are definite non-drawers).
//  - the per-file tag-name index cached ONE answer per tag text and
//    applied it to every same-text node, so an earlier component whose
//    props were named `Surface`/`Form`/`Body`/`Footer` silenced a later
//    drawer built from imports under those same names (BLOCKER 2).
//    Resolution is now keyed on the actual tag-name node.
//
// Round 20 closes the two escapes round 19 demonstrated against that
// recursion — the fail-closed terminal is only as closed as the paths
// that reach it:
//
//  - BLOCKER 1: the intrinsic-element cut read `/^[a-z]/` against the
//    WHOLE tag text, so a LOWERCASE-leading DOTTED tag (`<kit.Surface>`,
//    `<option.Icon />` — the repo already writes this shape) was read as
//    an intrinsic DOM element — a definite non-drawer — with the exact
//    #990 break green. A member-expression tag is a value expression
//    regardless of case; only a plain Identifier tag can be intrinsic.
//  - BLOCKER 2: the checker resolves the member of a TYPE-ANNOTATED
//    object literal to the type's PropertySignature, and that kind sat in
//    the definite-non-drawer allowlist — `const KIT: DrawerKit = {...}`
//    resolved every marker to null with the break green, and the code
//    comment's claim that such a value is "still caught" by the walk was
//    false. The signature kinds are deleted from the allowlist, and a
//    type-side member is followed to its VALUE side — the annotated
//    object literal's own property — through the same symbol graph; a
//    value side the scan cannot read is UNVERIFIABLE, never null.
//
// A binding the graph cannot answer (a call, a mixed-symbol conditional, a
// reassigned `let`) is the unverifiable case below, never a silent
// non-anchor.
// ---------------------------------------------------------------------------

/**
 * True when `symbol` is one of the drawer module's exported symbols: a
 * declaration in the drawer module file, under a name the module's
 * specifier-less `export { ... }` list actually exports. This is the
 * declaration identity every resolution terminates at.
 */
const isDrawerModuleExportSymbol = (
	symbol: TsMorphSymbol,
	project: Project,
): boolean =>
	symbol
		.getDeclarations()
		.some(
			(declaration) =>
				declaration.getSourceFile().getFilePath() === DRAWER_MODULE_PATH,
		) && drawerModuleExports(project, symbol.getName());

// A file the scan can actually resolve against: the front app tree and the
// per-run fixture directory. Everything else (node_modules, ambient lib) is
// external — its values can never be the repo-local drawer module's exports.
const isRepoFilePath = (filePath: string): boolean =>
	filePath.startsWith(FRONT_ROOT) || filePath.startsWith(FIXTURE_TMP_DIR);

// The declaration kinds whose VALUE is the symbol itself — a local
// function/class/method declaration, a parameter, a namespace import or
// module object, a type, an enum. The value of such a binding is a local
// value, never the drawer module's exported symbol (identity was already
// disproven before the cut — see resolveSymbolValue), so the binding is a
// definite non-drawer. Round 18's round-19 amendment: the TYPE-side member
// kinds (PropertySignature, MethodSignature, IndexSignature) are NOT here —
// a type-side member is not evidence of absence; its value side must be
// walked (round 19's BLOCKER 2), and a member of a binding in this set is
// itself a definite local value (round 19's BLOCKER 1 paired proof).
// Round 21's BLOCKER 2 amendment: GetAccessor is NOT here either — property
// access INVOKES a getter and returns whatever it returns, so its own
// declaration is not evidence of absence the way a method/setter reference
// is; resolveSymbolValue resolves it through resolveGetAccessorValue
// instead, and only a getter this scan cannot resolve reaches UNVERIFIABLE.
const DEFINITE_LOCAL_DECLARATION_KINDS = new Set([
	SyntaxKind.FunctionDeclaration,
	SyntaxKind.ClassDeclaration,
	SyntaxKind.MethodDeclaration,
	SyntaxKind.SetAccessor,
	SyntaxKind.Parameter,
	SyntaxKind.NamespaceImport,
	SyntaxKind.NamespaceExportDeclaration,
	SyntaxKind.ModuleDeclaration,
	SyntaxKind.EnumDeclaration,
	SyntaxKind.EnumMember,
	SyntaxKind.InterfaceDeclaration,
	SyntaxKind.TypeAliasDeclaration,
	SyntaxKind.TypeParameter,
	SyntaxKind.SourceFile,
]);

/**
 * A call whose FIRST argument is a function expression or a dynamic
 * `import()` — a runtime component factory (`lazy`, `useMemo`, an HOC
 * wrapper). The factory class is decided by the argument's shape, not by
 * callee name, so the pair round 15 demanded is decided exactly:
 * `pick(DrawerContent)` passes an identifier and stays unverifiable (the
 * call could do anything with it), `lazy(() => ...)` passes a function and
 * is a factory (its value is the loader's result, and the loader is the
 * thing to resolve).
 */
const isFactoryCall = (call: CallExpression): boolean => {
	// Known runtime component factories by callee name — `memo`,
	// `forwardRef` and `lazy` (and their `React.`/`X.` namespace spellings)
	// add no DOM node of their own and pass their argument through
	// unchanged, so `memo(forwardRef((props) => ...))` is a factory too
	// (its first argument is a call, not a function — the argument-shape
	// check below alone would miss the composition).
	const calleeText = call.getExpression().getText();
	if (
		calleeText === 'memo' ||
		calleeText === 'forwardRef' ||
		calleeText === 'lazy' ||
		calleeText.endsWith('.memo') ||
		calleeText.endsWith('.forwardRef') ||
		calleeText.endsWith('.lazy')
	) {
		return true;
	}
	const firstArgument = call.getArguments()[0];
	if (!firstArgument) {
		return false;
	}
	const unwrapped = unwrapExpression(firstArgument);
	const kind = unwrapped.getKind();
	if (
		kind === SyntaxKind.ArrowFunction ||
		kind === SyntaxKind.FunctionExpression
	) {
		return true;
	}
	return (
		kind === SyntaxKind.CallExpression &&
		(unwrapped as CallExpression).getExpression().getKind() ===
			SyntaxKind.ImportKeyword
	);
};

/**
 * Follows a symbol to the drawer module's exported symbol it is the same
 * value as, or to the verdicts below:
 *
 *  - a drawer-module export name (string) — `getAliasedSymbol()` undoes
 *    imports, re-export barrels, aliases and namespace re-exports; a
 *    variable declaration is followed through its initializer, so identity
 *    chains (round 14), object-literal members (round 16's BLOCKER 1) and
 *    cross-file `export const X = DrawerX` shims (round 16's BLOCKER 2)
 *    all terminate here, in whichever file the declaration lives;
 *  - null — a real local value (a function/class declaration, a parameter,
 *    a namespace import, a type): definitely not the drawer module's
 *    symbol;
 *  - UNVERIFIABLE — the value is runtime-computed (a call that is not a
 *    factory, a mixed-symbol conditional, a reassigned `let`, a missing
 *    initializer, an alias with no target — an import of a missing module
 *    or of a name the module does not export — or a resolution cycle), or
 *    its declaration kind is one the resolver does not enumerate (a
 *    destructured binding, a class property — round 17's BLOCKER 1; a
 *    type-side member that escaped the value-side walk — round 19's
 *    BLOCKER 2). The default is UNVERIFIABLE, never null: not knowing
 *    must redden, so the next unhandled spelling costs a red build, not a
 *    silent green.
 *
 * `seen` guards cycles; declaration position + file makes the id stable
 * across recursive hops.
 */
const resolveSymbolValue = (
	symbol: TsMorphSymbol,
	project: Project,
	reassignedNamesByFile: Map<string, Set<string>>,
	seen: Set<string>,
): DrawerTagNameResult => {
	const symbolId = `${symbol.getName()}#${symbol
		.getDeclarations()
		.map(
			(declaration) =>
				`${declaration.getStart()}:${declaration.getSourceFile().getFilePath()}`,
		)
		.join('|')}`;
	if (seen.has(symbolId)) {
		return UNVERIFIABLE_TAG;
	}
	seen.add(symbolId);

	if (
		(symbol.getFlags() & ts.SymbolFlags.Alias) !== 0 &&
		symbol.getDeclarations().length > 1
	) {
		// A symbol the checker merged across an alias AND a value
		// declaration (a same-named local declaration redeclaring an
		// import) has no single binding: TypeScript itself cannot decide
		// which one a reference sees. That ambiguity is exactly the
		// shadowing shape that must not silently resolve as the alias —
		// fail loud.
		return UNVERIFIABLE_TAG;
	}

	if ((symbol.getFlags() & ts.SymbolFlags.Alias) !== 0) {
		const aliased = symbol.getAliasedSymbol();
		if (!aliased || aliased === symbol) {
			// An alias with no target — the import could not be resolved.
			return UNVERIFIABLE_TAG;
		}
		return resolveSymbolValue(aliased, project, reassignedNamesByFile, seen);
	}

	if (isDrawerModuleExportSymbol(symbol, project)) {
		return symbol.getName();
	}

	if (
		symbol
			.getDeclarations()
			.every(
				(declaration) =>
					!isRepoFilePath(declaration.getSourceFile().getFilePath()),
			)
	) {
		// Every declaration lives outside the scanned tree (node_modules,
		// ambient lib) — the drawer module is a repo file, so an external
		// value is definitely not one of its exports. This is the old
		// matcher's node_modules cut: `import { Link } from '@tanstack/
		// react-router'` resolves into an ambient `declare const` with no
		// initializer, and chaining into that would be UNVERIFIABLE — a
		// drawer file that merely renders an external component would
		// redden on it.
		return null;
	}

	for (const declaration of symbol.getDeclarations()) {
		if (declaration.getKind() === SyntaxKind.VariableDeclaration) {
			const variableDeclaration = declaration as VariableDeclaration;
			if (
				isReassigned(
					variableDeclaration.getSourceFile(),
					variableDeclaration.getName(),
					reassignedNamesByFile,
				)
			) {
				// `let Form = DrawerForm; Form = Other;` — the binding the
				// tag sees is not the initializer's value.
				return UNVERIFIABLE_TAG;
			}
			const initializer = variableDeclaration.getInitializer();
			if (!initializer) {
				return UNVERIFIABLE_TAG;
			}
			return resolveValueIdentity(
				initializer,
				project,
				reassignedNamesByFile,
				seen,
			);
		}
		if (declaration.getKind() === SyntaxKind.PropertyAssignment) {
			const propertyAssignment = declaration as PropertyAssignment;
			const initializer = propertyAssignment.getInitializer();
			if (!initializer) {
				return UNVERIFIABLE_TAG;
			}
			return resolveValueIdentity(
				initializer,
				project,
				reassignedNamesByFile,
				seen,
			);
		}
		if (declaration.getKind() === SyntaxKind.ShorthandPropertyAssignment) {
			// `const Parts = { DrawerContent, ... }` — round 17's BLOCKER 1.
			// The property symbol only carries the declaration; the VALUE
			// symbol (what the shorthand name refers to) is the checker's to
			// give, not a node kind to enumerate: getShorthandAssignmentValueSymbol
			// hands back the same import-alias symbol a longhand initializer
			// would, and the recursion below terminates at the same
			// declaration.
			const valueSymbol = project
				.getTypeChecker()
				.getShorthandAssignmentValueSymbol(
					declaration as ShorthandPropertyAssignment,
				);
			if (!valueSymbol) {
				return UNVERIFIABLE_TAG;
			}
			return resolveSymbolValue(
				valueSymbol,
				project,
				reassignedNamesByFile,
				seen,
			);
		}
		if (declaration.getKind() === SyntaxKind.GetAccessor) {
			// Round 21's BLOCKER 2: property access INVOKES a getter and
			// returns whatever it returns — `kit.Surface` with `get Surface()
			// { return DrawerContent; }` is the real `DrawerContent` export,
			// not "a real local value" the way a method reference is.
			return resolveGetAccessorValue(
				declaration as GetAccessorDeclaration,
				project,
				reassignedNamesByFile,
				seen,
			);
		}
		if (declaration.getKind() === SyntaxKind.MethodDeclaration) {
			// Round 24's BLOCKER 2b: a method-valued dotted member used as a
			// tag is INVOKED (`<kit.Surface>` renders what the method body
			// returns), so a method declaration is not evidence of absence the
			// way a plain function reference is. Resolve the single-return
			// body; anything else is UNVERIFIABLE.
			return resolveMethodDeclarationValue(
				declaration as MethodDeclaration,
				project,
				reassignedNamesByFile,
				seen,
			);
		}
	}

	// Round 18: NOT KNOWING IS UNVERIFIABLE. Every declaration kind that is
	// not enumerated above is either a binding whose VALUE is the symbol
	// itself — a local function/class/method declaration, a parameter, a
	// namespace import or module object, a type, an enum — and is therefore
	// definitely not the drawer module's exported symbol, or a binding whose
	// value the checker does not expose through this API (a destructured
	// binding element, a class property, ...). The former are null; anything
	// else falls through to UNVERIFIABLE, so an unhandled spelling reddens
	// the file instead of silently reading "definitely not a drawer" — the
	// round-17 escape (a shape the resolver did not know about shipped the
	// #990 break green because null meant "fine").
	//
	// Round 19's BLOCKER 2 removed the TYPE-side member kinds
	// (PropertySignature, MethodSignature, IndexSignature) from this set:
	// a type-side member is NOT evidence of absence — the checker resolves
	// the member of a type-ANNOTATED object literal to the type's
	// PropertySignature, never to the literal's PropertyAssignment, so the
	// initializer recursion above cannot run and "the member is the type's
	// declaration, not a value" is exactly the escape `const KIT: DrawerKit
	// = { Surface: DrawerContent, ... }` walked through. A type-side member
	// is routed to the value-side walk in resolvePropertyAccessValue
	// instead; a signature symbol that still reaches this terminal is
	// UNVERIFIABLE, because its value is unknown, not absent.
	if (
		symbol
			.getDeclarations()
			.every((declaration) =>
				DEFINITE_LOCAL_DECLARATION_KINDS.has(declaration.getKind()),
			)
	) {
		return null;
	}
	// Round 28's BLOCKERs 1-3: a bare tag bound to a Parameter/BindingElement
	// whose value the guard cannot follow is normally UNVERIFIABLE (not
	// knowing must redden) — except for the shipped `state-surface.tsx`
	// `<Icon>` glyph, whose binding defaults to and is only ever passed
	// @tabler/icons-react components. The allowance names the exact file and
	// tag and gives the value-level reason, so it cannot generalise to a new
	// shape the way a type-based disproof could.
	if (
		symbol.getDeclarations().length > 0 &&
		symbol
			.getDeclarations()
			.every(
				(declaration) =>
					declaration.getKind() === SyntaxKind.Parameter ||
					declaration.getKind() === SyntaxKind.BindingElement,
			) &&
		isAllowedNonDrawerTagBinding(
			symbol.getDeclarations()[0].getSourceFile().getFilePath(),
			symbol.getName(),
		)
	) {
		return null;
	}
	return UNVERIFIABLE_TAG;
};

/**
 * Classifies an EXPRESSION (a declaration initializer) through the same
 * symbol graph: an identifier or property access resolves its binding
 * symbol (scope- and type-accurate — the member of an object literal, of a
 * namespace import, of an `export * as` barrel, of an aliased namespace
 * base all resolve here); a conditional is resolved branch by branch (both
 * branches the SAME drawer symbol is an alias; both non-drawer is a local
 * value; anything mixed or unresolvable is unverifiable); a factory call
 * follows its loader when the loader is a drawer symbol (`lazy(() =>
 * DrawerBody)` IS the body — the factory adds no DOM node) and is a real
 * local component otherwise (`lazy(() => import('./chart'))`, `useMemo(() =>
 * Chart, [])`); a statically-decidable component body is a local component;
 * everything else is unverifiable.
 */
const resolveValueIdentity = (
	expression: Node,
	project: Project,
	reassignedNamesByFile: Map<string, Set<string>>,
	seen: Set<string>,
): DrawerTagNameResult => {
	const unwrapped = unwrapExpression(expression);
	const kind = unwrapped.getKind();

	if (kind === SyntaxKind.Identifier) {
		const symbol = (unwrapped as Identifier).getSymbol();
		return symbol
			? resolveSymbolValue(symbol, project, reassignedNamesByFile, seen)
			: UNVERIFIABLE_TAG;
	}
	if (kind === SyntaxKind.PropertyAccessExpression) {
		return resolvePropertyAccessValue(
			unwrapped as PropertyAccessExpression,
			project,
			reassignedNamesByFile,
			seen,
		);
	}
	if (kind === SyntaxKind.ConditionalExpression) {
		const conditional = unwrapped as ConditionalExpression;
		const whenTrue = resolveValueIdentity(
			conditional.getWhenTrue(),
			project,
			reassignedNamesByFile,
			new Set(seen),
		);
		const whenFalse = resolveValueIdentity(
			conditional.getWhenFalse(),
			project,
			reassignedNamesByFile,
			new Set(seen),
		);
		if (whenTrue === UNVERIFIABLE_TAG || whenFalse === UNVERIFIABLE_TAG) {
			return UNVERIFIABLE_TAG;
		}
		if (whenTrue === null && whenFalse === null) {
			return null;
		}
		if (typeof whenTrue === 'string' && whenTrue === whenFalse) {
			return whenTrue;
		}
		return UNVERIFIABLE_TAG;
	}
	if (
		kind === SyntaxKind.ObjectLiteralExpression ||
		kind === SyntaxKind.ArrayLiteralExpression ||
		kind === SyntaxKind.StringLiteral ||
		kind === SyntaxKind.NumericLiteral ||
		kind === SyntaxKind.TrueKeyword ||
		kind === SyntaxKind.FalseKeyword ||
		kind === SyntaxKind.NullKeyword ||
		kind === SyntaxKind.UndefinedKeyword
	) {
		// A local value — never the drawer module's symbol.
		return null;
	}
	if (
		kind === SyntaxKind.ArrowFunction ||
		kind === SyntaxKind.FunctionExpression
	) {
		// An inline arrow/function-expression initializer IS a freshly
		// created local value: the binding can never be identical to the
		// drawer module's exported symbol, whatever the body renders. A
		// FunctionDeclaration binding always had exactly this verdict
		// (DEFINITE_LOCAL_DECLARATION_KINDS) without anyone inspecting its
		// body — the arrow-function-component conversion (#1210) moved
		// components like `ui/badge.tsx` (which delegates to
		// `useRender(...)`, a shape extractComponentBody cannot see
		// through) under THIS branch, and the old fall-through classified
		// them UNVERIFIABLE, reddening every file that renders them. Body
		// extraction stays the WALK's job (it expands the definition's JSX
		// and judges the geometry); identity here is decidable without it.
		return null;
	}
	if (kind === SyntaxKind.CallExpression) {
		const call = unwrapped as CallExpression;
		if (isFactoryCall(call)) {
			const firstArgument = unwrapExpression(call.getArguments()[0]);
			const argumentKind = firstArgument.getKind();
			if (
				argumentKind === SyntaxKind.ArrowFunction ||
				argumentKind === SyntaxKind.FunctionExpression
			) {
				const body = unwrapExpression(
					(firstArgument as ArrowFunction).getBody(),
				);
				if (body.getKind() === SyntaxKind.Identifier) {
					return resolveValueIdentity(
						body,
						project,
						reassignedNamesByFile,
						seen,
					);
				}
			}
			// A runtime component factory whose loader is not statically a
			// drawer symbol — a real component, never the drawer module's
			// own export.
			return null;
		}
		// Round 24's BLOCKER 2b: `createElement(DrawerContent, props)` (the
		// reviewer's method-kit reproduction) IS the `DrawerContent` export —
		// the first argument is what `React.createElement` renders. The
		// string/intrinsic form (`createElement('div')`) is a real DOM
		// element; an unresolvable first argument is UNVERIFIABLE.
		const calleeText = call.getExpression().getText();
		if (
			calleeText === 'createElement' ||
			calleeText.endsWith('.createElement')
		) {
			const firstArgument = call.getArguments()[0];
			if (!firstArgument) {
				return UNVERIFIABLE_TAG;
			}
			const firstUnwrapped = unwrapExpression(firstArgument);
			if (
				firstUnwrapped.getKind() === SyntaxKind.StringLiteral ||
				firstUnwrapped.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral
			) {
				return null;
			}
			return resolveValueIdentity(
				firstUnwrapped,
				project,
				reassignedNamesByFile,
				seen,
			);
		}
		return UNVERIFIABLE_TAG;
	}
	const body = extractComponentBody(unwrapped);
	if (body) {
		// A statically-decidable component (arrow, JSX body, memo,
		// forwardRef, ...) — a real local component, not a marker.
		return null;
	}
	return UNVERIFIABLE_TAG;
};

// ---------------------------------------------------------------------------
// Round 19's BLOCKER 2 — the type-side member value walk.
//
// The checker resolves the member of a type-ANNOTATED object literal to
// the TYPE's PropertySignature, never to the literal's PropertyAssignment,
// so the initializer recursion (round 16) never runs and
// `const KIT: DrawerKit = { Surface: DrawerContent, ... }` resolved every
// member to the round-18 allowlist's null — "definitely not a drawer" —
// with the exact #990 break green. A type-side member is NOT evidence of
// absence: the walk below follows the BASE binding to its value side (the
// annotated object literal's own property) and resolves the member's
// initializer through the same symbol graph as a longhand property. When
// the value side is not reachable in the scanned tree, the verdict is
// UNVERIFIABLE — not knowing must redden, never silently pass — and the
// three signature kinds are removed from the definite-non-drawer allowlist
// for the same reason.
// ---------------------------------------------------------------------------

const TYPE_SIDE_MEMBER_KINDS = new Set([
	SyntaxKind.PropertySignature,
	SyntaxKind.MethodSignature,
	SyntaxKind.IndexSignature,
]);

const isTypeSideMemberSymbol = (symbol: TsMorphSymbol): boolean =>
	symbol
		.getDeclarations()
		.every((declaration) => TYPE_SIDE_MEMBER_KINDS.has(declaration.getKind()));

/**
 * The object literal that is the VALUE side of a binding — the base's
 * annotated object literal, followed through alias chains and identity
 * initializers (`const KIT2 = KIT;`). Only a VariableDeclaration whose
 * initializer is (or identity-resolves to) an object literal has a value
 * side the scan can read; anything else — a parameter, a call result, a
 * reassigned `let`, an unresolvable import — returns null and the caller
 * must fail closed. Cycle-guarded through the shared `seen` set.
 */
const findObjectLiteralValueSide = (
	baseSymbol: TsMorphSymbol,
	reassignedNamesByFile: Map<string, Set<string>>,
	seen: Set<string>,
): ObjectLiteralExpression | null => {
	const symbolId = `${baseSymbol.getName()}#${baseSymbol
		.getDeclarations()
		.map(
			(declaration) =>
				`${declaration.getStart()}:${declaration.getSourceFile().getFilePath()}`,
		)
		.join('|')}`;
	if (seen.has(symbolId)) {
		return null;
	}
	seen.add(symbolId);

	if ((baseSymbol.getFlags() & ts.SymbolFlags.Alias) !== 0) {
		const aliased = baseSymbol.getAliasedSymbol();
		if (!aliased || aliased === baseSymbol) {
			return null;
		}
		return findObjectLiteralValueSide(aliased, reassignedNamesByFile, seen);
	}
	for (const declaration of baseSymbol.getDeclarations()) {
		if (declaration.getKind() !== SyntaxKind.VariableDeclaration) {
			continue;
		}
		const variableDeclaration = declaration as VariableDeclaration;
		if (
			isReassigned(
				variableDeclaration.getSourceFile(),
				variableDeclaration.getName(),
				reassignedNamesByFile,
			)
		) {
			// `let kit = {...}; kit = other;` — the binding the tag sees
			// is not the initializer's value.
			return null;
		}
		const initializer = variableDeclaration.getInitializer();
		if (!initializer) {
			return null;
		}
		const unwrapped = unwrapExpression(initializer);
		if (unwrapped.getKind() === SyntaxKind.ObjectLiteralExpression) {
			return unwrapped as ObjectLiteralExpression;
		}
		if (unwrapped.getKind() === SyntaxKind.Identifier) {
			const innerSymbol = (unwrapped as Identifier).getSymbol();
			if (innerSymbol) {
				return findObjectLiteralValueSide(
					innerSymbol,
					reassignedNamesByFile,
					seen,
				);
			}
		}
		return null;
	}
	return null;
};

/**
 * The array-literal sibling of `findObjectLiteralValueSide` — round 21's
 * BLOCKER 1. Follows the same identity/alias chain, but the value side it
 * looks for is an ARRAY literal (`const kits: DrawerKit[] = [...]`) instead
 * of an object literal, so a `.map()`/`.forEach()` callback's element
 * parameter can be resolved to the real elements that flow into it.
 */
const findArrayLiteralValueSide = (
	baseSymbol: TsMorphSymbol,
	reassignedNamesByFile: Map<string, Set<string>>,
	seen: Set<string>,
): ArrayLiteralExpression | null => {
	const symbolId = `${baseSymbol.getName()}#${baseSymbol
		.getDeclarations()
		.map(
			(declaration) =>
				`${declaration.getStart()}:${declaration.getSourceFile().getFilePath()}`,
		)
		.join('|')}`;
	if (seen.has(symbolId)) {
		return null;
	}
	seen.add(symbolId);

	if ((baseSymbol.getFlags() & ts.SymbolFlags.Alias) !== 0) {
		const aliased = baseSymbol.getAliasedSymbol();
		if (!aliased || aliased === baseSymbol) {
			return null;
		}
		return findArrayLiteralValueSide(aliased, reassignedNamesByFile, seen);
	}
	for (const declaration of baseSymbol.getDeclarations()) {
		if (declaration.getKind() !== SyntaxKind.VariableDeclaration) {
			continue;
		}
		const variableDeclaration = declaration as VariableDeclaration;
		if (
			isReassigned(
				variableDeclaration.getSourceFile(),
				variableDeclaration.getName(),
				reassignedNamesByFile,
			)
		) {
			return null;
		}
		const initializer = variableDeclaration.getInitializer();
		if (!initializer) {
			return null;
		}
		const unwrapped = unwrapExpression(initializer);
		if (unwrapped.getKind() === SyntaxKind.ArrayLiteralExpression) {
			return unwrapped as ArrayLiteralExpression;
		}
		if (unwrapped.getKind() === SyntaxKind.Identifier) {
			const innerSymbol = (unwrapped as Identifier).getSymbol();
			if (innerSymbol) {
				return findArrayLiteralValueSide(
					innerSymbol,
					reassignedNamesByFile,
					seen,
				);
			}
		}
		return null;
	}
	return null;
};

/**
 * Resolves what a getter's body returns — round 21's BLOCKER 2. A getter is
 * not a value like a method reference: property access INVOKES it and
 * yields whatever it returns, so `get Surface() { return DrawerContent; }`
 * makes `kit.Surface` the real `DrawerContent` export, not "a real local
 * value" the way a method reference is. Only a single, unconditional
 * `return` statement is resolved through the same value grammar as an
 * object-literal property; anything else (no return, more than one
 * statement, a non-block body) is UNVERIFIABLE — not knowing what a getter
 * returns must redden, never silently read as a real local value.
 */
const resolveGetAccessorValue = (
	getAccessor: GetAccessorDeclaration,
	project: Project,
	reassignedNamesByFile: Map<string, Set<string>>,
	seen: Set<string>,
): DrawerTagNameResult => {
	const body = getAccessor.getBody();
	if (!body || body.getKind() !== SyntaxKind.Block) {
		return UNVERIFIABLE_TAG;
	}
	const statements = (body as Block).getStatements();
	if (
		statements.length !== 1 ||
		statements[0].getKind() !== SyntaxKind.ReturnStatement
	) {
		return UNVERIFIABLE_TAG;
	}
	const expression = (statements[0] as ReturnStatement).getExpression();
	if (!expression) {
		return UNVERIFIABLE_TAG;
	}
	return resolveValueIdentity(expression, project, reassignedNamesByFile, seen);
};

/**
 * Resolves a METHOD member's rendered value — round 24's BLOCKER 2b. A method
 * reference is not "the member's value IS the function" for the guard's
 * question: used as a tag (`<kit.Surface>`), the method is INVOKED and renders
 * whatever its body returns. `Surface(props) { return createElement(
 * DrawerContent, props); }` renders the real drawer. A single, unconditional
 * `return` statement is resolved through the same value grammar as a getter
 * body; anything else (no return, multiple statements, a non-block body) is
 * UNVERIFIABLE — not knowing what a method renders must redden, never silently
 * read as a definite local value.
 */
const resolveMethodDeclarationValue = (
	methodDeclaration: MethodDeclaration,
	project: Project,
	reassignedNamesByFile: Map<string, Set<string>>,
	seen: Set<string>,
): DrawerTagNameResult => {
	const body = methodDeclaration.getBody();
	if (!body || body.getKind() !== SyntaxKind.Block) {
		return UNVERIFIABLE_TAG;
	}
	const statements = (body as Block).getStatements();
	if (
		statements.length !== 1 ||
		statements[0].getKind() !== SyntaxKind.ReturnStatement
	) {
		return UNVERIFIABLE_TAG;
	}
	const expression = (statements[0] as ReturnStatement).getExpression();
	if (!expression) {
		return UNVERIFIABLE_TAG;
	}
	return resolveValueIdentity(expression, project, reassignedNamesByFile, seen);
};

/**
 * Resolves a single member of an object literal that is a binding's VALUE
 * side — shared by the direct value-side walk below and by round 21's
 * array-iterable walk, where the "object literal" is one element of a
 * traced array rather than the base's own initializer.
 *
 *  - a drawer-module export name — the property's initializer/shorthand
 *    value resolved through the symbol graph;
 *  - null — a method or a setter-only member (the member's value IS the
 *    function, or undefined with no getter — never the drawer module's
 *    export), or a property the literal does not declare with no spread
 *    that could supply it (undefined at runtime);
 *  - UNVERIFIABLE — a getter whose return value cannot be resolved (round
 *    21's BLOCKER 2 — property access INVOKES a getter, so its member is
 *    NOT a real local value the way a method reference is), the property
 *    could come from a spread, or its initializer cannot be resolved.
 */
const resolveObjectLiteralMember = (
	objectLiteral: ObjectLiteralExpression,
	memberName: string,
	project: Project,
	reassignedNamesByFile: Map<string, Set<string>>,
	seen: Set<string>,
): DrawerTagNameResult => {
	// Round 24's BLOCKER 2a: `getProperty(memberName)` returns whichever
	// accessor is declared FIRST, so a setter declared before its getter made
	// the guard read the pair as a setter-only member ("value is undefined")
	// while property access INVOKES the getter. Scan every property matching
	// the name and prefer the GetAccessor — the read value is the getter's.
	const matchingProperties = objectLiteral
		.getProperties()
		.filter(
			(candidate) =>
				(candidate as { getName?: () => string }).getName?.() === memberName,
		);
	const getter = matchingProperties.find(
		(candidate) => candidate.getKind() === SyntaxKind.GetAccessor,
	);
	if (getter) {
		return resolveGetAccessorValue(
			getter as GetAccessorDeclaration,
			project,
			reassignedNamesByFile,
			seen,
		);
	}
	const property =
		matchingProperties[0] ?? objectLiteral.getProperty(memberName);
	if (property) {
		const propertyKind = property.getKind();
		if (propertyKind === SyntaxKind.PropertyAssignment) {
			const initializer = (property as PropertyAssignment).getInitializer();
			if (!initializer) {
				return UNVERIFIABLE_TAG;
			}
			return resolveValueIdentity(
				initializer,
				project,
				reassignedNamesByFile,
				seen,
			);
		}
		if (propertyKind === SyntaxKind.ShorthandPropertyAssignment) {
			const valueSymbol = project
				.getTypeChecker()
				.getShorthandAssignmentValueSymbol(
					property as ShorthandPropertyAssignment,
				);
			if (!valueSymbol) {
				return UNVERIFIABLE_TAG;
			}
			return resolveSymbolValue(
				valueSymbol,
				project,
				reassignedNamesByFile,
				seen,
			);
		}
		if (propertyKind === SyntaxKind.MethodDeclaration) {
			// Round 24's BLOCKER 2b: a method member's value is the INVOCATION
			// of the method, not the function reference — `Surface(props) {
			// return createElement(DrawerContent, props); }` renders the real
			// drawer when used as `<kit.Surface>`. A single-return method body
			// is resolved through the same value grammar; anything else is
			// UNVERIFIABLE, never "definitely not a drawer".
			return resolveMethodDeclarationValue(
				property as MethodDeclaration,
				project,
				reassignedNamesByFile,
				seen,
			);
		}
		if (propertyKind === SyntaxKind.SetAccessor) {
			// A setter with no getter anywhere in the literal — reading the
			// member yields undefined at runtime.
			return null;
		}
		return UNVERIFIABLE_TAG;
	}
	if (
		objectLiteral
			.getProperties()
			.some((candidate) => candidate.getKind() === SyntaxKind.SpreadAssignment)
	) {
		// The member could be supplied by the spread — not decidable.
		return UNVERIFIABLE_TAG;
	}
	// The value side declares no such property and no spread can supply
	// one: the member is undefined at runtime.
	return null;
};

const ITERATION_CALLBACK_METHOD_NAMES = new Set(['map', 'forEach', 'flatMap']);

// The array methods that MUTATE their receiver in place — a traced array whose
// literal initializer is only its first value cannot be classified from that
// initializer when a later call writes to it (round 24's BLOCKER 3).
const MUTATING_ARRAY_METHOD_NAMES = new Set([
	'push',
	'pop',
	'shift',
	'unshift',
	'splice',
	'sort',
	'reverse',
	'fill',
	'copyWithin',
]);

/**
 * True when a traced array literal cannot be trusted as its initializer —
 * either a mutation writes into it (an in-place array method call
 * (`kits.push(...)`, `alias.splice(...)`, ...), an element write
 * (`kits[i] = ...`, `alias[0] = ...`) or a `.length` write, where the
 * receiver resolves through the value side to the SAME array literal the
 * walk traced), or the array ESCAPES into a call the guard cannot see
 * through (round 28's BLOCKER 4: `appendDrawerKit(alias)` may push the real
 * drawer kit into the array — a helper parameter is exactly where the
 * writes are invisible). Round 24's BLOCKER 3: an array literal traced to
 * its initializer is only safe to classify from that initializer when the
 * guard ALSO proves the array is not mutated. A variable binding
 * reassignment (`kits = [...]`) is already handled by `isReassigned`; this
 * helper covers the ELEMENT writes a literal initializer cannot see,
 * including a mutation through a second binding that aliases the same array
 * (`const alias = kits; alias.push(...)` — round 26's BLOCKER 3), by
 * resolving each mutation receiver's symbol through
 * `findArrayLiteralValueSide` and comparing the literal reached to the
 * traced one. A receiver that does not resolve to the traced literal is a
 * DIFFERENT array — its write proves nothing about ours. Only the known
 * non-mutating iteration methods (`map`/`forEach`/`flatMap`) are exempt
 * from the escape rule — they do not mutate the array themselves, and their
 * callbacks' own writes are caught by the receiver-identity scans.
 */
const isTracedArrayLiteralUnsafe = (
	tracedArrayLiteral: ArrayLiteralExpression,
	receiverSourceFile: SourceFile,
	reassignedNamesByFile: Map<string, Set<string>>,
): boolean => {
	const sourceFiles = new Set<SourceFile>([
		receiverSourceFile,
		tracedArrayLiteral.getSourceFile(),
	]);
	const writesToTracedArray = (receiver: Node): boolean => {
		if (receiver.getKind() !== SyntaxKind.Identifier) {
			return false;
		}
		const symbol = (receiver as Identifier).getSymbol();
		if (!symbol) {
			return false;
		}
		return (
			findArrayLiteralValueSide(symbol, reassignedNamesByFile, new Set()) ===
			tracedArrayLiteral
		);
	};
	// Round 28's BLOCKER 4: the array escaping into a call argument — a
	// helper parameter, directly or nested in an object/array argument —
	// means writes the guard cannot see. A property-access callee that is
	// one of the iteration methods is exempt (the array is the receiver of
	// `.map`/`.forEach`/`.flatMap`, which do not mutate it).
	const argumentReferencesTracedArray = (node: Node): boolean => {
		const unwrapped = unwrapExpression(node);
		const nodeKind = unwrapped.getKind();
		if (nodeKind === SyntaxKind.Identifier) {
			const symbol = (unwrapped as Identifier).getSymbol();
			if (!symbol) {
				return false;
			}
			return (
				findArrayLiteralValueSide(symbol, reassignedNamesByFile, new Set()) ===
				tracedArrayLiteral
			);
		}
		if (nodeKind === SyntaxKind.ObjectLiteralExpression) {
			return (unwrapped as ObjectLiteralExpression)
				.getProperties()
				.some((prop) => {
					if (prop.getKind() === SyntaxKind.PropertyAssignment) {
						const initializer = (prop as PropertyAssignment).getInitializer();
						return initializer
							? argumentReferencesTracedArray(initializer)
							: false;
					}
					if (prop.getKind() === SyntaxKind.ShorthandPropertyAssignment) {
						return argumentReferencesTracedArray(
							(prop as ShorthandPropertyAssignment).getNameNode(),
						);
					}
					if (prop.getKind() === SyntaxKind.SpreadAssignment) {
						return argumentReferencesTracedArray(
							prop.asKindOrThrow(SyntaxKind.SpreadAssignment).getExpression(),
						);
					}
					return false;
				});
		}
		if (nodeKind === SyntaxKind.ArrayLiteralExpression) {
			return (unwrapped as ArrayLiteralExpression)
				.getElements()
				.some((element) => argumentReferencesTracedArray(element));
		}
		return false;
	};
	const escapesIntoCallee = (call: CallExpression): boolean => {
		const callee = call.getExpression();
		if (callee.getKind() === SyntaxKind.PropertyAccessExpression) {
			const propertyAccess = callee as PropertyAccessExpression;
			if (ITERATION_CALLBACK_METHOD_NAMES.has(propertyAccess.getName())) {
				return false;
			}
		}
		return call
			.getArguments()
			.some((argument) => argumentReferencesTracedArray(argument));
	};
	for (const sourceFile of sourceFiles) {
		for (const call of sourceFile.getDescendantsOfKind(
			SyntaxKind.CallExpression,
		)) {
			const callExpression = call as CallExpression;
			const callee = callExpression.getExpression();
			if (callee.getKind() !== SyntaxKind.PropertyAccessExpression) {
				// A plain callee that receives the array (`appendDrawerKit(
				// alias)`).
				if (escapesIntoCallee(callExpression)) {
					return true;
				}
				continue;
			}
			const propertyAccess = callee as PropertyAccessExpression;
			if (MUTATING_ARRAY_METHOD_NAMES.has(propertyAccess.getName())) {
				if (
					writesToTracedArray(unwrapExpression(propertyAccess.getExpression()))
				) {
					return true;
				}
				continue;
			}
			if (escapesIntoCallee(callExpression)) {
				return true;
			}
		}
		for (const binary of sourceFile.getDescendantsOfKind(
			SyntaxKind.BinaryExpression,
		)) {
			const binaryExpression = binary as BinaryExpression;
			if (
				binaryExpression.getOperatorToken().getKind() !== SyntaxKind.EqualsToken
			) {
				continue;
			}
			const left = binaryExpression.getLeft();
			if (left.getKind() === SyntaxKind.ElementAccessExpression) {
				const elementBase = unwrapExpression(
					(left as ElementAccessExpression).getExpression(),
				);
				if (writesToTracedArray(elementBase)) {
					return true;
				}
			}
			if (left.getKind() === SyntaxKind.PropertyAccessExpression) {
				const propertyAccess = left as PropertyAccessExpression;
				if (propertyAccess.getName() !== 'length') {
					continue;
				}
				if (
					writesToTracedArray(unwrapExpression(propertyAccess.getExpression()))
				) {
					return true;
				}
			}
		}
	}
	return false;
};

/**
 * The array a `.map()`/`.forEach()`/`.flatMap()` callback's ELEMENT
 * parameter draws its values from — round 21's BLOCKER 1: `kit` in
 * `kits.map((kit) => <kit.Surface />)`. Only the callback's first
 * (element) parameter qualifies — the index/array parameters never carry
 * an element's own members. Returns null for every shape that is not
 * exactly this — a named callback passed by reference, a destructured
 * element parameter, a call whose callee is not one of the iteration
 * methods above — so the caller falls back to its existing default instead
 * of guessing.
 */
const findIterableReceiverForParameter = (
	parameterDeclaration: Node,
): Node | null => {
	if (parameterDeclaration.getKind() !== SyntaxKind.Parameter) {
		return null;
	}
	const callback = parameterDeclaration.getParent();
	if (
		!callback ||
		(callback.getKind() !== SyntaxKind.ArrowFunction &&
			callback.getKind() !== SyntaxKind.FunctionExpression)
	) {
		return null;
	}
	const parameters = (callback as ArrowFunction).getParameters();
	if (parameters.length === 0 || parameters[0] !== parameterDeclaration) {
		return null;
	}
	const call = callback.getParent();
	if (!call || call.getKind() !== SyntaxKind.CallExpression) {
		return null;
	}
	const callExpression = call as CallExpression;
	if (callExpression.getArguments()[0] !== callback) {
		return null;
	}
	const callee = callExpression.getExpression();
	if (callee.getKind() !== SyntaxKind.PropertyAccessExpression) {
		return null;
	}
	const calleePropertyAccess = callee as PropertyAccessExpression;
	if (!ITERATION_CALLBACK_METHOD_NAMES.has(calleePropertyAccess.getName())) {
		return null;
	}
	return calleePropertyAccess.getExpression();
};

/**
 * Resolves `<parameter>.<memberName>` when `parameter` is a `.map()`-style
 * callback's element parameter and the iterable it draws from traces to a
 * real array literal — round 21's BLOCKER 1 paired proof: `const kits:
 * DrawerKit[] = [{ Surface: DrawerContent, ... }]` +
 * `kits.map((kit) => <kit.Surface />)` must resolve to the real
 * `DrawerContent` export, not "a parameter is always a real local value."
 * Returns `undefined` — not a verdict — when the iterable cannot be traced
 * to an array literal (an imported/computed collection, a `.filter()`
 * chain, ...) or an element is not itself an object literal: the caller
 * then falls back to its existing default instead of a guess. Non-empty
 * literal elements are resolved individually and must agree — every element
 * the same drawer name, or every element null — otherwise the member could
 * be a drawer export on some iterations and not others, which is
 * UNVERIFIABLE, not a guess either way.
 */
const resolveIterableParameterMember = (
	parameterDeclaration: Node,
	memberName: string,
	project: Project,
	reassignedNamesByFile: Map<string, Set<string>>,
	seen: Set<string>,
): DrawerTagNameResult | undefined => {
	const receiver = findIterableReceiverForParameter(parameterDeclaration);
	if (!receiver) {
		return undefined;
	}
	const unwrappedReceiver = unwrapExpression(receiver);
	if (unwrappedReceiver.getKind() !== SyntaxKind.Identifier) {
		return undefined;
	}
	const receiverSymbol = (unwrappedReceiver as Identifier).getSymbol();
	if (!receiverSymbol) {
		return undefined;
	}
	const arrayLiteral = findArrayLiteralValueSide(
		receiverSymbol,
		reassignedNamesByFile,
		new Set(),
	);
	if (!arrayLiteral) {
		return undefined;
	}
	// Round 24's BLOCKER 3: the literal initializer is only the array's FIRST
	// value. If the same array is mutated afterwards (`kits.push(...)`,
	// `kits[i] = ...`), the traced elements are not what the callback sees, so
	// the literal cannot be trusted — the member is UNVERIFIABLE, never a
	// definite non-drawer. Round 26's BLOCKER 3: the mutation receiver is
	// resolved through the value side, so a write through a second alias of the
	// same array (`const alias = kits; alias.push(...)`) is caught too — the
	// array's literal identity, not the receiver's spelling, is what decides.
	// Round 28's BLOCKER 4: the array ESCAPING into a helper (`appendDrawerKit(
	// alias)` — the write happens inside the helper, where the guard cannot
	// see it) is the same unproven-mutation case, so it is unsafe to classify
	// from the initializer too.
	if (
		isTracedArrayLiteralUnsafe(
			arrayLiteral,
			unwrappedReceiver.getSourceFile(),
			reassignedNamesByFile,
		)
	) {
		return UNVERIFIABLE_TAG;
	}
	const elements = arrayLiteral.getElements();
	if (elements.length === 0) {
		return undefined;
	}
	const results: DrawerTagNameResult[] = [];
	for (const element of elements) {
		const unwrappedElement = unwrapExpression(element);
		if (unwrappedElement.getKind() !== SyntaxKind.ObjectLiteralExpression) {
			// A spread, a call, an identifier — not an object literal this
			// walk can read a member off. Not knowing must redden.
			return UNVERIFIABLE_TAG;
		}
		results.push(
			resolveObjectLiteralMember(
				unwrappedElement as ObjectLiteralExpression,
				memberName,
				project,
				reassignedNamesByFile,
				seen,
			),
		);
	}
	if (results.some((result) => result === UNVERIFIABLE_TAG)) {
		return UNVERIFIABLE_TAG;
	}
	const distinctResults = new Set(results);
	if (distinctResults.size === 1) {
		return results[0];
	}
	// Elements disagree on this member — it could be a drawer export on some
	// iterations and a real local value on others. Ambiguous, not a guess.
	return UNVERIFIABLE_TAG;
};

/**
 * Resolves a member expression whose member symbol is a TYPE-side member
 * (a PropertySignature/MethodSignature/IndexSignature of the base's
 * type) — round 19's BLOCKER 2. The verdicts:
 *
 *  - a drawer-module export name — the annotated object literal's own
 *    property VALUE resolved through the symbol graph, or (round 21's
 *    BLOCKER 1) the same walk applied to each element of a traced array
 *    when the base is a `.map()`-style callback's element parameter;
 *  - null — a property the value side does not declare (with no spread
 *    that could supply it — it is undefined at runtime), a method/setter
 *    member (its value IS the function, or undefined), or a member of a
 *    base binding that is itself a definite local value or an external
 *    value with no traceable iterable (`const Icon = item.Icon` with
 *    `item` a typed prop passed down from elsewhere — the shipped
 *    `app-shell.tsx` shape — has no iterable to trace at all);
 *  - UNVERIFIABLE — the base is not a binding with a readable value side
 *    and not a definite local/external value (a call result, a `??`
 *    chain, a nested member, a reassigned `let`), a getter whose return
 *    value cannot be resolved, the value side is an object literal whose
 *    member could come from a spread, the property's initializer itself
 *    cannot be resolved, or a traced array's elements disagree on the
 *    member. Not knowing must redden.
 */
/**
 * Round 26's BLOCKER 1 — the disproof of a member of a Parameter/BindingElement
 * base must be about the VALUE's symbol, never the member's DECLARED TYPE. A
 * declared type is structural, not nominal: a repo-local `DrawerContent` can
 * legally inhabit a property declared `FC<any>` (React's external type), so
 * round 24's `isMemberTypeProvablyExternal()` — which proved only that the
 * declared type came from outside the repo — turned a real drawer export into
 * a definite NOT_DRAWER and shipped the exact #990 break green with typecheck
 * clean. The rule below is the value-shaped replacement: a member of a
 * Parameter/BindingElement base is NOT_DRAWER only when the guard can follow
 * the VALUE it names to a symbol that is not one of the four drawer exports.
 * When it cannot follow the value — the ordinary case for a parameter — the
 * answer is UNVERIFIABLE, whatever the declared type says.
 *
 * The two shipped consumers that round 24's type-shaped rule kept green by
 * accident (`app-shell.tsx`'s `item.Icon`, `icon-color-picker.tsx`'s
 * `option.Icon`) are NOT covered by a value proof here — their member values
 * are genuine untraceable parameters, so they now resolve UNVERIFIABLE. They
 * are kept green by an explicit, narrow, documented allowance (see
 * NON_DRAWER_PARAMETER_MEMBER_ALLOWANCES) that names the file, the binding
 * base and the member and gives the value-level reason it is safe. It is a
 * reviewed list, not a second type-shaped rule: it cannot generalise to a
 * new shape, and it cannot silently keep a fresh broken drawer green.
 *
 * Round 28's BLOCKERs 1-3 make the anchor probe three-valued, which anchored
 * two more real receivers: `icon-color-picker.tsx`'s `activeIconOption.Icon`
 * (the base is the Tabler-only catalog lookup, not a parameter, so the
 * parameter-member allowance never fired) and `state-surface.tsx`'s bare
 * `<Icon>` (a destructured parameter binding with a Tabler icon default).
 * Both are the same Tabler-only value story the existing entries document —
 * the drawer module's exports are never members of the @tabler/icons-react
 * collection — so the allowance list grows by the same value-shaped entries,
 * one naming the new base, one naming the bare tag. A drawer-importing file
 * that passes data props into either component is then no longer an
 * unresolved-edge pairAnchor of an unverifiable receiver.
 */
const NON_DRAWER_PARAMETER_MEMBER_ALLOWANCES: ReadonlyArray<{
	file: string;
	member: string;
	base?: string;
	reason: string;
}> = [
	{
		file: 'src/components/app-shell/app-shell.tsx',
		member: 'Icon',
		base: 'item',
		reason:
			'Every `item.Icon` is drawn from the @tabler/icons-react collection the ' +
			'app-shell nav model declares (`Icon: TablerIcon`); the nav arrays are ' +
			"literals of tabler icon components, and the drawer module's exports are " +
			'never a member of that model. The `<Icon>` tag is a nav glyph, never a ' +
			"drawer part, and the file's real drawer anchors are walked and judged " +
			'independently of this allowance.',
	},
	{
		file: 'src/components/ui/icon-color-picker.tsx',
		member: 'Icon',
		base: 'option',
		reason:
			'Every `option.Icon` comes from `ICON_COLOR_PICKER_OPTIONS`, built ' +
			'entirely from @tabler/icons-react components (see ' +
			"icon-color-picker-options.ts); the drawer module's exports are never " +
			'an element of that array. The `<option.Icon>` tag is a palette glyph, ' +
			'never a drawer part.',
	},
	{
		file: 'src/components/ui/icon-color-picker.tsx',
		member: 'Icon',
		base: 'activeIconOption',
		reason:
			'`activeIconOption` is `getIconColorPickerOption(value.icon) ?? ' +
			'DEFAULT_ICON_COLOR_PICKER_OPTION` — both sides resolve into ' +
			'ICON_COLOR_PICKER_OPTIONS, the @tabler/icons-react-only catalog (see ' +
			'icon-color-picker-options.ts), so `activeIconOption.Icon` carries a ' +
			'palette glyph, never a drawer part, for the same value-level reason ' +
			'the `option.Icon` allowance documents.',
	},
];

const isAllowedNonDrawerParameterMember = (
	filePath: string,
	memberName: string,
	baseName: string,
): boolean =>
	NON_DRAWER_PARAMETER_MEMBER_ALLOWANCES.some(
		(allowance) =>
			toPortableSourcePath(filePath) === allowance.file &&
			memberName === allowance.member &&
			(allowance.base === undefined || allowance.base === baseName),
	);

// Round 28's BLOCKERs 1-3: the bare-tag half of the same value-shaped
// allowance. `state-surface.tsx`'s `<Icon>` is a destructured parameter
// binding (`icon: Icon = IconInbox`) — the value rule cannot follow it, but
// the binding's TYPE and every default are @tabler/icons-react glyphs, and
// the call sites pass Tabler icons only. A bare tag allowance names the
// file and the tag and gives the value-level reason, exactly like the
// member allowances above.
const NON_DRAWER_TAG_ALLOWANCES: ReadonlyArray<{
	file: string;
	tag: string;
	reason: string;
}> = [
	{
		file: 'src/components/ui/state-surface.tsx',
		tag: 'Icon',
		reason:
			'The `icon` prop is typed `TablerIcon` and the destructured binding ' +
			'falls back to @tabler/icons-react defaults (`IconInbox`, ' +
			'`IconAlertCircle`, `IconSearchOff`); every call site passes a ' +
			"Tabler glyph or nothing, and the drawer module's exports are never " +
			'members of that collection. The `<Icon>` tag is a state glyph, never ' +
			'a drawer part.',
	},
];

const isAllowedNonDrawerTagBinding = (
	filePath: string,
	tagName: string,
): boolean =>
	NON_DRAWER_TAG_ALLOWANCES.some(
		(allowance) =>
			toPortableSourcePath(filePath) === allowance.file &&
			tagName === allowance.tag,
	);

/**
 * Round 28's BLOCKERs 1-3: edge resolution gets the same three outcomes as
 * classification. The anchor probe below answers "does this prop value
 * reference a drawer export?" with REFERENCES (resolved, and it is),
 * DOES_NOT_REFERENCE (resolved, provably not), or UNRESOLVED (could not be
 * followed — an identifier-initialised object, a parameter whose value comes
 * from call sites, an unverifiable binding). Round 27's four blockers were
 * all the same two-valued default — "I could not follow this reference" was
 * recorded as "there is no such reference" — so the probe's verdicts feed
 * the module graph in three lanes instead of one, and an UNRESOLVED edge
 * from an anchored file forces the pair to surface instead of falling out of
 * discovery.
 */
type DrawerExportReferenceResult =
	| 'references'
	| 'does-not-reference'
	| 'unresolved';

const referenceResultFromSymbolValue = (
	result: DrawerTagNameResult,
): DrawerExportReferenceResult => {
	if (typeof result === 'string') {
		return 'references';
	}
	if (result === UNVERIFIABLE_TAG) {
		return 'unresolved';
	}
	return 'does-not-reference';
};

/**
 * Classifies the properties of an object literal for the anchor probe. Any
 * property that provably carries a drawer export wins; otherwise a property
 * the probe cannot follow (a spread of an unresolvable value) makes the
 * literal UNRESOLVED — the object COULD carry drawer exports the probe
 * cannot see; otherwise it is a definite non-reference.
 */
const classifyObjectLiteralReference = (
	objectLiteral: ObjectLiteralExpression,
	project: Project,
	reassignedNamesByFile: Map<string, Set<string>>,
	seen: Set<string>,
): DrawerExportReferenceResult => {
	let anyUnresolved = false;
	for (const prop of objectLiteral.getProperties()) {
		if (prop.getKind() === SyntaxKind.PropertyAssignment) {
			const initializer = (prop as PropertyAssignment).getInitializer();
			if (!initializer) {
				anyUnresolved = true;
				continue;
			}
			const verdict = classifyDrawerExportReference(
				initializer,
				project,
				reassignedNamesByFile,
				seen,
			);
			if (verdict === 'references') {
				return 'references';
			}
			if (verdict === 'unresolved') {
				anyUnresolved = true;
			}
			continue;
		}
		if (prop.getKind() === SyntaxKind.ShorthandPropertyAssignment) {
			const valueSymbol = project
				.getTypeChecker()
				.getShorthandAssignmentValueSymbol(prop as ShorthandPropertyAssignment);
			if (!valueSymbol) {
				anyUnresolved = true;
				continue;
			}
			const verdict = referenceResultFromSymbolValue(
				resolveSymbolValue(valueSymbol, project, reassignedNamesByFile, seen),
			);
			if (verdict === 'references') {
				return 'references';
			}
			if (verdict === 'unresolved') {
				anyUnresolved = true;
			}
			continue;
		}
		if (prop.getKind() === SyntaxKind.SpreadAssignment) {
			const argument = prop
				.asKindOrThrow(SyntaxKind.SpreadAssignment)
				.getExpression();
			if (!argument) {
				anyUnresolved = true;
				continue;
			}
			const verdict = classifyDrawerExportReference(
				argument,
				project,
				reassignedNamesByFile,
				seen,
			);
			if (verdict === 'references') {
				return 'references';
			}
			if (verdict === 'unresolved') {
				anyUnresolved = true;
			}
		}
	}
	return anyUnresolved ? 'unresolved' : 'does-not-reference';
};

/**
 * Classifies an array literal for the anchor probe with the same
 * any-reference-wins, else any-unresolved, else-none semantics.
 */
const classifyArrayLiteralReference = (
	arrayLiteral: ArrayLiteralExpression,
	project: Project,
	reassignedNamesByFile: Map<string, Set<string>>,
	seen: Set<string>,
): DrawerExportReferenceResult => {
	let anyUnresolved = false;
	for (const element of arrayLiteral.getElements()) {
		const verdict = classifyDrawerExportReference(
			element,
			project,
			reassignedNamesByFile,
			seen,
		);
		if (verdict === 'references') {
			return 'references';
		}
		if (verdict === 'unresolved') {
			anyUnresolved = true;
		}
	}
	return anyUnresolved ? 'unresolved' : 'does-not-reference';
};

/**
 * Classifies `expression` (a JSX attribute value) for the module graph:
 * REFERENCES — it provably carries a drawer-module export (directly
 * (`<X surface={DrawerContent} />`), through an object literal
 * (`kit={{ Surface: DrawerContent, ... }}`), an array literal, a conditional
 * branch, or a binding whose value side is one of those literals — round
 * 28's BLOCKER 1: `const kit = {...}; <X kit={kit} />`); DOES_NOT_REFERENCE —
 * resolved and provably not; UNRESOLVED — the probe could not follow the
 * value (an unverifiable binding, or a parameter whose value comes from call
 * sites — round 28's BLOCKER 2). This is round 26's BLOCKER 2 anchor probe,
 * now three-valued: a component reference whose prop value carries drawer
 * exports anchors the component's definition file, and a prop the probe
 * cannot follow is an unresolved edge, never "no edge".
 */
const classifyDrawerExportReference = (
	expression: Node,
	project: Project,
	reassignedNamesByFile: Map<string, Set<string>>,
	seen: Set<string>,
): DrawerExportReferenceResult => {
	const unwrapped = unwrapExpression(expression);
	const kind = unwrapped.getKind();
	if (kind === SyntaxKind.Identifier) {
		const symbol = (unwrapped as Identifier).getSymbol();
		if (!symbol) {
			return 'unresolved';
		}
		// Round 28's BLOCKER 1: a binding whose VALUE SIDE is an object or
		// array literal is followed through that literal — classification
		// answers "is this value the drawer module's symbol?" (an object
		// literal is a real local value), but the anchor probe asks "could
		// drawer exports flow through this value?", so the literal's own
		// properties are walked instead of stopping at the null verdict.
		const objectLiteral = findObjectLiteralValueSide(
			symbol,
			reassignedNamesByFile,
			new Set(seen),
		);
		if (objectLiteral) {
			return classifyObjectLiteralReference(
				objectLiteral,
				project,
				reassignedNamesByFile,
				seen,
			);
		}
		const arrayLiteral = findArrayLiteralValueSide(
			symbol,
			reassignedNamesByFile,
			new Set(seen),
		);
		if (arrayLiteral) {
			return classifyArrayLiteralReference(
				arrayLiteral,
				project,
				reassignedNamesByFile,
				seen,
			);
		}
		// Round 28's BLOCKER 2: a parameter's value comes from its call
		// sites, so a prop that forwards a parameter is NOT a definite
		// non-reference — `({ kit, methods }) => <CrossFileKitDrawer kit={
		// kit } />` forwards whatever the caller passed, possibly the real
		// drawer kit. Classification is right to call the parameter itself a
		// definite local value (the parameter IS not the drawer module's
		// symbol); the anchor probe asks whether drawer exports can FLOW
		// through it, and the honest answer for an unfollowed parameter is
		// UNRESOLVED. The unresolved edge then surfaces the pair through
		// the module graph instead of silently dropping it.
		if (
			symbol.getDeclarations().length > 0 &&
			symbol
				.getDeclarations()
				.every(
					(declaration) =>
						declaration.getKind() === SyntaxKind.Parameter ||
						declaration.getKind() === SyntaxKind.BindingElement,
				)
		) {
			return 'unresolved';
		}
		return referenceResultFromSymbolValue(
			resolveSymbolValue(symbol, project, reassignedNamesByFile, seen),
		);
	}
	if (
		kind === SyntaxKind.PropertyAccessExpression ||
		kind === SyntaxKind.CallExpression ||
		kind === SyntaxKind.ConditionalExpression
	) {
		return referenceResultFromSymbolValue(
			resolveValueIdentity(unwrapped, project, reassignedNamesByFile, seen),
		);
	}
	if (kind === SyntaxKind.ObjectLiteralExpression) {
		return classifyObjectLiteralReference(
			unwrapped as ObjectLiteralExpression,
			project,
			reassignedNamesByFile,
			seen,
		);
	}
	if (kind === SyntaxKind.ArrayLiteralExpression) {
		return classifyArrayLiteralReference(
			unwrapped as ArrayLiteralExpression,
			project,
			reassignedNamesByFile,
			seen,
		);
	}
	// A string, a number, a template — a value that cannot be the drawer
	// module's export or carry one.
	return 'does-not-reference';
};

/**
 * Round 26's BLOCKER 2 — the module-graph discovery pass. UNVERIFIABLE is
 * computed per file, but the ordinary components-as-props split puts the
 * drawer imports in one file and the opaque `<kit.*>` tags in another: neither
 * file alone satisfies round 15's `importsDrawerModule && hasUnverifiableTag`
 * discriminator, so the whole construction dropped out of discovery. This pass
 * walks the module graph instead of the single file:
 *
 *  - `drawerPassers` — files that pass a drawer export as a prop value into a
 *    component reference (the ANCHOR);
 *  - for every anchor, the referenced component's DEFINITION file is a
 *    "drawer-export receiver";
 *  - a receiver that itself passes drawer exports onward is a transitively
 *    anchored file, so a chain `parent -> wrapper -> opaque-kit` stays closed.
 *
 * The result is a set of portable file paths that are drawer-anchored from the
 * module-graph side, plus the set of files that both pass drawer exports and
 * feed them into a file with unverifiable tags (the pair-anchor half, which
 * reddens on its own).
 *
 * Round 28's BLOCKERs 1-3 make the edge itself three-valued: `passesInto`
 * carries the REFERENCES edges (a drawer export provably flows across), and
 * `unresolvedPassesInto` carries the edges the probe could not follow (an
 * identifier-initialised object is now followed to its literal — BLOCKER 1 —
 * but a parameter forwarded onward stays UNRESOLVED — BLOCKER 2 — and a
 * default-imported component whose definition the walk cannot resolve
 * produces no edge at all — BLOCKER 3). An UNRESOLVED edge from an ANCHORED
 * passer into a receiver with drawer-shaped opaque tags forces the receiver
 * to surface (UNVERIFIABLE — the mechanism classification already has), and
 * the passer is that receiver's anchor: "an unresolved edge anywhere in the
 * pair's chain forces the pair to surface" instead of both halves silently
 * falling out of discovery.
 */
const buildDrawerPassGraph = (
	desiredFilePaths: Set<string>,
	project: Project,
	moduleResolution: ModuleResolution,
	moduleCache: Map<string, string | null>,
	declaredNamesByFile: Map<string, Set<string>>,
	reassignedNamesByFile: Map<string, Set<string>>,
	drawerTagName: (tagNameNode: Node) => DrawerTagNameResult,
) => {
	const passesInto = new Map<string, Set<string>>();
	const unresolvedPassesInto = new Map<string, Set<string>>();
	const unverifiableByFile = new Set<string>();
	const importsDrawerByFile = new Set<string>();

	for (const filePath of desiredFilePaths) {
		const sourceFile = project.getSourceFile(filePath);
		if (!sourceFile || /\.(?:spec|test)\.tsx$/.test(path.basename(filePath))) {
			continue;
		}
		const portable = toPortableSourcePath(sourceFile.getFilePath());
		if (fileImportsDrawerModule(sourceFile, project, reassignedNamesByFile)) {
			importsDrawerByFile.add(portable);
		}
		const jsxTags = [
			...sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
			...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
		];
		if (
			jsxTags.some(
				(node) => drawerTagName(node.getTagNameNode()) === UNVERIFIABLE_TAG,
			)
		) {
			unverifiableByFile.add(portable);
		}
		const walkContext: WalkContext = {
			moduleResolution,
			project,
			moduleCache,
			declaredNamesByFile,
			reassignedNamesByFile,
			drawerTagName,
		};
		for (const tag of jsxTags) {
			const tagNameNode = tag.getTagNameNode();
			const tagText = tagNameNode.getText();
			// Intrinsic lowercase tags and drawer-module elements themselves do
			// not "pass drawer exports into another component" — only a
			// component reference whose prop value IS a drawer export does.
			if (
				tagNameNode.getKind() === SyntaxKind.Identifier &&
				/^[a-z]/.test(tagText)
			) {
				continue;
			}
			if (typeof drawerTagName(tagNameNode) === 'string') {
				continue;
			}
			let edgeVerdict: DrawerExportReferenceResult | null = null;
			for (const attribute of tag.getAttributes()) {
				if (attribute.getKind() !== SyntaxKind.JsxAttribute) {
					continue;
				}
				const initializer = (attribute as JsxAttribute).getInitializer();
				if (!initializer) {
					continue;
				}
				const expression =
					initializer.getKind() === SyntaxKind.JsxExpression
						? (initializer as JsxExpression).getExpression()
						: null;
				if (!expression) {
					continue;
				}
				const verdict = classifyDrawerExportReference(
					expression,
					project,
					reassignedNamesByFile,
					new Set(),
				);
				if (verdict === 'references') {
					edgeVerdict = 'references';
					break;
				}
				if (verdict === 'unresolved') {
					edgeVerdict = 'unresolved';
				}
			}
			if (!edgeVerdict) {
				continue;
			}
			const definition = resolveComponentDefinitionCached(
				sourceFile,
				tagText,
				walkContext,
			);
			if (!definition) {
				continue;
			}
			const definitionPortable = toPortableSourcePath(
				definition.file.getFilePath(),
			);
			const edgeLane =
				edgeVerdict === 'references' ? passesInto : unresolvedPassesInto;
			const passers = edgeLane.get(definitionPortable) ?? new Set<string>();
			passers.add(portable);
			edgeLane.set(definitionPortable, passers);
		}
	}

	// Transitive closure: a file is drawer-anchored if it imports the drawer
	// module, or receives drawer exports from a file that is itself anchored.
	const anchoredReceivers = new Set(importsDrawerByFile);
	let changed = true;
	while (changed) {
		changed = false;
		for (const [receiver, passers] of passesInto) {
			if (anchoredReceivers.has(receiver)) {
				continue;
			}
			if ([...passers].some((passer) => anchoredReceivers.has(passer))) {
				anchoredReceivers.add(receiver);
				changed = true;
			}
		}
	}

	// The pair-anchor half: a file that passes drawer exports into a component
	// whose definition has unverifiable tags is itself an unverified drawer
	// construction — it routes real drawer exports into an opaque consumer.
	const pairAnchors = new Set<string>();
	for (const [receiver, passers] of passesInto) {
		if (!unverifiableByFile.has(receiver)) {
			continue;
		}
		for (const passer of passers) {
			pairAnchors.add(passer);
		}
	}

	// Round 28's BLOCKER 2: an UNRESOLVED edge from an ANCHORED passer into a
	// receiver with drawer-shaped opaque tags is the same "could be a drawer
	// kit" signal one hop further — the receiver is a file the guard could
	// not clear and must surface as UNVERIFIABLE, and the passer is that
	// receiver's anchor. An unresolved edge from a passer that is NOT
	// anchored carries no drawer signal at all (an ordinary parameter
	// forwarded onward), so it stays silent — the "what is intentionally not
	// a finding" shape.
	const unresolvedAnchoredReceivers = new Set<string>();
	for (const [receiver, passers] of unresolvedPassesInto) {
		if (!unverifiableByFile.has(receiver)) {
			continue;
		}
		for (const passer of passers) {
			if (!anchoredReceivers.has(passer)) {
				continue;
			}
			unresolvedAnchoredReceivers.add(receiver);
			pairAnchors.add(passer);
			break;
		}
	}

	return {
		anchoredReceivers,
		pairAnchors,
		unresolvedAnchoredReceivers,
		unverifiableByFile,
		importsDrawerByFile,
	};
};

const resolveTypeSideMemberValue = (
	propertyAccess: PropertyAccessExpression,
	project: Project,
	reassignedNamesByFile: Map<string, Set<string>>,
	seen: Set<string>,
): DrawerTagNameResult => {
	const base = unwrapExpression(propertyAccess.getExpression());
	if (base.getKind() !== SyntaxKind.Identifier) {
		return UNVERIFIABLE_TAG;
	}
	const baseSymbol = (base as Identifier).getSymbol();
	if (!baseSymbol) {
		return UNVERIFIABLE_TAG;
	}
	const objectLiteral = findObjectLiteralValueSide(
		baseSymbol,
		reassignedNamesByFile,
		seen,
	);
	if (objectLiteral) {
		return resolveObjectLiteralMember(
			objectLiteral,
			propertyAccess.getName(),
			project,
			reassignedNamesByFile,
			seen,
		);
	}

	// No readable value side. Round 21's BLOCKER 1: before falling back to
	// "the base binding IS a real local value," a base that is exactly a
	// `.map()`-style callback's element parameter is a member of whatever
	// the callback's ITERABLE supplies, not a value of its own.
	const baseDeclarations = baseSymbol.getDeclarations();
	if (
		baseDeclarations.length === 1 &&
		baseDeclarations[0].getKind() === SyntaxKind.Parameter
	) {
		const iterableVerdict = resolveIterableParameterMember(
			baseDeclarations[0],
			propertyAccess.getName(),
			project,
			reassignedNamesByFile,
			seen,
		);
		if (iterableVerdict !== undefined) {
			return iterableVerdict;
		}
	}

	// The base binding itself decides the verdict.
	if (
		baseDeclarations.length > 0 &&
		baseDeclarations.every(
			(declaration) =>
				!isRepoFilePath(declaration.getSourceFile().getFilePath()),
		)
	) {
		// An external base value — the member is part of an external value,
		// and the drawer module is a repo file (identity proof, the same
		// cut resolveSymbolValue applies to symbols).
		return null;
	}
	if (
		baseDeclarations.length > 0 &&
		baseDeclarations.every(
			(declaration) =>
				DEFINITE_LOCAL_DECLARATION_KINDS.has(declaration.getKind()) ||
				declaration.getKind() === SyntaxKind.BindingElement,
		)
	) {
		// Round 24's BLOCKER 1, round 26's re-proof: a Parameter/BindingElement
		// member base is NOT a definite non-drawer — a components-as-props kit
		// can hold the real drawer exports (`kit={{ Surface: DrawerContent,
		// ... }}` passed into a plain parameter). The only sound NOT_DRAWER
		// exception is when the guard can follow the member's VALUE to a
		// symbol that is not a drawer export — the shipped `app-shell.tsx`
		// (`item.Icon`) and `icon-color-picker.tsx` (`option.Icon`) shapes are
		// allowed through that way, enumerated by file + base + member in
		// NON_DRAWER_PARAMETER_MEMBER_ALLOWANCES with the value-level reason
		// each is safe. A member type declared `FC<any>` is NOT a disproof —
		// a repo-local DrawerContent can legally inhabit React's external
		// type, so a structurally-typed member with no value trace fails
		// closed as UNVERIFIABLE, never silently null.
		if (
			isAllowedNonDrawerParameterMember(
				propertyAccess.getSourceFile().getFilePath(),
				propertyAccess.getName(),
				base.getText(),
			)
		) {
			return null;
		}
		return UNVERIFIABLE_TAG;
	}
	// Round 28's BLOCKERs 1-3: the same value-shaped allowance applies to a
	// member of a base the probe cannot otherwise follow — `icon-color-
	// picker.tsx`'s `activeIconOption.Icon` (the base is the Tabler-only
	// catalog lookup `getIconColorPickerOption(...) ?? DEFAULT_...`). With
	// the three-valued anchor probe the unresolved pair would otherwise
	// surface; the allowance names the exact base + member and gives the
	// value-level reason, so it cannot generalise to a new shape.
	if (
		isAllowedNonDrawerParameterMember(
			propertyAccess.getSourceFile().getFilePath(),
			propertyAccess.getName(),
			base.getText(),
		)
	) {
		return null;
	}
	return UNVERIFIABLE_TAG;
};

/**
 * Resolves a member-expression value (`Parts.Surface`, `React.Suspense`,
 * `Layout.Suspense`) through the symbol graph. The checker hands back the
 * member's own symbol for most bindings (an object-literal property, a
 * namespace member of a repo module — which the drawer module is, so the
 * drawer spellings never reach the fallback below); when it returns none
 * (a member of an EXTERNAL namespace import, e.g. `<React.Suspense>` —
 * the checker enumerates no member symbol for ambient modules), the
 * member belongs to the base's module, and the base being a namespace
 * import that is not the repo-local drawer module is a certain
 * non-drawer verdict. A member that is not an export of a module whose
 * exports the checker enumerates is definitely not the drawer module's.
 *
 * Round 19's BLOCKER 2: when the checker hands back a TYPE-side member
 * symbol (a PropertySignature of the base's type — what the member of a
 * type-annotated object literal resolves to), the value side walk above
 * follows the base to the annotated object literal instead of trusting
 * the signature as evidence of absence.
 */
const resolvePropertyAccessValue = (
	propertyAccess: PropertyAccessExpression,
	project: Project,
	reassignedNamesByFile: Map<string, Set<string>>,
	seen: Set<string>,
): DrawerTagNameResult => {
	const symbol = propertyAccess.getSymbol();
	if (symbol) {
		if (symbol.getDeclarations().length > 0 && isTypeSideMemberSymbol(symbol)) {
			return resolveTypeSideMemberValue(
				propertyAccess,
				project,
				reassignedNamesByFile,
				seen,
			);
		}
		return resolveSymbolValue(symbol, project, reassignedNamesByFile, seen);
	}
	const base = unwrapExpression(propertyAccess.getExpression());
	if (base.getKind() === SyntaxKind.Identifier) {
		const baseSymbol = (base as Identifier).getSymbol();
		if (baseSymbol) {
			const aliasedBase =
				baseSymbol !== baseSymbol.getAliasedSymbol()
					? baseSymbol.getAliasedSymbol()
					: null;
			if (aliasedBase && aliasedBase.getExports().length > 0) {
				const member = aliasedBase.getExport(propertyAccess.getName());
				if (!member) {
					return null;
				}
				return resolveSymbolValue(member, project, reassignedNamesByFile, seen);
			}
			if (
				baseSymbol
					.getDeclarations()
					.some(
						(declaration) =>
							declaration.getKind() === SyntaxKind.NamespaceImport,
					)
			) {
				// A namespace import whose module the checker does not
				// enumerate (react's ambient `export =` module, or a module
				// that cannot be resolved from this file) — the member
				// belongs to that external module, never the repo-local
				// drawer module.
				return null;
			}
		}
	}
	return UNVERIFIABLE_TAG;
};

/**
 * Resolves a JSX tag's tag-name node to the name the drawer module exports
 * it under — through the symbol graph described above. Resolution is keyed
 * on the ACTUAL node: the checker resolves the binding at that node, in its
 * own lexical scope, so a same-named local declaration shadows an import by
 * scope, not by text search — and two same-text tags in different scopes
 * (round 17's BLOCKER 2: an earlier component's props named `Surface`/`Form`
 * followed by a later drawer built from imports under those same names) get
 * their own verdicts instead of the first node's answer. Discovery uses the
 * same machinery as the wrapper check, so there is no spelling the wrapper
 * check accepts that discovery can miss.
 */
const resolveDrawerTagName = (
	tagNameNode: Node,
	project: Project,
	reassignedNamesByFile: Map<string, Set<string>>,
): DrawerTagNameResult => {
	// A lowercase-leading PLAIN IDENTIFIER tag is an intrinsic DOM element
	// (`<button>`, `<div>`) — JSX forbids lowercase component identifiers,
	// and the checker does not give them a value symbol in every context,
	// so they must be a definite non-drawer value, never UNVERIFIABLE.
	// Round 19's BLOCKER 1: the intrinsic cut must NOT see the case of a
	// DOTTED tag name — `getText()` is the whole dotted path, and a
	// member-expression tag is a value expression regardless of the case
	// of its leading identifier (`<option.Icon />` renders the `Icon`
	// member of the `option` binding). Only a plain `Identifier` tag can
	// be intrinsic.
	if (
		tagNameNode.getKind() === SyntaxKind.Identifier &&
		/^[a-z]/.test(tagNameNode.getText())
	) {
		return null;
	}
	// A dotted tag name is resolved like any other member expression,
	// whatever the case of its base (the checker hands JSX member tags to
	// this resolver as PropertyAccessExpression).
	if (tagNameNode.getKind() === SyntaxKind.PropertyAccessExpression) {
		return resolvePropertyAccessValue(
			tagNameNode as PropertyAccessExpression,
			project,
			reassignedNamesByFile,
			new Set(),
		);
	}
	const symbol = tagNameNode.getSymbol();
	if (!symbol) {
		return UNVERIFIABLE_TAG;
	}
	return resolveSymbolValue(symbol, project, reassignedNamesByFile, new Set());
};

/**
 * True when the file imports at least one drawer-module export by name —
 * through any of the same alias/barrel spellings the tag machinery accepts.
 * This is round 15's IMPORTANT 3 discriminator: a file with an unverifiable
 * tag that imports the drawer module is a drawer file with an opaque marker
 * and must be discovered and reddened; a file with no drawer import at all
 * carries no drawer signal, and discovering every opaque local component
 * would flood the inventory with non-drawers.
 *
 * The named-import branch resolves each specifier through the symbol graph.
 * The namespace branch does the same, at the module level: the namespace
 * binding is an alias whose target's exports are exactly what
 * `Drawer.X`-spelled tags can reach — so an `export *` barrel (round 17's
 * BLOCKER 3 — the repo's normal organization) counts when any of its
 * exports is a drawer symbol, and a module with no drawer exports does not.
 * Type-only imports are not values (round 17's IMPORTANT 4): `import type
 * * as Drawer` must not make an unrelated opaque file look like a drawer
 * file.
 */
const fileImportsDrawerModule = (
	sourceFile: SourceFile,
	project: Project,
	reassignedNamesByFile: Map<string, Set<string>>,
): boolean => {
	for (const declaration of sourceFile.getImportDeclarations()) {
		if (declaration.isTypeOnly()) {
			continue;
		}
		if (declaration.getNamespaceImport()) {
			const namespaceImport = declaration.getNamespaceImport();
			const namespaceSymbol = namespaceImport?.getSymbol();
			const aliased = namespaceSymbol?.getAliasedSymbol();
			if (
				aliased &&
				aliased !== namespaceSymbol &&
				aliased.getDeclarations().length > 0
			) {
				// getExportsOfModule (not the symbol's raw exports map) is
				// what resolves `export *` barrels: the raw map carries only
				// a synthetic `__export` entry for a star re-export, while
				// the checker hands back every name `Drawer.X`-spelled tags
				// can reach.
				if (
					project
						.getTypeChecker()
						.getExportsOfModule(aliased)
						.some(
							(exportSymbol) =>
								typeof resolveSymbolValue(
									exportSymbol,
									project,
									reassignedNamesByFile,
									new Set(),
								) === 'string',
						)
				) {
					return true;
				}
			}
			continue;
		}
		for (const namedImport of declaration.getNamedImports()) {
			if (namedImport.isTypeOnly()) {
				continue;
			}
			const symbol = namedImport.getNameNode().getSymbol();
			if (!symbol) {
				continue;
			}
			const result = resolveSymbolValue(
				symbol,
				project,
				reassignedNamesByFile,
				new Set(),
			);
			if (typeof result === 'string') {
				return true;
			}
		}
	}
	return false;
};

const resolveNamespaceImport = (
	sourceFile: SourceFile,
	baseName: string,
): string | null => {
	const namespaceImport = sourceFile
		.getImportDeclarations()
		.find(
			(declaration) => declaration.getNamespaceImport()?.getText() === baseName,
		);
	if (!namespaceImport) {
		return null;
	}
	return namespaceImport.getModuleSpecifierValue();
};

const isLocallyDeclared = (
	sourceFile: SourceFile,
	name: string,
	declaredNamesByFile: Map<string, Set<string>>,
): boolean => {
	// The descendant walks are memoized per file — one walk per declaration
	// kind instead of one per tag name.
	let declared = declaredNamesByFile.get(sourceFile.getFilePath());
	if (!declared) {
		declared = new Set<string>();
		for (const declaration of sourceFile.getDescendantsOfKind(
			SyntaxKind.VariableDeclaration,
		)) {
			declared.add(declaration.getName());
		}
		for (const declaration of sourceFile.getDescendantsOfKind(
			SyntaxKind.FunctionDeclaration,
		)) {
			declared.add(declaration.getName() ?? '');
		}
		for (const declaration of sourceFile.getDescendantsOfKind(
			SyntaxKind.ClassDeclaration,
		)) {
			declared.add(declaration.getName() ?? '');
		}
		declaredNamesByFile.set(sourceFile.getFilePath(), declared);
	}
	return declared.has(name);
};

/**
 * The third resolution outcome, beyond "the drawer module's symbol under
 * this name" (a string) and "definitely not the drawer module's symbol"
 * (null): a locally-declared binding that the scan cannot classify
 * statically. Round 13's BLOCKER 1: `const Surface = DrawerContent;
 * const Form = DrawerForm; const Body = DrawerBody; const Footer =
 * DrawerFooter;` moved every marker the walk keys its entry on behind a
 * local declaration, and the shadowing rule returned null for all four —
 * no anchor, no walk, 43/43 green with the exact #990 break in the tree.
 * Local declarations are therefore no longer a dead end: identity chains
 * (`const X = Y` through any number of hops), namespace-member aliases
 * (`const D = Drawer; <D.DrawerBody />`) and same-symbol conditionals
 * (`const Surface = open ? DrawerContent : DrawerContent`) resolve to
 * their targets BEFORE anchor discovery, and a local binding the scan
 * cannot decide — a call, a mixed-symbol conditional, a reassigned
 * `let`, a `{children}`-routed definition — is UNVERIFIABLE and reddens
 * the file instead of silently not being an anchor.
 */
const UNVERIFIABLE_TAG = Symbol('drawer-tag-unverifiable');

type DrawerTagNameResult = string | null | typeof UNVERIFIABLE_TAG;

/**
 * True when the name is bound by an assignment anywhere in the file —
 * `let Form = DrawerForm; if (x) Form = Div;` renders a binding whose
 * final value is not statically decidable, so the alias it started from
 * is not the binding the JSX tag sees (round 14, BLOCKER 1: a conditional
 * assignment is the same problem as an alias chain, and must not be
 * silently resolved as if the reassignment did not exist). Memoized per
 * file.
 */
const isReassigned = (
	sourceFile: SourceFile,
	name: string,
	reassignedNamesByFile: Map<string, Set<string>>,
): boolean => {
	let reassigned = reassignedNamesByFile.get(sourceFile.getFilePath());
	if (!reassigned) {
		reassigned = new Set<string>();
		for (const binary of sourceFile.getDescendantsOfKind(
			SyntaxKind.BinaryExpression,
		)) {
			const binaryExpression = binary as BinaryExpression;
			if (
				binaryExpression.getOperatorToken().getKind() === SyntaxKind.EqualsToken
			) {
				const left = binaryExpression.getLeft();
				if (left.getKind() === SyntaxKind.Identifier) {
					reassigned.add(left.getText());
				}
			}
		}
		reassignedNamesByFile.set(sourceFile.getFilePath(), reassigned);
	}
	return reassigned.has(name);
};

const unwrapExpression = (node: Node): Node => {
	let current = node;
	for (;;) {
		const kind = current.getKind();
		if (
			kind === SyntaxKind.ParenthesizedExpression ||
			kind === SyntaxKind.AsExpression ||
			kind === SyntaxKind.NonNullExpression ||
			kind === SyntaxKind.SatisfiesExpression
		) {
			current = (current as Node & { getExpression(): Node }).getExpression();
			continue;
		}
		return current;
	}
};

const isTransparentExpression = (node: Node): boolean => {
	const kind = node.getKind();
	// JsxExpression/Fragment create no DOM node; the expression kinds cover
	// conditionals, `&&` chains, `.map()` calls and parentheses between a tag
	// and its wrapper element. The nodeless React wrappers (Fragment,
	// Suspense, StrictMode) are handled by the walk itself, above. A node
	// that is none of these (a `<div>`, a statement, an attribute) means the
	// tag is not directly inside an element, which the caller treats as a
	// structural violation.
	return (
		kind === SyntaxKind.JsxExpression ||
		kind === SyntaxKind.JsxFragment ||
		kind === SyntaxKind.ConditionalExpression ||
		kind === SyntaxKind.BinaryExpression ||
		kind === SyntaxKind.ParenthesizedExpression ||
		kind === SyntaxKind.CallExpression ||
		kind === SyntaxKind.ArrowFunction ||
		kind === SyntaxKind.PrefixUnaryExpression ||
		kind === SyntaxKind.AsExpression ||
		kind === SyntaxKind.NonNullExpression ||
		kind === SyntaxKind.SatisfiesExpression ||
		kind === SyntaxKind.TemplateExpression
	);
};

/**
 * React's nodeless wrappers — `Fragment`, `Suspense`, `StrictMode` (imported
 * from `react`, in a named or namespace-member spelling) — render no DOM
 * node of their own, so a drawer part inside one is still a direct child of
 * the wrapper's parent element. The walk skips them like the expression
 * kinds below. A same-named tag that is NOT imported from `react` is not
 * skipped (it is a real element, and its own binding resolution will judge
 * it).
 */
const isNodelessReactWrapper = (
	openingElement: JsxOpeningElement | JsxSelfClosingElement,
	sourceFile: SourceFile,
): boolean => {
	const tagText = openingElement.getTagNameNode().getText();
	const memberMatch = tagText.match(
		/^([A-Za-z_$][\w$]*)\.(Fragment|Suspense|StrictMode)$/,
	);
	if (memberMatch) {
		return resolveNamespaceImport(sourceFile, memberMatch[1]) === 'react';
	}
	if (!NODELESS_REACT_WRAPPER_NAMES.has(tagText)) {
		return false;
	}
	return sourceFile
		.getImportDeclarations()
		.some(
			(declaration) =>
				declaration.getModuleSpecifierValue() === 'react' &&
				declaration
					.getNamedImports()
					.some(
						(namedImport) =>
							!namedImport.isTypeOnly() &&
							(namedImport.getAliasNode()?.getText() ??
								namedImport.getName()) === tagText,
					),
		);
};

// The complete static Tailwind display-utility list — the canonical set both
// the class-list recognizer and the @apply resolver work from, so the two can
// never disagree about what restores a box. `contents` is the boxless one;
// every other display utility generates a principal box (or none at all —
// `hidden` — but a class list mixing `contents` and `hidden` is not
// statically `display: contents`, so it is treated as restoring).
const TAILWIND_DISPLAY_UTILITIES = new Set([
	'block',
	'inline-block',
	'inline',
	'flex',
	'inline-flex',
	'table',
	'inline-table',
	'table-caption',
	'table-cell',
	'table-column',
	'table-column-group',
	'table-footer-group',
	'table-header-group',
	'table-row-group',
	'table-row',
	'flow-root',
	'grid',
	'inline-grid',
	'contents',
	'list-item',
	'hidden',
]);

// Tailwind display utilities that generate a principal box (or otherwise stop
// `display: contents` from winning). A class list that contains BOTH `contents`
// and one of these — at any breakpoint, e.g. `min-[1100px]:block` — is not
// statically `display: contents` at every width that matters, so it is not
// established boxless (round 24's IMPORTANT 5). Round 28's IMPORTANT 5: the
// set is DERIVED from the canonical display list (everything except
// `contents`) instead of hand-maintained — round 27 found the hand-written
// list missing `table-cell` and `list-item`, so
// `contents min-[1100px]:table-cell` was accepted as established boxless.
const DISPLAY_RESTORING_UTILITIES = new Set(
	[...TAILWIND_DISPLAY_UTILITIES].filter((utility) => utility !== 'contents'),
);

/**
 * Whether a class list token is a display utility that would restore a box at
 * the width that token applies to. A Tailwind utility token is a bare utility
 * (`block`) or a variant-prefixed one (`md:block`, `min-[1100px]:block`); the
 * variant is stripped to the leaf utility, which is what each such utility
 * actually sets.
 */
const isDisplayRestoringUtilityToken = (token: string): boolean => {
	const leaf = token.slice(token.lastIndexOf(':') + 1);
	return DISPLAY_RESTORING_UTILITIES.has(leaf);
};

/**
 * A `className`/`style` value that statically resolves to `display:
 * contents` — round 21's IMPORTANT 4. Such an element generates no
 * principal box: its own children participate directly in ITS PARENT's
 * formatting context, so it does not break the drawer's flex column the
 * way a real `<div>` does, and #990 asks the guard to forbid wrappers that
 * BREAK the chain, not every intermediate element. Only the Tailwind
 * `contents` utility class and a literal `style={{ display: 'contents' }}`
 * are recognized — a computed or conditional class/style is not statically
 * decidable and is NOT treated as boxless (fail closed).
 *
 * Round 24's IMPORTANT 5: merely CONTAINING the `contents` token is not
 * enough — a responsive utility that restores a box at a larger width
 * (`contents min-[1100px]:block`) still contains the token but is not
 * `display: contents` everywhere. A class list that mixes `contents` with a
 * box-restoring utility at any breakpoint is not established boxless, so it
 * is treated as a real element (a violation when it breaks the chain).
 *
 * Round 26's IMPORTANT 5: the FIRST evidence is not the WINNING evidence.
 * The inline `style` attribute beats the class cascade, so `className=
 * "contents"` with a later `style={{ display: 'block' }}` still generates a
 * box — the old early return accepted it on the class evidence alone. The
 * guard must establish the winning value: the style disposition decides
 * first (literal `contents` proves boxless, any other literal display value
 * restores a box, an undecidable style fails closed), and the class list is
 * consulted only when the style does not override display.
 *
 * Round 28's IMPORTANT 7: a SPREAD in the style object makes the winning
 * value unestablished even when a direct `display: 'contents'` is present —
 * `{ display: 'contents', ...wrapperStyle }` with `wrapperStyle = {
 * display: 'block' }` is a real block at runtime. Spreads are treated like
 * any other undecidable style: fail closed, never conclude boxless.
 */
const isBoxlessWrapperElement = (
	openingElement: JsxOpeningElement | JsxSelfClosingElement,
): boolean => {
	let classNameIsBoxless = false;
	let styleDisposition: 'absent' | 'contents' | 'restoring' | 'undecidable' =
		'absent';
	for (const attribute of openingElement.getAttributes()) {
		if (attribute.getKind() !== SyntaxKind.JsxAttribute) {
			continue;
		}
		const jsxAttribute = attribute as JsxAttribute;
		const attributeName = jsxAttribute.getNameNode().getText();
		const initializer = jsxAttribute.getInitializer();
		if (!initializer) {
			continue;
		}
		if (
			attributeName === 'className' &&
			initializer.getKind() === SyntaxKind.StringLiteral
		) {
			const classList = (initializer as StringLiteral)
				.getLiteralValue()
				.trim()
				.split(/\s+/)
				.filter((token) => token.length > 0);
			const hasContents = classList.some((token) => token === 'contents');
			if (hasContents) {
				const hasBoxRestoringToken = classList.some(
					(token) =>
						token !== 'contents' && isDisplayRestoringUtilityToken(token),
				);
				classNameIsBoxless = !hasBoxRestoringToken;
			}
		}
		if (attributeName === 'style') {
			if (initializer.getKind() === SyntaxKind.JsxExpression) {
				const expression = (initializer as JsxExpression).getExpression();
				if (
					expression &&
					expression.getKind() === SyntaxKind.ObjectLiteralExpression
				) {
					const styleObject = expression as ObjectLiteralExpression;
					// Round 28's IMPORTANT 7: a SPREAD can supply or override
					// `display` — `{ display: 'contents', ...wrapperStyle }`
					// with `wrapperStyle = { display: 'block' as const }` is a
					// real block (the later spread wins ordinary object
					// construction), and `{ ...base }` may carry any display
					// value. The winning value is not statically established
					// when the style object contains a spread, so the wrapper
					// is not boxless — the same fail-closed answer as a
					// dynamic style object.
					if (
						styleObject
							.getProperties()
							.some((prop) => prop.getKind() === SyntaxKind.SpreadAssignment)
					) {
						styleDisposition = 'undecidable';
					} else {
						const displayProperty = styleObject.getProperty('display');
						if (
							displayProperty &&
							displayProperty.getKind() === SyntaxKind.PropertyAssignment
						) {
							const displayInitializer = (
								displayProperty as PropertyAssignment
							).getInitializer();
							if (
								displayInitializer &&
								displayInitializer.getKind() === SyntaxKind.StringLiteral
							) {
								styleDisposition =
									(displayInitializer as StringLiteral).getLiteralValue() ===
									'contents'
										? 'contents'
										: 'restoring';
							} else {
								styleDisposition = 'undecidable';
							}
						}
					}
				} else {
					// A style that is not a literal object may contain a
					// display value the guard cannot see — not established.
					styleDisposition = 'undecidable';
				}
			}
		}
	}
	// The inline style wins the cascade over the class list, so it decides
	// first. A style that does not name display at all leaves the class
	// cascade in charge.
	if (styleDisposition === 'contents') {
		return true;
	}
	if (styleDisposition === 'restoring' || styleDisposition === 'undecidable') {
		return false;
	}
	return classNameIsBoxless;
};

/**
 * The nearest element that actually contains the body/footer tag in the DOM
 * sense: fragments, JSX expressions and the other kinds below create no
 * node, so they are skipped — and so are the nodeless React wrappers and a
 * `display: contents` element (round 21's IMPORTANT 4 — it generates no box
 * of its own either). Any other kind of ancestor means the tag is not
 * directly inside an element, which the caller treats as a structural
 * violation. A null result means no enclosing element exists at all in the
 * file, i.e. the tag sits inside a component DEFINITION (a composition
 * helper) rather than at a drawer call site.
 */
const findWrapperOpeningElement = (
	node: JsxOpeningElement | JsxSelfClosingElement,
	sourceFile: SourceFile,
): JsxOpeningElement | null => {
	let current: Node | undefined = node.getParent();
	// An opening tag's parent is the JsxElement of its OWN element — step past
	// it before looking for the wrapper that contains the whole body/footer.
	if (
		node.getKind() === SyntaxKind.JsxOpeningElement &&
		current?.getKind() === SyntaxKind.JsxElement
	) {
		current = current.getParent();
	}
	while (current) {
		if (current.getKind() === SyntaxKind.JsxElement) {
			const openingElement = (current as JsxElement).getOpeningElement();
			if (
				isNodelessReactWrapper(openingElement, sourceFile) ||
				(/^[a-z]/.test(openingElement.getTagNameNode().getText()) &&
					isBoxlessWrapperElement(openingElement))
			) {
				current = current.getParent();
				continue;
			}
			return openingElement;
		}
		if (!isTransparentExpression(current)) {
			return null;
		}
		current = current.getParent();
	}
	return null;
};

/**
 * Classifies a JSX tag by what its local name actually binds to. The two
 * legitimate wrapper names (DrawerForm, DrawerContent) resolve to the drawer
 * module's export; anything else — a local declaration, a different module's
 * export, an unresolvable import — is `other`, and a body/footer under it is
 * a structural violation.
 */
const resolveTagBinding = (
	tagNameNode: Node,
	project: Project,
	reassignedNamesByFile: Map<string, Set<string>>,
): 'drawer-form' | 'drawer-content' | 'other' => {
	const name = resolveDrawerTagName(
		tagNameNode,
		project,
		reassignedNamesByFile,
	);
	if (name === 'DrawerForm') {
		return 'drawer-form';
	}
	if (name === 'DrawerContent') {
		return 'drawer-content';
	}
	// UNVERIFIABLE (and every non-drawer binding) is 'other': a part under
	// a wrapper the scan cannot classify is a structural violation.
	return 'other';
};

// ---------------------------------------------------------------------------
// Round 12: drawer-section resolution.
//
// Round 11's IMPORTANT 1 + 2: discovery keyed on a syntactic marker AT THE
// CALL SITE (first `DrawerForm`, then the part tags), and any refactor that
// moved the marker elsewhere while preserving the runtime structure walked
// straight through — 28/28 green with the exact #990 break in the tree, in
// two idiomatic shapes: a same-file sub-component rendering the form, and
// parts produced by a cross-file helper. The round-12 rule is therefore not
// a third marker: the walk below RESOLVES WHAT THE DRAWER RENDERS. From
// every call-site `DrawerContent`/`DrawerForm` it expands component
// references — same-file sub-components and cross-file helpers alike —
// through their definitions to the parts and forms they ultimately produce,
// and judges those occurrences by the element chain around them.
//
// The expansion boundary is stated here, plainly:
//
//  - A reference is resolvable when its binding is a local declaration or
//    an in-repo module export whose body is statically a JSX tree (through
//    arrows, function blocks, memo/forwardRef wrapping, conditionals and
//    parentheses — see extractComponentBody). Re-export barrels, aliases and
//    namespace spellings follow the same machinery as the wrapper check.
//  - A `{children}` passthrough inside a definition hands the reference's
//    OWN JSX children to that position, so fragment/div passthrough helpers
//    resolve exactly (a div passthrough puts the parts behind a `<div>` and
//    reddens; a fragment passthrough is transparent and stays green).
//  - Everything else — an unresolvable import, a node_modules component, a
//    non-JSX definition body, a local object member, a bare expression as a
//    direct child of the surface or the form, a children passthrough in the
//    anchored subtree, or a reference chain deeper than the depth limit —
//    is UNVERIFIABLE, and unverifiable must not be green: the file becomes a
//    violation so a reviewer looks at it. Drawer-module elements
//    (DrawerHeader, DrawerTitle, ...) are NOT expanded — their internal
//    composition is the artifact under test, pinned by the render half and
//    the Playwright spec — but a part nested inside one still reddens via
//    the chain.
// ---------------------------------------------------------------------------

const EXPANSION_DEPTH_LIMIT = 8;

type DrawerSectionDefinition = {
	body: Node[];
	file: SourceFile;
};

type PendingRefChildren = {
	nodes: readonly Node[];
	file: SourceFile;
};

type WalkedOccurrence = {
	node: JsxOpeningElement | JsxSelfClosingElement;
	chain: Array<JsxOpeningElement | JsxSelfClosingElement>;
};

type WalkState = {
	parts: WalkedOccurrence[];
	forms: WalkedOccurrence[];
	unverifiable: boolean;
};

type WalkContext = {
	moduleResolution: ModuleResolution;
	project: Project;
	moduleCache: Map<string, string | null>;
	declaredNamesByFile: Map<string, Set<string>>;
	reassignedNamesByFile: Map<string, Set<string>>;
	drawerTagName: (tagNameNode: Node) => DrawerTagNameResult;
};

const isNodeModulesFilePath = (filePath: string): boolean =>
	filePath.includes(`${path.sep}node_modules${path.sep}`);

const resolveModuleFilePath = (
	fromFilePath: string,
	moduleSpecifier: string,
	moduleResolution: ModuleResolution,
	moduleCache: Map<string, string | null>,
): string | null => {
	// Round 28: the per-scan cache is a view over the module-scope cache,
	// which survives the suite's repeated scans (the resolution answer is
	// deterministic for the fixed tsconfig) and is dropped on any content
	// refresh. Writing through the shared map keeps both consistent.
	const cacheKey = `${fromFilePath}|${moduleSpecifier}`;
	let resolved = sharedModuleResolutionCache.get(cacheKey);
	if (resolved === undefined) {
		resolved =
			ts.resolveModuleName(
				moduleSpecifier,
				fromFilePath,
				moduleResolution.compilerOptions,
				moduleResolution.host,
			).resolvedModule?.resolvedFileName ?? null;
		sharedModuleResolutionCache.set(cacheKey, resolved);
	}
	moduleCache.set(cacheKey, resolved);
	return resolved;
};

/**
 * The JSX a component definition ultimately renders — the walk roots for a
 * resolved reference. Unwraps the forms a static scan can see through: the
 * JSX itself, arrow/function bodies (expression or a block whose returns
 * are read by the execution-aware collector below — round 13's IMPORTANT
 * 2), memo/forwardRef wrapping, parentheses and conditionals. A body that
 * renders a literal nothing (null, undefined, a string) is an EMPTY body,
 * not an unresolvable one. Anything else (an identifier, a call to a
 * non-memo helper, ...) is null — the walk then fails loud, because the
 * geometry behind that reference is not statically decidable.
 */
const extractComponentBody = (node: Node): Node[] | null => {
	const kind = node.getKind();
	if (
		kind === SyntaxKind.JsxElement ||
		kind === SyntaxKind.JsxSelfClosingElement ||
		kind === SyntaxKind.JsxFragment
	) {
		return [node];
	}
	if (kind === SyntaxKind.ParenthesizedExpression) {
		const expression = (
			node as Node & { getExpression(): Node }
		).getExpression();
		return extractComponentBody(expression);
	}
	if (kind === SyntaxKind.ConditionalExpression) {
		const conditional = node as ConditionalExpression;
		const whenTrue = extractComponentBody(conditional.getWhenTrue());
		const whenFalse = extractComponentBody(conditional.getWhenFalse());
		if (!whenTrue || !whenFalse) {
			return null;
		}
		return [...whenTrue, ...whenFalse];
	}
	if (kind === SyntaxKind.ArrowFunction) {
		const body = (node as ArrowFunction).getBody();
		if (body.getKind() === SyntaxKind.Block) {
			return extractBlockReturns(body as Block);
		}
		return extractComponentBody(body);
	}
	if (
		kind === SyntaxKind.FunctionDeclaration ||
		kind === SyntaxKind.FunctionExpression
	) {
		const block = (node as FunctionDeclaration).getBody() as Block | undefined;
		return block ? extractBlockReturns(block) : [];
	}
	if (kind === SyntaxKind.CallExpression) {
		const call = node as CallExpression;
		const calleeText = call.getExpression().getText();
		if (
			calleeText === 'memo' ||
			calleeText === 'forwardRef' ||
			calleeText.endsWith('.memo') ||
			calleeText.endsWith('.forwardRef')
		) {
			const firstArg = call.getArguments()[0];
			return firstArg ? extractComponentBody(firstArg) : [];
		}
		// Round 16 (IMPORTANT 5): a runtime component factory — a call whose
		// first argument is a function expression or a dynamic import
		// (`lazy(() => import('./chart'))`, `lazy(() => <div />)`, `useMemo(
		// () => Chart, [])`). The factory adds no DOM node of its own, so a
		// loader whose body IS statically JSX expands normally; a loader
		// that is not statically JSX (an identifier — a component resolved
		// elsewhere — a dynamic import — a module scanned on its own) is an
		// EMPTY body: nothing to expand, and nothing unverifiable.
		if (isFactoryCall(call)) {
			const firstArgument = unwrapExpression(call.getArguments()[0]);
			const argumentKind = firstArgument.getKind();
			if (
				argumentKind === SyntaxKind.ArrowFunction ||
				argumentKind === SyntaxKind.FunctionExpression
			) {
				const body = (firstArgument as ArrowFunction).getBody();
				if (body.getKind() === SyntaxKind.Block) {
					return extractBlockReturns(body as Block);
				}
				const bodyUnwrapped = unwrapExpression(body);
				const bodyKind = bodyUnwrapped.getKind();
				if (
					bodyKind === SyntaxKind.Identifier ||
					bodyKind === SyntaxKind.CallExpression
				) {
					return [];
				}
				return extractComponentBody(bodyUnwrapped);
			}
			return [];
		}
		return null;
	}
	if (kind === SyntaxKind.VariableDeclaration) {
		const initializer = (node as VariableDeclaration).getInitializer();
		return initializer ? extractComponentBody(initializer) : null;
	}
	if (
		kind === SyntaxKind.NullKeyword ||
		kind === SyntaxKind.UndefinedKeyword ||
		kind === SyntaxKind.StringLiteral ||
		kind === SyntaxKind.NumericLiteral ||
		kind === SyntaxKind.TrueKeyword ||
		kind === SyntaxKind.FalseKeyword
	) {
		return [];
	}
	return null;
};

/**
 * Literal truth of a condition — `true`, `false`, `!true`, `!false` — or
 * null when the condition is not statically decidable. Round 13's
 * IMPORTANT 2 probe used `if (true)` to hide the executing return behind a
 * clean unreachable one; a literal condition selects exactly the branch
 * that executes, and the statements after a returning branch are dead.
 */
const evalLiteralCondition = (node: Node): boolean | null => {
	const kind = node.getKind();
	if (kind === SyntaxKind.TrueKeyword) {
		return true;
	}
	if (kind === SyntaxKind.FalseKeyword) {
		return false;
	}
	if (kind === SyntaxKind.PrefixUnaryExpression) {
		const unary = node as PrefixUnaryExpression;
		if (unary.getOperatorToken() === SyntaxKind.ExclamationToken) {
			const operand = evalLiteralCondition(unary.getOperand());
			return operand === null ? null : !operand;
		}
	}
	return null;
};

type BlockReturnCollector = {
	bodies: Node[];
	terminated: boolean;
};

const asStatementList = (statement: Statement): readonly Statement[] =>
	statement.getKind() === SyntaxKind.Block
		? (statement as Block).getStatements()
		: [statement];

/**
 * Collects every return value that can execute in a statement list,
 * following the control flow: sequential statements (an unconditional
 * return makes everything after it dead), if/else (literal conditions
 * select one branch; otherwise both branches AND the fall-through when
 * there is no else), switch (every case is a candidate, and the
 * continuation too unless a default exists and every case returns),
 * try/catch/finally (union of all three blocks), loops (the body may run
 * zero times, so the continuation always joins), and nested blocks.
 * Returns null when ANY reachable return value is not statically
 * extractable — the walk then fails loud. Round 13's IMPORTANT 2: the
 * old collector read only top-level returns, so a nested return that is
 * the one actually taken (`if (true) { return <div><Body/></div>; }
 * return <DrawerBody />;`) silently substituted the unreachable clean
 * return and shipped 43/43 green.
 */
const collectStatementReturns = (
	statements: readonly Statement[],
): BlockReturnCollector | null => {
	const bodies: Node[] = [];
	for (const statement of statements) {
		const kind = statement.getKind();
		if (kind === SyntaxKind.ReturnStatement) {
			const expression = (statement as ReturnStatement).getExpression();
			if (expression) {
				const extracted = extractComponentBody(expression);
				if (!extracted) {
					return null;
				}
				bodies.push(...extracted);
			}
			return { bodies, terminated: true };
		}
		if (kind === SyntaxKind.IfStatement) {
			const ifStatement = statement as IfStatement;
			const condition = evalLiteralCondition(ifStatement.getExpression());
			const thenStatement = ifStatement.getThenStatement();
			const elseStatement = ifStatement.getElseStatement();
			if (condition === true) {
				const thenCollected = collectStatementReturns(
					asStatementList(thenStatement),
				);
				if (thenCollected === null) {
					return null;
				}
				bodies.push(...thenCollected.bodies);
				if (thenCollected.terminated) {
					return { bodies, terminated: true };
				}
				continue;
			}
			if (condition === false) {
				if (!elseStatement) {
					continue;
				}
				const elseCollected = collectStatementReturns(
					asStatementList(elseStatement),
				);
				if (elseCollected === null) {
					return null;
				}
				bodies.push(...elseCollected.bodies);
				if (elseCollected.terminated) {
					return { bodies, terminated: true };
				}
				continue;
			}
			const thenCollected = collectStatementReturns(
				asStatementList(thenStatement),
			);
			if (thenCollected === null) {
				return null;
			}
			bodies.push(...thenCollected.bodies);
			if (elseStatement) {
				const elseCollected = collectStatementReturns(
					asStatementList(elseStatement),
				);
				if (elseCollected === null) {
					return null;
				}
				bodies.push(...elseCollected.bodies);
				if (thenCollected.terminated && elseCollected.terminated) {
					return { bodies, terminated: true };
				}
			}
			continue;
		}
		if (kind === SyntaxKind.SwitchStatement) {
			const switchStatement = statement as SwitchStatement;
			let hasDefault = false;
			let allTerminated = true;
			for (const clause of switchStatement.getCaseBlock().getClauses()) {
				if (clause.getKind() === SyntaxKind.DefaultClause) {
					hasDefault = true;
				}
				const clauseCollected = collectStatementReturns(
					(clause as CaseClause).getStatements(),
				);
				if (clauseCollected === null) {
					return null;
				}
				bodies.push(...clauseCollected.bodies);
				if (!clauseCollected.terminated) {
					allTerminated = false;
				}
			}
			if (hasDefault && allTerminated) {
				return { bodies, terminated: true };
			}
			continue;
		}
		if (kind === SyntaxKind.TryStatement) {
			const tryStatement = statement as TryStatement;
			const tryCollected = collectStatementReturns(
				tryStatement.getTryBlock().getStatements(),
			);
			if (tryCollected === null) {
				return null;
			}
			bodies.push(...tryCollected.bodies);
			const catchClause = tryStatement.getCatchClause();
			let catchTerminated = false;
			if (catchClause) {
				const catchCollected = collectStatementReturns(
					(catchClause as CatchClause).getBlock().getStatements(),
				);
				if (catchCollected === null) {
					return null;
				}
				bodies.push(...catchCollected.bodies);
				catchTerminated = catchCollected.terminated;
			}
			const finallyBlock = tryStatement.getFinallyBlock();
			if (finallyBlock) {
				// `getFinallyBlock()` returns a `Block` node directly (not a
				// wrapper with a `getBlock()`), so the statements are read off
				// the block itself. The old `.getBlock()` cast crashed on any
				// component whose body contained a `try { } finally { }` —
				// throw instead of recovering, which my round-26 graph pass
				// exposed by resolving more expressions than the per-file walk
				// did.
				const finallyCollected = collectStatementReturns(
					finallyBlock.getStatements(),
				);
				if (finallyCollected === null) {
					return null;
				}
				bodies.push(...finallyCollected.bodies);
				if (finallyCollected.terminated) {
					return { bodies, terminated: true };
				}
			}
			if (tryCollected.terminated && (!catchClause || catchTerminated)) {
				return { bodies, terminated: true };
			}
			continue;
		}
		if (
			Node.isForStatement(statement) ||
			Node.isForInStatement(statement) ||
			Node.isForOfStatement(statement) ||
			Node.isWhileStatement(statement) ||
			Node.isDoStatement(statement)
		) {
			const loopBody = statement.getStatement();
			const loopCollected = collectStatementReturns(asStatementList(loopBody));
			if (loopCollected === null) {
				return null;
			}
			bodies.push(...loopCollected.bodies);
			// The body may run zero times — the continuation always joins.
			continue;
		}
		if (kind === SyntaxKind.Block) {
			const nestedCollected = collectStatementReturns(
				(statement as Block).getStatements(),
			);
			if (nestedCollected === null) {
				return null;
			}
			bodies.push(...nestedCollected.bodies);
			if (nestedCollected.terminated) {
				return { bodies, terminated: true };
			}
			continue;
		}
		if (kind === SyntaxKind.LabeledStatement) {
			const labeledCollected = collectStatementReturns([
				(statement as LabeledStatement).getStatement(),
			]);
			if (labeledCollected === null) {
				return null;
			}
			bodies.push(...labeledCollected.bodies);
			if (labeledCollected.terminated) {
				return { bodies, terminated: true };
			}
			continue;
		}
		// Everything else — expression statements, declarations, throws —
		// cannot return from this function (a return inside a nested arrow
		// or function declaration belongs to THAT function).
	}
	return { bodies, terminated: false };
};

const extractBlockReturns = (block: Block): Node[] | null => {
	const collected = collectStatementReturns(block.getStatements());
	if (collected === null) {
		return null;
	}
	return collected.bodies;
};

const findLocalComponentDeclaration = (
	sourceFile: SourceFile,
	name: string,
): Node | null => {
	// Round 28: memoized at module scope — the per-file declaration lists are
	// stable until a content refresh drops the map, and the old per-call
	// triple walk made the now-common definition resolution quadratic in the
	// file's declaration count.
	let byName = localDeclarationsByFile.get(sourceFile.getFilePath());
	if (!byName) {
		byName = new Map<string, Node>();
		for (const declaration of sourceFile.getFunctions()) {
			byName.set(declaration.getName() ?? '', declaration);
		}
		for (const declaration of sourceFile.getClasses()) {
			byName.set(declaration.getName() ?? '', declaration);
		}
		for (const declaration of sourceFile.getVariableDeclarations()) {
			byName.set(declaration.getName(), declaration);
		}
		localDeclarationsByFile.set(sourceFile.getFilePath(), byName);
	}
	return byName.get(name) ?? null;
};

const findLocalExportInModule = (
	file: SourceFile,
	name: string,
): Node | null => {
	if (name === 'default') {
		const exportAssignment = file.getExportAssignments()[0];
		if (exportAssignment) {
			const expression = unwrapExpression(exportAssignment.getExpression());
			// Round 28's BLOCKER 3: `export default CrossFileKitDrawer;` names
			// a local binding — follow it to its declaration so the walk can
			// extract the component body; a bare identifier would resolve to
			// no body and silently drop the definition.
			if (expression.getKind() === SyntaxKind.Identifier) {
				const local = findLocalComponentDeclaration(file, expression.getText());
				if (local) {
					return local;
				}
			}
			return expression;
		}
		for (const declaration of file.getFunctions()) {
			if (declaration.isDefaultExport()) {
				return declaration;
			}
		}
		for (const declaration of file.getClasses()) {
			if (declaration.isDefaultExport()) {
				return declaration;
			}
		}
		return null;
	}
	for (const declaration of file.getFunctions()) {
		if (declaration.getName() === name && declaration.isExported()) {
			return declaration;
		}
	}
	for (const declaration of file.getClasses()) {
		if (declaration.getName() === name && declaration.isExported()) {
			return declaration;
		}
	}
	for (const declaration of file.getVariableDeclarations()) {
		if (
			declaration.getName() === name &&
			declaration.getVariableStatement()?.isExported()
		) {
			return declaration;
		}
	}
	return null;
};

/**
 * Resolves `exportName` inside `moduleFilePath` to the node that defines it,
 * following re-export barrels (`export * from`, aliased `export { X as Y }`,
 * specifier-less `export { X }` bound by an import) like the wrapper-chain
 * machinery does — but terminating at ANY module, not just the drawer
 * module. Depth- and cycle-limited. Null means unresolvable.
 */
const resolveNamedExport = (
	moduleFilePath: string,
	exportName: string,
	moduleResolution: ModuleResolution,
	project: Project,
	moduleCache: Map<string, string | null>,
	visited: Set<string>,
	depth: number,
): { file: SourceFile; node: Node } | null => {
	if (depth >= EXPANSION_DEPTH_LIMIT) {
		return null;
	}
	const file = project.addSourceFileAtPath(moduleFilePath);
	const direct = findLocalExportInModule(file, exportName);
	if (direct) {
		return { file, node: direct };
	}
	const visitedKey = `${moduleFilePath}|${exportName}`;
	if (visited.has(visitedKey)) {
		return null;
	}
	visited.add(visitedKey);
	for (const declaration of file.getExportDeclarations()) {
		const moduleSpecifier = declaration.getModuleSpecifierValue();
		const namedExports = declaration.getNamedExports();
		if (moduleSpecifier) {
			if (namedExports.length === 0 && !declaration.getNamespaceExport()) {
				// `export * from '...'` — forwards every named export unchanged.
				const target = resolveModuleFilePath(
					moduleFilePath,
					moduleSpecifier,
					moduleResolution,
					moduleCache,
				);
				if (!target || isNodeModulesFilePath(target)) {
					continue;
				}
				const result = resolveNamedExport(
					target,
					exportName,
					moduleResolution,
					project,
					moduleCache,
					visited,
					depth + 1,
				);
				if (result) {
					return result;
				}
				continue;
			}
			// A namespace re-export (`export * as X`) forwards member
			// lookups, not the names themselves — the member path resolves
			// those.
			if (declaration.getNamespaceExport()) {
				continue;
			}
			for (const specifier of namedExports) {
				if (
					(specifier.getAliasNode()?.getText() ?? specifier.getName()) !==
					exportName
				) {
					continue;
				}
				const target = resolveModuleFilePath(
					moduleFilePath,
					moduleSpecifier,
					moduleResolution,
					moduleCache,
				);
				if (!target || isNodeModulesFilePath(target)) {
					continue;
				}
				const result = resolveNamedExport(
					target,
					specifier.getName(),
					moduleResolution,
					project,
					moduleCache,
					visited,
					depth + 1,
				);
				if (result) {
					return result;
				}
			}
			continue;
		}
		// `export { X as Y }` without a specifier — bound in this file,
		// usually imported; follow the binding, falling back to a local
		// declaration.
		for (const specifier of namedExports) {
			if (
				(specifier.getAliasNode()?.getText() ?? specifier.getName()) !==
				exportName
			) {
				continue;
			}
			const originalName = specifier.getName();
			for (const importDeclaration of file.getImportDeclarations()) {
				for (const namedImport of importDeclaration.getNamedImports()) {
					if (
						(namedImport.getAliasNode()?.getText() ?? namedImport.getName()) !==
						originalName
					) {
						continue;
					}
					const target = resolveModuleFilePath(
						moduleFilePath,
						importDeclaration.getModuleSpecifierValue(),
						moduleResolution,
						moduleCache,
					);
					if (!target || isNodeModulesFilePath(target)) {
						continue;
					}
					const result = resolveNamedExport(
						target,
						namedImport.getName(),
						moduleResolution,
						project,
						moduleCache,
						visited,
						depth + 1,
					);
					if (result) {
						return result;
					}
				}
			}
			const local = findLocalComponentDeclaration(file, originalName);
			if (local) {
				return { file, node: local };
			}
		}
	}
	return null;
};

/**
 * Resolves a component reference tag to the definition that renders it, or
 * null when the reference cannot be resolved to a statically walkable body —
 * the walk treats null as unverifiable (fail loud). Same local-name/import
 * precedence as the drawer machinery: a same-named local declaration
 * shadows every import, and a member-expression base that is locally
 * declared is a boundary (its member is not statically decidable).
 */
const resolveComponentDefinition = (
	sourceFile: SourceFile,
	tagText: string,
	moduleResolution: ModuleResolution,
	project: Project,
	moduleCache: Map<string, string | null>,
	declaredNamesByFile: Map<string, Set<string>>,
): DrawerSectionDefinition | null => {
	const namespaceMatch = tagText.match(
		/^([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)$/,
	);
	if (namespaceMatch) {
		const baseName = namespaceMatch[1];
		const memberName = namespaceMatch[2];
		if (isLocallyDeclared(sourceFile, baseName, declaredNamesByFile)) {
			return null;
		}
		let moduleSpecifier = resolveNamespaceImport(sourceFile, baseName);
		if (!moduleSpecifier) {
			// A member-expression base that is a NAMED binding: the base is a
			// namespace re-export of some module (`export * as Sections from
			// './sections'` in a barrel, `import { Sections }` here).
			for (const declaration of sourceFile.getImportDeclarations()) {
				for (const namedImport of declaration.getNamedImports()) {
					const localName =
						namedImport.getAliasNode()?.getText() ?? namedImport.getName();
					if (localName !== baseName) {
						continue;
					}
					moduleSpecifier = declaration.getModuleSpecifierValue();
				}
			}
			if (!moduleSpecifier) {
				return null;
			}
			const barrelPath = resolveModuleFilePath(
				sourceFile.getFilePath(),
				moduleSpecifier,
				moduleResolution,
				moduleCache,
			);
			if (!barrelPath || isNodeModulesFilePath(barrelPath)) {
				return null;
			}
			const barrelFile = project.addSourceFileAtPath(barrelPath);
			for (const exportDeclaration of barrelFile.getExportDeclarations()) {
				const namespaceExport = exportDeclaration.getNamespaceExport();
				const specifierValue = exportDeclaration.getModuleSpecifierValue();
				if (namespaceExport?.getText() === baseName && specifierValue) {
					const target = resolveModuleFilePath(
						barrelPath,
						specifierValue,
						moduleResolution,
						moduleCache,
					);
					if (!target || isNodeModulesFilePath(target)) {
						return null;
					}
					const result = resolveNamedExport(
						target,
						memberName,
						moduleResolution,
						project,
						moduleCache,
						new Set(),
						0,
					);
					if (!result) {
						return null;
					}
					const body = extractComponentBody(result.node);
					return body ? { body, file: result.file } : null;
				}
			}
			return null;
		}
		const modulePath = resolveModuleFilePath(
			sourceFile.getFilePath(),
			moduleSpecifier,
			moduleResolution,
			moduleCache,
		);
		if (!modulePath || isNodeModulesFilePath(modulePath)) {
			return null;
		}
		const result = resolveNamedExport(
			modulePath,
			memberName,
			moduleResolution,
			project,
			moduleCache,
			new Set(),
			0,
		);
		if (!result) {
			return null;
		}
		const body = extractComponentBody(result.node);
		return body ? { body, file: result.file } : null;
	}

	if (isLocallyDeclared(sourceFile, tagText, declaredNamesByFile)) {
		const declaration = findLocalComponentDeclaration(sourceFile, tagText);
		if (!declaration) {
			return null;
		}
		const body = extractComponentBody(declaration);
		return body ? { body, file: sourceFile } : null;
	}
	for (const declaration of sourceFile.getImportDeclarations()) {
		// Round 28's BLOCKER 3: a DEFAULT import is a normal in-repo component
		// arrangement — `import CrossFileKitDrawer from './child'` against a
		// child that does `export default CrossFileKitDrawer`. The import loop
		// used to read only named imports, so the default-imported
		// component's definition never resolved and the anchor edge across
		// the pair silently disappeared. The default name resolves through
		// the same machinery as every other export, including the
		// `export default <local binding>` indirection.
		const defaultImport = declaration.getDefaultImport();
		if (defaultImport && defaultImport.getText() === tagText) {
			const modulePath = resolveModuleFilePath(
				sourceFile.getFilePath(),
				declaration.getModuleSpecifierValue(),
				moduleResolution,
				moduleCache,
			);
			if (!modulePath || isNodeModulesFilePath(modulePath)) {
				return null;
			}
			const result = resolveNamedExport(
				modulePath,
				'default',
				moduleResolution,
				project,
				moduleCache,
				new Set(),
				0,
			);
			if (!result) {
				return null;
			}
			const body = extractComponentBody(result.node);
			return body ? { body, file: result.file } : null;
		}
		for (const namedImport of declaration.getNamedImports()) {
			const localName =
				namedImport.getAliasNode()?.getText() ?? namedImport.getName();
			if (localName !== tagText) {
				continue;
			}
			const modulePath = resolveModuleFilePath(
				sourceFile.getFilePath(),
				declaration.getModuleSpecifierValue(),
				moduleResolution,
				moduleCache,
			);
			if (!modulePath || isNodeModulesFilePath(modulePath)) {
				return null;
			}
			const result = resolveNamedExport(
				modulePath,
				namedImport.getName(),
				moduleResolution,
				project,
				moduleCache,
				new Set(),
				0,
			);
			if (!result) {
				return null;
			}
			const body = extractComponentBody(result.node);
			return body ? { body, file: result.file } : null;
		}
	}
	return null;
};

const resolveComponentDefinitionCached = (
	sourceFile: SourceFile,
	tagText: string,
	context: WalkContext,
): DrawerSectionDefinition | null => {
	// Round 28: the definition cache is module-scoped (see
	// sharedDefinitionCache) — the per-scan cache paid the full lookup on
	// every one of the suite's scans once the three-valued anchor probe made
	// the lookup the ordinary case.
	const filePath = sourceFile.getFilePath();
	let byName = sharedDefinitionCache.get(filePath);
	if (!byName) {
		byName = new Map<string, DrawerSectionDefinition | null>();
		sharedDefinitionCache.set(filePath, byName);
	}
	if (!byName.has(tagText)) {
		byName.set(
			tagText,
			resolveComponentDefinition(
				sourceFile,
				tagText,
				context.moduleResolution,
				context.project,
				context.moduleCache,
				context.declaredNamesByFile,
			),
		);
	}
	return byName.get(tagText) ?? null;
};

const isBareChildrenMarker = (node: Node): boolean => {
	if (node.getKind() !== SyntaxKind.JsxExpression) {
		return false;
	}
	const expression = (node as JsxExpression).getExpression();
	if (!expression) {
		return false;
	}
	const text = expression.getText().trim();
	return (
		text === 'children' ||
		text === 'props.children' ||
		text === 'this.props.children' ||
		/^[A-Za-z_$][\w$]*\.children$/.test(text)
	);
};

const expressionContainsJsx = (node: Node): boolean =>
	node.getDescendantsOfKind(SyntaxKind.JsxOpeningElement).length > 0 ||
	node.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement).length > 0;

const walkBareExpression = (
	node: Node,
	chain: Array<JsxOpeningElement | JsxSelfClosingElement>,
	inDefinition: boolean,
	insideDrawerModuleElement: boolean,
	refChildren: PendingRefChildren | null,
	context: WalkContext,
	state: WalkState,
): void => {
	// A children passthrough inside a DEFINITION hands the reference's own
	// JSX children to this position — the walk continues with them at the
	// chain accumulated so far. A div passthrough reddens the parts; a
	// fragment passthrough is transparent.
	if (inDefinition) {
		if (isBareChildrenMarker(node) && refChildren) {
			for (const child of refChildren.nodes) {
				walkNode(
					child,
					chain,
					false,
					false,
					null,
					refChildren.file,
					context,
					state,
				);
			}
		}
		return;
	}
	// Anchored (real call-site) subtree.
	if (insideDrawerModuleElement) {
		// The drawer module's own elements own their children placement; the
		// render half pins their composition.
		return;
	}
	if (chain.length === 0 || isBareChildrenMarker(node)) {
		// A direct child of the surface or the form that is not statically
		// decidable — or a children passthrough anywhere in the anchored
		// subtree — cannot be verified, and unverifiable must not be green.
		state.unverifiable = true;
		return;
	}
	// A benign bare expression inside an element: it cannot itself produce a
	// drawer part.
};

const walkNode = (
	node: Node,
	chain: Array<JsxOpeningElement | JsxSelfClosingElement>,
	inDefinition: boolean,
	insideDrawerModuleElement: boolean,
	refChildren: PendingRefChildren | null,
	sourceFile: SourceFile,
	context: WalkContext,
	state: WalkState,
): void => {
	const kind = node.getKind();
	if (kind === SyntaxKind.JsxElement) {
		const element = node as JsxElement;
		walkTag(
			element.getOpeningElement(),
			element.getJsxChildren(),
			chain,
			inDefinition,
			insideDrawerModuleElement,
			refChildren,
			sourceFile,
			context,
			state,
		);
		return;
	}
	if (kind === SyntaxKind.JsxSelfClosingElement) {
		walkTag(
			node as JsxSelfClosingElement,
			null,
			chain,
			inDefinition,
			insideDrawerModuleElement,
			refChildren,
			sourceFile,
			context,
			state,
		);
		return;
	}
	if (kind === SyntaxKind.JsxFragment) {
		for (const child of (node as JsxFragment).getJsxChildren()) {
			walkNode(
				child,
				chain,
				inDefinition,
				insideDrawerModuleElement,
				refChildren,
				sourceFile,
				context,
				state,
			);
		}
		return;
	}
	if (kind === SyntaxKind.JsxExpression) {
		const expression = (node as JsxExpression).getExpression();
		if (!expression) {
			return;
		}
		const expressionKind = expression.getKind();
		if (
			expressionKind === SyntaxKind.JsxElement ||
			expressionKind === SyntaxKind.JsxSelfClosingElement ||
			expressionKind === SyntaxKind.JsxFragment
		) {
			walkNode(
				expression,
				chain,
				inDefinition,
				insideDrawerModuleElement,
				refChildren,
				sourceFile,
				context,
				state,
			);
			return;
		}
		if (!expressionContainsJsx(expression)) {
			walkBareExpression(
				node,
				chain,
				inDefinition,
				insideDrawerModuleElement,
				refChildren,
				context,
				state,
			);
			return;
		}
		for (const child of expression.getChildren()) {
			walkNode(
				child,
				chain,
				inDefinition,
				insideDrawerModuleElement,
				refChildren,
				sourceFile,
				context,
				state,
			);
		}
		return;
	}
	if (isTransparentExpression(node)) {
		for (const child of node.getChildren()) {
			walkNode(
				child,
				chain,
				inDefinition,
				insideDrawerModuleElement,
				refChildren,
				sourceFile,
				context,
				state,
			);
		}
	}
};

const walkTag = (
	opening: JsxOpeningElement | JsxSelfClosingElement,
	jsxChildren: readonly Node[] | null,
	chain: Array<JsxOpeningElement | JsxSelfClosingElement>,
	inDefinition: boolean,
	insideDrawerModuleElement: boolean,
	refChildren: PendingRefChildren | null,
	sourceFile: SourceFile,
	context: WalkContext,
	state: WalkState,
): void => {
	const tagText = opening.getTagNameNode().getText();
	const drawerName = context.drawerTagName(opening.getTagNameNode());

	if (drawerName === UNVERIFIABLE_TAG) {
		// A locally-declared binding that cannot be classified statically
		// (a call, a mixed conditional, a reassigned `let`, ...) is exactly
		// the shape that could be hiding a drawer marker — fail loud
		// instead of descending with it as a plain element.
		state.unverifiable = true;
		return;
	}

	if (drawerName === 'DrawerBody' || drawerName === 'DrawerFooter') {
		state.parts.push({ node: opening, chain });
		return;
	}
	if (drawerName === 'DrawerForm') {
		state.forms.push({ node: opening, chain });
		return;
	}
	if (drawerName === 'DrawerContent') {
		// A nested surface — its own anchor walk judges it, and parts inside
		// it belong to that surface, not to this one.
		return;
	}
	if (drawerName !== null) {
		// Another drawer-module export (Drawer, DrawerHeader, DrawerTitle,
		// ...) — a real element. A part nested inside one is a violation, so
		// descend with it on the chain; bare expressions inside it are the
		// drawer module's own composition, pinned by the render half.
		if (jsxChildren) {
			for (const child of jsxChildren) {
				walkNode(
					child,
					[...chain, opening],
					inDefinition,
					true,
					refChildren,
					sourceFile,
					context,
					state,
				);
			}
		}
		return;
	}
	if (
		isNodelessReactWrapper(opening, sourceFile) ||
		(/^[a-z]/.test(tagText) && isBoxlessWrapperElement(opening))
	) {
		// Fragment/Suspense/StrictMode imported from react, or an intrinsic
		// element with a statically `display: contents` class/style (round
		// 21's IMPORTANT 4 — a component reference is NOT eligible here,
		// since what it renders is not decided by its own `className`) —
		// neither generates a DOM node of its own, so the walk passes
		// through without a chain element.
		if (jsxChildren) {
			for (const child of jsxChildren) {
				walkNode(
					child,
					chain,
					inDefinition,
					insideDrawerModuleElement,
					refChildren,
					sourceFile,
					context,
					state,
				);
			}
		}
		return;
	}
	if (/^[a-z]/.test(tagText)) {
		// An intrinsic element — a real node; descend with it on the chain.
		if (jsxChildren) {
			for (const child of jsxChildren) {
				walkNode(
					child,
					[...chain, opening],
					inDefinition,
					false,
					refChildren,
					sourceFile,
					context,
					state,
				);
			}
		}
		return;
	}

	// A component reference — follow the definition chain to the parts and
	// forms it ultimately produces (round 11's IMPORTANT 1 + 2). The
	// reference itself creates no node: the definition's roots continue the
	// current chain, and the reference's own JSX children are handed to its
	// `{children}` passthrough positions.
	const definition = resolveComponentDefinitionCached(
		sourceFile,
		tagText,
		context,
	);
	if (!definition) {
		state.unverifiable = true;
		return;
	}
	const pendingChildren: PendingRefChildren | null =
		jsxChildren && jsxChildren.length > 0
			? { nodes: jsxChildren, file: sourceFile }
			: null;
	for (const root of definition.body) {
		walkNode(
			root,
			chain,
			true,
			false,
			pendingChildren,
			definition.file,
			context,
			state,
		);
	}
};

const scanDrawerSurfaces = () => {
	const project = getScanProject();
	// The project is loaded once (round 16 — see getScanProject) and the
	// scan only refreshes files whose CONTENT changed: a fixture rewritten
	// between scans is re-read from disk (round 11's MINOR 5), a rewrite
	// with identical content is not, and deleted fixtures simply fall out of
	// the desired set without being torn down (torn-down files would rebuild
	// the shared TypeScript checker). Only the current on-disk file set is
	// iterated below.
	const desiredFilePaths = new Set([
		...allScannableFilePaths().filter(
			(filePath) => !filePath.startsWith(FIXTURE_TMP_DIR),
		),
		...walkCurrentFixtureFiles(),
	]);
	refreshChangedSourceFiles(project, desiredFilePaths);
	const moduleResolution: ModuleResolution = {
		compilerOptions: project.getCompilerOptions(),
		host: project.getModuleResolutionHost(),
	};

	// Per-tag-node memo of the resolution result, so the symbol resolution
	// runs once per tag-name NODE instead of once per tag — and so two
	// same-text tags in different scopes get their own verdicts (round
	// 17's BLOCKER 2: a text-keyed cache applied the first node's answer
	// to every same-text node in the file). ts-morph nodes are stable for
	// the duration of a scan — files only refresh on content change, before
	// the per-file loop — so a WeakMap keyed on the node object is sound.
	// A scan-wide memo of resolved (file, specifier) pairs for the module
	// resolution the definition walk needs.
	const tagNameResultCache = new WeakMap<Node, DrawerTagNameResult>();
	const moduleCache = new Map<string, string | null>();
	const declaredNamesByFile = new Map<string, Set<string>>();
	const reassignedNamesByFile = new Map<string, Set<string>>();
	const drawerTagName = (tagNameNode: Node): DrawerTagNameResult => {
		const cached = tagNameResultCache.get(tagNameNode);
		if (cached !== undefined) {
			return cached;
		}
		const result = resolveDrawerTagName(
			tagNameNode,
			project,
			reassignedNamesByFile,
		);
		tagNameResultCache.set(tagNameNode, result);
		return result;
	};

	const discovered: string[] = [];
	const violations: string[] = [];
	const formBearing: string[] = [];

	// Round 26's BLOCKER 2: the UNVERIFIABLE surface must not depend on the
	// opaque tags and the drawer imports living in the SAME file. The pass
	// graph below walks the module graph so a file with unresolved drawer-shaped
	// tags is a candidate regardless of where the imports live, and a file that
	// passes drawer exports into another component is the anchor.
	const passGraph = buildDrawerPassGraph(
		desiredFilePaths,
		project,
		moduleResolution,
		moduleCache,
		declaredNamesByFile,
		reassignedNamesByFile,
		drawerTagName,
	);

	for (const filePath of desiredFilePaths) {
		const sourceFile = project.getSourceFile(filePath);
		if (!sourceFile || /\.(?:spec|test)\.tsx$/.test(path.basename(filePath))) {
			continue;
		}

		const jsxTags = [
			...sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
			...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
		];

		// Round 14, BLOCKER 1 + round 16: a tag whose binding cannot be
		// resolved statically (a call, a mixed conditional, a reassigned
		// `let`, ...) could be a drawer marker the walk keys its entry on —
		// in a drawer file it must fail loud instead of silently not being
		// an anchor. Round 15's IMPORTANT 3 closes the last silent gap: a
		// file with ONLY such tags that also imports the drawer module is a
		// drawer file with an opaque marker — it is discovered (and reddens)
		// too. A file with no drawer import at all carries no drawer signal,
		// so the inventory does not flood.
		const hasUnverifiableTag = jsxTags.some(
			(node) => drawerTagName(node.getTagNameNode()) === UNVERIFIABLE_TAG,
		);
		const importsDrawerModule = fileImportsDrawerModule(
			sourceFile,
			project,
			reassignedNamesByFile,
		);

		const wrapperOf = (node: JsxOpeningElement | JsxSelfClosingElement) =>
			findWrapperOpeningElement(node, sourceFile);

		const partNodes = jsxTags.filter((node) => {
			const tagText = node.getTagNameNode().getText();
			const name = drawerTagName(node.getTagNameNode());
			if (name === 'DrawerBody' || name === 'DrawerFooter') {
				return true;
			}
			// Fail-closed fallback for UNBOUND part names: a tag whose literal
			// text is `DrawerBody`/`DrawerFooter` and whose binding does NOT
			// resolve to the drawer module is still a part (round 6: the parts
			// are discovered by their tags, and the wrapper rule then judges
			// the file — e.g. a bare-name drawer is discovered and rejected).
			// The alias case is resolved above; this fallback only catches the
			// unimported/unresolvable spellings, which cannot hide the #990
			// shape because the wrapper check still runs on them.
			return tagText === 'DrawerBody' || tagText === 'DrawerFooter';
		});
		const formNodes = jsxTags.filter(
			(node) => drawerTagName(node.getTagNameNode()) === 'DrawerForm',
		);
		const surfaceNodes = jsxTags.filter(
			(node) => drawerTagName(node.getTagNameNode()) === 'DrawerContent',
		);

		// Round 12 — the anchored walk: every form/surface subtree this file
		// renders is resolved to what it actually renders (see the
		// drawer-section resolution block above). A definition-root
		// form/surface (the component's own root element) is a drawer call
		// site in the DOM sense — its children are the drawer geometry — so
		// it is anchored too; only the drawer module itself is excluded,
		// because its internal composition is the artifact the render half
		// and the Playwright spec pin. An opening tag's parent is its
		// JsxElement, which carries the children the walk starts from.
		const anchorElements: JsxElement[] = [];
		if (sourceFile.getFilePath() !== DRAWER_MODULE_PATH) {
			for (const node of [...formNodes, ...surfaceNodes]) {
				if (node.getKind() === SyntaxKind.JsxOpeningElement) {
					const element = node.getParent();
					if (element?.getKind() === SyntaxKind.JsxElement) {
						anchorElements.push(element as JsxElement);
					}
				}
			}
		}
		const walkState: WalkState = {
			parts: [],
			forms: [],
			unverifiable: false,
		};
		if (anchorElements.length > 0) {
			const walkContext: WalkContext = {
				moduleResolution,
				project,
				moduleCache,
				declaredNamesByFile,
				reassignedNamesByFile,
				drawerTagName,
			};
			for (const anchor of anchorElements) {
				for (const child of anchor.getJsxChildren()) {
					walkNode(
						child,
						[],
						false,
						false,
						null,
						sourceFile,
						walkContext,
						walkState,
					);
				}
			}
		}

		// The walk is authoritative inside anchored subtrees (it sees through
		// the same DOM-faithful transparency as the wrapper walk AND through
		// component references, which the in-file walk cannot); the legacy
		// call-site judgment below applies only to parts/forms OUTSIDE them —
		// a bare/unresolvable wrapper (no anchors), or a definition-root
		// surface whose own children the in-file wrapper walk already judges.
		const anchorOpeningTags = new Set(
			anchorElements.map((element) => element.getOpeningElement()),
		);
		const isInsideAnchoredSubtree = (
			node: JsxOpeningElement | JsxSelfClosingElement,
		): boolean => {
			let current: Node | undefined = node.getParent();
			while (current) {
				if (current.getKind() === SyntaxKind.JsxElement) {
					if (
						anchorOpeningTags.has((current as JsxElement).getOpeningElement())
					) {
						return true;
					}
				}
				current = current.getParent();
			}
			return false;
		};
		const callSiteFormNodes = formNodes.filter(
			(node) => wrapperOf(node) !== null && !isInsideAnchoredSubtree(node),
		);
		// formBearing is what the header has always claimed: a file that
		// renders a resolved `DrawerForm` tag anywhere, or whose anchored walk
		// found a form behind a component reference (round 11's IMPORTANT 1).
		if (formNodes.length > 0 || walkState.forms.length > 0) {
			formBearing.push(toPortableSourcePath(sourceFile.getFilePath()));
		}
		const formLinkBroken = callSiteFormNodes.some((node) => {
			const wrapper = wrapperOf(node);
			if (!wrapper) {
				return true;
			}
			return (
				resolveTagBinding(
					wrapper.getTagNameNode(),
					project,
					reassignedNamesByFile,
				) !== 'drawer-content'
			);
		});
		const callSitePartNodes = partNodes.filter(
			(node) => wrapperOf(node) !== null && !isInsideAnchoredSubtree(node),
		);

		const walkPartBroken = walkState.parts.some(
			(occurrence) => occurrence.chain.length > 0,
		);
		const walkFormBroken = walkState.forms.some(
			(occurrence) => occurrence.chain.length > 0,
		);

		// Round 15's IMPORTANT 3: a drawer-importing file whose ONLY drawer
		// signal is an opaque marker is discovered and reddened instead of
		// being silently green — the discriminator (the drawer-module import)
		// is what the no-signal file lacks, so the inventory does not flood.
		// Round 26's BLOCKER 2: the discriminator is no longer required to live
		// in the SAME file. A file whose opaque tags are anchored by the module
		// graph (another file passes drawer exports into a component it
		// defines, directly or transitively) is a candidate too — "fail closed
		// on the pair, not on a single file's coincidence". And a file that
		// PASSES drawer exports into a file with unverifiable tags is itself
		// an unverified drawer construction. The no-signal flood guard holds:
		// a file with unverifiable tags and no anchor anywhere still carries no
		// drawer signal and stays out.
		const portablePath = toPortableSourcePath(sourceFile.getFilePath());
		const drawerAnchoredFromGraph =
			passGraph.anchoredReceivers.has(portablePath);
		const unresolvedAnchored =
			passGraph.unresolvedAnchoredReceivers.has(portablePath);
		const pairAnchor = passGraph.pairAnchors.has(portablePath);
		if (
			anchorElements.length === 0 &&
			callSitePartNodes.length === 0 &&
			callSiteFormNodes.length === 0 &&
			!(importsDrawerModule && hasUnverifiableTag) &&
			!(drawerAnchoredFromGraph && hasUnverifiableTag) &&
			// Round 28's BLOCKER 2: a receiver whose chain carries an
			// UNRESOLVED edge from an anchored passer cannot be cleared by
			// the guard — it surfaces like any other unverifiable file
			// instead of both halves of the pair falling out of discovery.
			!unresolvedAnchored &&
			!pairAnchor
		) {
			continue;
		}

		discovered.push(toPortableSourcePath(sourceFile.getFilePath()));

		const isRejected = callSitePartNodes.some((node) => {
			const wrapper = wrapperOf(node);
			if (!wrapper) {
				return true;
			}
			const binding = resolveTagBinding(
				wrapper.getTagNameNode(),
				project,
				reassignedNamesByFile,
			);
			return binding !== 'drawer-form' && binding !== 'drawer-content';
		});

		if (
			isRejected ||
			formLinkBroken ||
			walkState.unverifiable ||
			hasUnverifiableTag ||
			unresolvedAnchored ||
			pairAnchor ||
			walkPartBroken ||
			walkFormBroken
		) {
			violations.push(toPortableSourcePath(sourceFile.getFilePath()));
		}
	}

	return {
		discovered: discovered.sort(),
		violations: violations.sort(),
		formBearing: formBearing.sort(),
	};
};

const renderDrawerByCallSiteId = {
	'profile-create': () => {
		// ProfileFormDrawer receives its RHF instance from its host page, so
		// the guard mounts it through a minimal owner component mirroring
		// that contract instead of rendering it bare.
		const ProfileCreateGuardHarness = () => {
			const methods = useForm<ProfileFormValues>({
				defaultValues: getProfileFormValues(),
			});

			return (
				<ProfileFormDrawer
					tenantId="tenant-1"
					isOpen
					onOpenChange={noop}
					onSaved={noop}
					onSessionExpired={noop}
					methods={methods}
				/>
			);
		};

		render(<ProfileCreateGuardHarness />);
	},
	'profile-edit': () => {
		render(
			<ProfileEditDetailsDrawer
				tenantId="tenant-1"
				isOpen
				profile={{
					id: 'profile-1',
					name: 'Author',
					description: 'Draft posts',
					icon: null,
					tone: null,
				}}
				onOpenChange={noop}
				onSaved={noop}
				onSessionExpired={noop}
			/>,
		);
	},
	'tenant-user-invite': () => {
		render(
			<InviteTenantUserDrawer
				tenantId="tenant-1"
				isOpen
				onOpenChange={noop}
				onInvited={noop}
				onSessionExpired={noop}
			/>,
		);
	},
	'staff-user-email-change': () => {
		render(
			<ChangeStaffUserEmailDialog
				userId="user-1"
				currentEmail="rui@latticecloud.com"
				isOpen
				onOpenChange={noop}
				onUpdated={noop}
				onSessionExpired={noop}
			/>,
		);
	},
	'tenant-post-create': () => {
		render(<CreatePostDrawer open onOpenChange={noop} tenantId="tenant-1" />);
	},
	'tenant-user-link-companies': () => {
		render(
			<LinkCompaniesDrawerHost userId="user-1" isOpen onOpenChange={noop} />,
		);
	},
	'staff-profile-edit': () => {
		render(
			<StaffProfileEditDetailsDrawer
				isOpen
				profile={{
					id: 'profile-1',
					name: 'Author',
					description: 'Draft posts',
					icon: null,
					tone: null,
				}}
				onOpenChange={noop}
				onSaved={noop}
				onSessionExpired={noop}
			/>,
		);
	},
	'bluesky-connect': () => {
		render(
			<BlueskyConnectDrawer
				mode="connect"
				open
				tenantId="tenant-1"
				onOpenChange={noop}
			/>,
		);
	},
} satisfies Record<DrawerFormCallSiteId, () => void>;

const expectDrawerFormChain = (testId: string): void => {
	const surface = screen.getByTestId(testId);
	expect(surface.className).toContain('publy-drawer');

	const form = surface.querySelector('form.publy-drawer-form');
	expect(form).not.toBeNull();
	expect(form?.parentElement).toBe(surface);
	expect(form?.className).toContain('space-y-4');

	const body = surface.querySelector('[data-slot="drawer-body"]');
	const footer = surface.querySelector('[data-slot="drawer-footer"]');
	expect(body).not.toBeNull();
	expect(footer).not.toBeNull();
	expect(body?.parentElement).toBe(form);
	expect(footer?.parentElement).toBe(form);
};

const SpacingReferenceForm = () => {
	const methods = useForm<{ probe: string }>();

	return (
		<Form
			methods={methods}
			slotProps={{ form: { className: 'spacing-reference' } }}
		>
			probe
		</Form>
	);
};

// Round 21's IMPORTANT 3: the CSS geometry guard used to assume the LAST
// source rule matching `.publy-drawer-form` always wins the cascade — false
// whenever an EARLIER rule has higher specificity (`.publy-drawer
// .publy-drawer-form` beats a bare `.publy-drawer-form` regardless of which
// one is declared later). A standard (id, class/attribute/pseudo-class,
// type/pseudo-element) specificity triple, compared component-by-component
// with source order as the tie-break, answers the real cascade question
// instead of the ordering one. `app.css`'s drawer selectors are plain
// compound selectors (classes, one attribute selector, no nesting
// functions), so a flat per-token count is sufficient; `:where(...)`  is the
// one pseudo-class the CSS spec defines as contributing zero, so it is
// excluded explicitly rather than counted like every other pseudo-class.
type SelectorSpecificity = readonly [number, number, number];

const computeSelectorSpecificity = (selector: string): SelectorSpecificity => {
	let idCount = 0;
	let classCount = 0;
	let typeCount = 0;
	let working = selector;

	working = working.replace(/\[[^\]]*\]/g, () => {
		classCount += 1;
		return ' ';
	});
	working = working.replace(/#[-\w]+/g, () => {
		idCount += 1;
		return ' ';
	});
	working = working.replace(
		/::[-\w]+|:(?:before|after|first-line|first-letter)\b/gi,
		() => {
			typeCount += 1;
			return ' ';
		},
	);
	working = working.replace(/:where\([^)]*\)/gi, ' ');
	working = working.replace(/:(?!:)[-\w]+(?:\([^)]*\))?/g, () => {
		classCount += 1;
		return ' ';
	});
	working = working.replace(/\.[-\w]+/g, () => {
		classCount += 1;
		return ' ';
	});
	typeCount += (working.match(/[A-Za-z][-\w]*/g) ?? []).length;

	return [idCount, classCount, typeCount];
};

const compareSelectorSpecificity = (
	a: SelectorSpecificity,
	b: SelectorSpecificity,
): number => {
	for (let index = 0; index < a.length; index += 1) {
		if (a[index] !== b[index]) {
			return a[index] - b[index];
		}
	}
	return 0;
};

// A rule nested in `@media`/`@supports` only applies within its own
// condition — whether it beats the unconditional cascade winner at a given
// viewport is not decidable from source alone. Rather than leave that
// implied, the geometry guard below ranks only the unconditional selectors
// and the e2e spec (`e2e/drawer-form-scroll-geometry.spec.ts`) is the one
// that closes the conditional side, by actually sampling a viewport inside
// every `min-width`/`max-width` range app.css declares for the drawer.
const isNestedInConditionalAtRule = (rule: Rule): boolean => {
	let current: AnyNode | undefined = rule.parent as AnyNode | undefined;
	while (current && current.type !== 'root' && current.type !== 'document') {
		if (
			current.type === 'atrule' &&
			(current.name === 'media' || current.name === 'supports')
		) {
			return true;
		}
		current = current.parent as AnyNode | undefined;
	}
	return false;
};

// The declarations that restore the broken #990 geometry when a conditional
// rule overrides the form — the flex/layout properties the unconditional
// `.publy-drawer-form` rule owns. A conditional rule that sets any of these on
// the drawer form is a geometry override the source lane cannot resolve (it
// only applies inside its own viewport condition), so it must be reported.
const DRAWER_FORM_GEOMETRY_PROPERTIES = new Set([
	'display',
	'flex',
	'flex-direction',
	'min-height',
	'overflow',
	'overflow-x',
	'overflow-y',
]);

// Round 26's IMPORTANT 4 — the `@apply` branch must compare LIKE WITH LIKE.
// `@apply block` is Tailwind's UTILITY grammar (it sets `display: block`), so
// testing the token against the CSS PROPERTY set made `block` invisible. The
// maps below resolve a utility token to the CSS properties it actually sets;
// the caller then compares properties against properties.
// TAILWIND_DISPLAY_UTILITIES (the canonical display list above) is shared
// with the class-list recognizer — round 28's IMPORTANT 5 — so the two can
// never disagree about which utilities establish or restore a box; the
// direction/shorthand sets and the prefixes are the complete
// geometry-relevant Tailwind grammar.
const TAILWIND_FLEX_DIRECTION_UTILITIES = new Set([
	'flex-row',
	'flex-row-reverse',
	'flex-col',
	'flex-col-reverse',
]);
const TAILWIND_FLEX_SHORTHAND_UTILITIES = new Set([
	'flex-1',
	'flex-auto',
	'flex-initial',
	'flex-none',
]);
// These would false-positive through the `flex-`/`overflow-` prefixes below,
// so they are resolved explicitly as non-geometry first.
const TAILWIND_NON_GEOMETRY_FLEX_TOKENS = new Set([
	'flex-wrap',
	'flex-nowrap',
	'flex-wrap-reverse',
]);
const TAILWIND_NON_GEOMETRY_OVERFLOW_TOKENS = new Set([
	'overflow-wrap-normal',
	'overflow-wrap-break-word',
	'overflow-wrap-anywhere',
	'overflow-ellipsis',
]);
const TAILWIND_GEOMETRY_PREFIXES: ReadonlyArray<{
	prefix: string;
	property: string;
}> = [
	{ prefix: 'min-h-', property: 'min-height' },
	{ prefix: 'overflow-x-', property: 'overflow' },
	{ prefix: 'overflow-y-', property: 'overflow' },
	{ prefix: 'overflow-', property: 'overflow' },
	{ prefix: 'basis-', property: 'flex' },
	{ prefix: 'grow-', property: 'flex' },
	{ prefix: 'shrink-', property: 'flex' },
	{ prefix: 'flex-', property: 'flex' },
];

/**
 * Strips the outermost variant chain (`md:block` → `block`,
 * `min-[1100px]:[display:block]` → `[display:block]`). Bracket-aware: a `:`
 * inside an arbitrary-value bracket is not a variant separator.
 */
const stripTailwindVariants = (token: string): string => {
	let lastSeparator = -1;
	let bracketDepth = 0;
	for (let index = 0; index < token.length; index += 1) {
		const char = token[index];
		if (char === '[') {
			bracketDepth += 1;
		} else if (char === ']') {
			bracketDepth -= 1;
		} else if (char === ':' && bracketDepth === 0) {
			lastSeparator = index;
		}
	}
	return lastSeparator === -1 ? token : token.slice(lastSeparator + 1);
};

/**
 * The CSS properties an `@apply` utility token sets — the resolved form the
 * caller compares against DRAWER_FORM_GEOMETRY_PROPERTIES (property against
 * property, never utility against property). Arbitrary values
 * (`[display:block]`) name their property directly. Round 28's IMPORTANT 6:
 * the result is THREE-VALUED like everything else in the guard. A token the
 * resolver knows resolves to its properties (possibly none — provably
 * non-geometry: an explicitly named non-geometry property in an arbitrary
 * value, the resolved `flex-wrap`/`overflow-wrap-*` tokens, or the padding/
 * margin families, whose Tailwind grammar is exactly these prefixes and sets
 * only padding/margin). A token the resolver does NOT know is
 * UNRESOLVED_APPLY_UTILITY — `sr-only` sets `overflow: hidden` (geometry),
 * and a repository `@utility` may set anything, so "cannot resolve" must
 * never read as "sets nothing relevant".
 */
const UNRESOLVED_APPLY_UTILITY = Symbol('drawer-apply-utility-unresolved');

// The Tailwind padding and margin grammar is exactly these prefixes, and
// each sets only padding/margin properties — none of which the drawer
// geometry owns — so a token under them is provably non-geometry.
const NON_GEOMETRY_SPACING_PREFIXES = [
	'p-',
	'px-',
	'py-',
	'ps-',
	'pe-',
	'pt-',
	'pr-',
	'pb-',
	'pl-',
	'm-',
	'mx-',
	'my-',
	'ms-',
	'me-',
	'mt-',
	'mr-',
	'mb-',
	'ml-',
];

const resolveApplyUtilityGeometryProperties = (
	token: string,
): ReadonlyArray<string> | typeof UNRESOLVED_APPLY_UTILITY => {
	const leaf = stripTailwindVariants(token).replace(/^!|!$/g, '');
	if (leaf.startsWith('[') && leaf.endsWith(']')) {
		// An arbitrary value names its property directly — exactly
		// resolvable: geometry if the property is geometry, provably
		// non-geometry otherwise.
		const inner = leaf.slice(1, -1);
		const property = inner.slice(0, inner.indexOf(':')).trim();
		return DRAWER_FORM_GEOMETRY_PROPERTIES.has(property) ? [property] : [];
	}
	if (TAILWIND_DISPLAY_UTILITIES.has(leaf)) {
		return ['display'];
	}
	if (TAILWIND_FLEX_DIRECTION_UTILITIES.has(leaf)) {
		return ['flex-direction'];
	}
	if (
		TAILWIND_FLEX_SHORTHAND_UTILITIES.has(leaf) ||
		leaf === 'grow' ||
		leaf === 'shrink'
	) {
		return ['flex'];
	}
	if (
		TAILWIND_NON_GEOMETRY_FLEX_TOKENS.has(leaf) ||
		TAILWIND_NON_GEOMETRY_OVERFLOW_TOKENS.has(leaf)
	) {
		return [];
	}
	for (const { prefix, property } of TAILWIND_GEOMETRY_PREFIXES) {
		if (leaf.startsWith(prefix)) {
			return [property];
		}
	}
	if (NON_GEOMETRY_SPACING_PREFIXES.some((prefix) => leaf.startsWith(prefix))) {
		return [];
	}
	return UNRESOLVED_APPLY_UTILITY;
};

/**
 * Round 24's IMPORTANT 4 — the conditional-CSS blind spot. The source guard
 * ranks only UNCONDITIONAL selectors (a conditional rule's win depends on the
 * real viewport, which is not decidable from source), and the browser lane
 * samples a finite list of widths — so a `@media (min-width: 1025px)` rule
 * that turns the drawer form back into a block escaped both lanes: the
 * source lane excluded it, and every sampled width was below 1025px. Adding a
 * width just moved the escape. This closes the hole BY CONSTRUCTION: any
 * conditional rule whose selector targets the drawer form and whose
 * declarations change its geometry is reported as a violation, regardless of
 * which widths the browser lane samples. A human cannot add a width piecemeal
 * to chase a rule they did not even know was there.
 */
const findConditionalDrawerFormGeometryRules = (
	cssSource: string,
): Array<{ atRule: string; selector: string }> => {
	const root = postcss.parse(cssSource);
	const found: Array<{ atRule: string; selector: string }> = [];
	root.walkAtRules((atRule) => {
		if (atRule.name !== 'media' && atRule.name !== 'supports') {
			return;
		}
		atRule.walkRules((rule) => {
			if (!isNestedInConditionalAtRule(rule)) {
				return;
			}
			const targetsForm = (rule.selectors ?? []).some((selector) =>
				selector.includes('.publy-drawer-form'),
			);
			if (!targetsForm) {
				return;
			}
			const changesGeometry = (rule.nodes ?? []).some((node) => {
				if (node.type === 'decl') {
					return DRAWER_FORM_GEOMETRY_PROPERTIES.has(node.prop);
				}
				if (node.type === 'atrule' && node.name === 'apply') {
					// Round 26's IMPORTANT 4: `@apply block` sets `display:
					// block` through the TAILWIND utility grammar, so the token
					// must be resolved to the CSS property it sets before the
					// comparison — never compared as a utility against the
					// property set. Resolved against resolved is "like with
					// like"; `block` and `p-4` can no longer be confused.
					// Round 28's IMPORTANT 6: a token the resolver cannot
					// resolve (`sr-only` sets `overflow: hidden`, a repo
					// `@utility` may set anything) is a REPORT, never a
					// clearance — unresolved is unknown, not harmless.
					const params = (node.params ?? '').trim().split(/\s+/);
					return params.some((token) => {
						const resolved = resolveApplyUtilityGeometryProperties(token);
						if (resolved === UNRESOLVED_APPLY_UTILITY) {
							return true;
						}
						return resolved.some((property) =>
							DRAWER_FORM_GEOMETRY_PROPERTIES.has(property),
						);
					});
				}
				return false;
			});
			if (!changesGeometry) {
				return;
			}
			for (const selector of rule.selectors ?? []) {
				if (selector.includes('.publy-drawer-form')) {
					found.push({
						atRule: `@${atRule.name} ${atRule.params}`,
						selector,
					});
				}
			}
		});
	});
	return found;
};

type MatchingSelector = {
	rule: Rule;
	selector: string;
	specificity: SelectorSpecificity;
	sourceIndex: number;
	conditional: boolean;
};

/**
 * The selector that wins the real CSS cascade among every UNCONDITIONAL
 * rule whose selector contains `targetFragment` — highest specificity,
 * source order as the tie-break. Returns `null` when no unconditional
 * selector matches at all (every match sits behind a conditional at-rule,
 * or nothing matches).
 */
const findCascadeWinningSelector = (
	cssSource: string,
	targetFragment: string,
): MatchingSelector | null => {
	const root = postcss.parse(cssSource);
	const matchingSelectors: MatchingSelector[] = [];
	root.walkRules((rule) => {
		for (const selector of rule.selectors ?? []) {
			if (!selector.includes(targetFragment)) {
				continue;
			}
			matchingSelectors.push({
				rule,
				selector,
				specificity: computeSelectorSpecificity(selector),
				sourceIndex: matchingSelectors.length,
				conditional: isNestedInConditionalAtRule(rule),
			});
		}
	});

	const unconditionalSelectors = matchingSelectors.filter(
		(entry) => !entry.conditional,
	);
	let winner: MatchingSelector | null = null;
	for (const candidate of unconditionalSelectors) {
		if (!winner) {
			winner = candidate;
			continue;
		}
		const comparison = compareSelectorSpecificity(
			candidate.specificity,
			winner.specificity,
		);
		if (
			comparison > 0 ||
			(comparison === 0 && candidate.sourceIndex > winner.sourceIndex)
		) {
			winner = candidate;
		}
	}
	return winner;
};

afterEach(cleanup);

// Round 11's IMPORTANT 3 — the fixture directory must be gone when the suite
// is done, on every exit path. The assertion proves the afterAll cleanup
// actually ran; the process 'exit' net and the SIGINT/SIGTERM handlers above
// cover crashes and cancellations (round 13's IMPORTANT 4).
afterAll(() => {
	rmSync(FIXTURE_TMP_DIR, { recursive: true, force: true });
	expect(existsSync(FIXTURE_TMP_DIR)).toBe(false);
	// The SIGTERM probe child removes its own directory; these are the
	// safety net for a probe that died before the signal arrived.
	for (const dir of signalProbeDirs) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe('drawer surface flex chain guard (#990)', () => {
	test('the scanner discovers a new drawer on disk by its DrawerBody + DrawerFooter tags', () => {
		writeFileSync(TEMPORARY_NEW_DRAWER_PATH, TEMPORARY_NEW_DRAWER_SOURCE);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(fixtureRel(TEMPORARY_NEW_DRAWER_FILE));
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_NEW_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_NEW_DRAWER_PATH);
		}
	});

	test('the scanner discovers an aliased import of the shared DrawerForm', () => {
		writeFileSync(
			TEMPORARY_ALIASED_DRAWER_PATH,
			TEMPORARY_ALIASED_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_ALIASED_DRAWER_FILE),
			);
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_ALIASED_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_ALIASED_DRAWER_PATH);
		}
	});

	test('the scanner discovers a DrawerForm imported through a re-export barrel', () => {
		writeFileSync(TEMPORARY_BARREL_PATH, TEMPORARY_BARREL_SOURCE);
		writeFileSync(
			TEMPORARY_BARREL_CALL_SITE_PATH,
			TEMPORARY_BARREL_CALL_SITE_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_BARREL_CALL_SITE_FILE),
			);
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_BARREL_CALL_SITE_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_BARREL_CALL_SITE_PATH);
			unlinkSync(TEMPORARY_BARREL_PATH);
		}
	});

	test('the scanner discovers drawer parts reached through a namespace import', () => {
		writeFileSync(
			TEMPORARY_NAMESPACE_DRAWER_PATH,
			TEMPORARY_NAMESPACE_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_NAMESPACE_DRAWER_FILE),
			);
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_NAMESPACE_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_NAMESPACE_DRAWER_PATH);
		}
	});

	test('a drawer wrapping DrawerBody + DrawerFooter in the plain Form is discovered and rejected', () => {
		writeFileSync(
			TEMPORARY_REGRESSED_DRAWER_PATH,
			TEMPORARY_REGRESSED_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_REGRESSED_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_REGRESSED_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_REGRESSED_DRAWER_PATH);
		}
	});

	test('a drawer wrapping ALIASED DrawerBody + DrawerFooter in the plain Form is discovered and rejected', () => {
		writeFileSync(
			TEMPORARY_ALIASED_PARTS_DRAWER_PATH,
			TEMPORARY_ALIASED_PARTS_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_ALIASED_PARTS_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_ALIASED_PARTS_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_ALIASED_PARTS_DRAWER_PATH);
		}
	});

	test('a drawer wrapping DrawerBody + DrawerFooter re-exported under aliases through a barrel is discovered and rejected', () => {
		writeFileSync(
			TEMPORARY_ALIASED_BARREL_PARTS_PATH,
			TEMPORARY_ALIASED_BARREL_PARTS_SOURCE,
		);
		writeFileSync(
			TEMPORARY_ALIASED_BARREL_PARTS_CALL_SITE_PATH,
			TEMPORARY_ALIASED_BARREL_PARTS_CALL_SITE_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_ALIASED_BARREL_PARTS_CALL_SITE_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_ALIASED_BARREL_PARTS_CALL_SITE_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_ALIASED_BARREL_PARTS_CALL_SITE_PATH);
			unlinkSync(TEMPORARY_ALIASED_BARREL_PARTS_PATH);
		}
	});

	test('a same-named local declaration is rejected even when it shadows a DrawerForm import', () => {
		writeFileSync(
			TEMPORARY_LOCAL_SHADOW_DRAWER_PATH,
			TEMPORARY_LOCAL_SHADOW_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_LOCAL_SHADOW_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_LOCAL_SHADOW_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_LOCAL_SHADOW_DRAWER_PATH);
		}
	});

	test('an aliased DrawerForm import that cannot be resolved is rejected, not guessed', () => {
		writeFileSync(
			TEMPORARY_UNRESOLVED_DRAWER_PATH,
			TEMPORARY_UNRESOLVED_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_UNRESOLVED_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_UNRESOLVED_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_UNRESOLVED_DRAWER_PATH);
		}
	});

	test('a wrapper that is neither imported nor declared anywhere is rejected', () => {
		writeFileSync(
			TEMPORARY_BARE_WRAPPER_DRAWER_PATH,
			TEMPORARY_BARE_WRAPPER_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_BARE_WRAPPER_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_BARE_WRAPPER_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_BARE_WRAPPER_DRAWER_PATH);
		}
	});

	test('a conditional body still counts as a direct child of the drawer form', () => {
		writeFileSync(
			TEMPORARY_CONDITIONAL_DRAWER_PATH,
			TEMPORARY_CONDITIONAL_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_CONDITIONAL_DRAWER_FILE),
			);
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_CONDITIONAL_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_CONDITIONAL_DRAWER_PATH);
		}
	});

	test('a drawer body under Suspense and a footer in an explicit Fragment are still direct children of the form', () => {
		writeFileSync(
			TEMPORARY_NODELESS_WRAPPERS_DRAWER_PATH,
			TEMPORARY_NODELESS_WRAPPERS_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_NODELESS_WRAPPERS_DRAWER_FILE),
			);
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_NODELESS_WRAPPERS_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_NODELESS_WRAPPERS_DRAWER_PATH);
		}
	});

	test('a fixture path rewritten between scans is scanned as its current content', () => {
		// Round 11's MINOR 5: the shared ts-morph project (35651a2c) never
		// re-reads a path it has parsed, so "correct passes, broken fails,
		// same temp path" silently scanned the first content twice. Round
		// 16's content-based freshness reconciliation must re-read the
		// rewritten fixture — and only the rewritten one: this test is the
		// single content change in the suite, so it is also the single
		// (intended) compiler-program rebuild.
		writeFileSync(TEMPORARY_NEW_DRAWER_PATH, TEMPORARY_NEW_DRAWER_SOURCE);
		try {
			const first = scanDrawerSurfaces();
			expect(first.discovered).toContain(fixtureRel(TEMPORARY_NEW_DRAWER_FILE));
			expect(first.violations).not.toContain(
				fixtureRel(TEMPORARY_NEW_DRAWER_FILE),
			);

			writeFileSync(
				TEMPORARY_NEW_DRAWER_PATH,
				TEMPORARY_REGRESSED_DRAWER_SOURCE,
			);
			const second = scanDrawerSurfaces();
			expect(second.discovered).toContain(
				fixtureRel(TEMPORARY_NEW_DRAWER_FILE),
			);
			expect(second.violations).toContain(
				fixtureRel(TEMPORARY_NEW_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_NEW_DRAWER_PATH);
		}
	});

	test('a composition helper that renders DrawerBody directly is a definition site, not a drawer call site', () => {
		writeFileSync(
			TEMPORARY_DEFINITION_HELPER_PATH,
			TEMPORARY_DEFINITION_HELPER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).not.toContain(
				fixtureRel(TEMPORARY_DEFINITION_HELPER_FILE),
			);
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_DEFINITION_HELPER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_DEFINITION_HELPER_PATH);
		}
	});

	test('a drawer part wrapped in an intermediate element is a structural violation', () => {
		writeFileSync(
			TEMPORARY_DIV_WRAPPED_PARTS_DRAWER_PATH,
			TEMPORARY_DIV_WRAPPED_PARTS_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_DIV_WRAPPED_PARTS_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_DIV_WRAPPED_PARTS_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_DIV_WRAPPED_PARTS_DRAWER_PATH);
		}
	});

	test('a footer-only drawer is discovered, pinning the DrawerFooter half of discovery', () => {
		writeFileSync(
			TEMPORARY_FOOTER_ONLY_DRAWER_PATH,
			TEMPORARY_FOOTER_ONLY_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_FOOTER_ONLY_DRAWER_FILE),
			);
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_FOOTER_ONLY_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_FOOTER_ONLY_DRAWER_PATH);
		}
	});

	test('a form sitting under an intermediate element inside the surface is a structural violation', () => {
		writeFileSync(
			TEMPORARY_DIV_ABOVE_FORM_DRAWER_PATH,
			TEMPORARY_DIV_ABOVE_FORM_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_DIV_ABOVE_FORM_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_DIV_ABOVE_FORM_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_DIV_ABOVE_FORM_DRAWER_PATH);
		}
	});

	test('definition-site parts do not hide a broken surface-to-form link: a div above the form still reddens when every part tag sits behind a chain-preserving helper', () => {
		writeFileSync(
			TEMPORARY_HELPER_HIDDEN_DIV_ABOVE_FORM_DRAWER_PATH,
			TEMPORARY_HELPER_HIDDEN_DIV_ABOVE_FORM_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_HELPER_HIDDEN_DIV_ABOVE_FORM_DRAWER_FILE),
			);
			expect(scan.formBearing).toContain(
				fixtureRel(TEMPORARY_HELPER_HIDDEN_DIV_ABOVE_FORM_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_HELPER_HIDDEN_DIV_ABOVE_FORM_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_HELPER_HIDDEN_DIV_ABOVE_FORM_DRAWER_PATH);
		}
	});

	test('a same-file sub-component rendering the form under an intermediate element is a violation and form-bearing', () => {
		// Round 11's IMPORTANT 1: the form behind a same-file sub-component
		// used to make the file legally "formless" — 28/28 green with the
		// #990 break, and the CORRECT inventory filing was the one that
		// reddened. The walk must resolve what `<InnerForm />` renders: the
		// form occurrence carries the div on its chain (formLinkBroken), and
		// the file is form-bearing either way, so filing it in the formless
		// list reddens the inventory equality.
		writeFileSync(
			TEMPORARY_INNER_FORM_DIV_ABOVE_DRAWER_PATH,
			TEMPORARY_INNER_FORM_DIV_ABOVE_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_INNER_FORM_DIV_ABOVE_DRAWER_FILE),
			);
			expect(scan.formBearing).toContain(
				fixtureRel(TEMPORARY_INNER_FORM_DIV_ABOVE_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_INNER_FORM_DIV_ABOVE_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_INNER_FORM_DIV_ABOVE_DRAWER_PATH);
		}
	});

	test('a same-file sub-component rendering the form directly under the surface is clean', () => {
		// The correct arrangement — the form behind a same-file sub-component
		// with NO intermediate element — must stay green: the walk resolves
		// the form occurrence with an empty chain, and the parts inside the
		// sub-component keep their direct-children verdict.
		writeFileSync(
			TEMPORARY_INNER_FORM_DIRECT_DRAWER_PATH,
			TEMPORARY_INNER_FORM_DIRECT_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_INNER_FORM_DIRECT_DRAWER_FILE),
			);
			expect(scan.formBearing).toContain(
				fixtureRel(TEMPORARY_INNER_FORM_DIRECT_DRAWER_FILE),
			);
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_INNER_FORM_DIRECT_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_INNER_FORM_DIRECT_DRAWER_PATH);
		}
	});

	test('drawer parts produced by a cross-file helper are judged at the call site', () => {
		// Round 11's IMPORTANT 2: parts extracted into a helper FILE used to
		// leave the call site with zero part tags, so it was never
		// discovered. The call site's anchored walk now expands the helpers
		// and reddens the #990 break one level up (the div above the form);
		// the helper file itself is a definition site and stays out of both
		// the inventory and the violations.
		writeFileSync(
			TEMPORARY_CROSSFILE_PARTS_PATH,
			TEMPORARY_CROSSFILE_PARTS_SOURCE,
		);
		writeFileSync(
			TEMPORARY_CROSSFILE_DIV_ABOVE_FORM_PATH,
			TEMPORARY_CROSSFILE_DIV_ABOVE_FORM_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_CROSSFILE_DIV_ABOVE_FORM_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_CROSSFILE_DIV_ABOVE_FORM_FILE),
			);
			expect(scan.discovered).not.toContain(
				fixtureRel(TEMPORARY_CROSSFILE_PARTS_FILE),
			);
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_CROSSFILE_PARTS_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_CROSSFILE_DIV_ABOVE_FORM_PATH);
			unlinkSync(TEMPORARY_CROSSFILE_PARTS_PATH);
		}
	});

	test('drawer parts produced by a cross-file helper directly under the form are clean', () => {
		// The correct cross-file arrangement — the same helpers, no
		// intermediate element — must stay green: the expanded parts resolve
		// with an empty chain.
		writeFileSync(
			TEMPORARY_CROSSFILE_PARTS_PATH,
			TEMPORARY_CROSSFILE_PARTS_SOURCE,
		);
		writeFileSync(
			TEMPORARY_CROSSFILE_DIRECT_FORM_PATH,
			TEMPORARY_CROSSFILE_DIRECT_FORM_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_CROSSFILE_DIRECT_FORM_FILE),
			);
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_CROSSFILE_DIRECT_FORM_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_CROSSFILE_DIRECT_FORM_PATH);
			unlinkSync(TEMPORARY_CROSSFILE_PARTS_PATH);
		}
	});

	test('a cross-file helper rendering the drawer form is judged at the call site and makes it form-bearing', () => {
		// The form one hop further: rendered by a helper FILE. The call site
		// has no `DrawerForm` tag of its own — formBearing must come from the
		// walk's form occurrence, and the div above the helper reddens
		// through the expansion. The helper file is a definition site and
		// stays out of the violations.
		writeFileSync(
			TEMPORARY_CROSSFILE_FORM_HELPER_PATH,
			TEMPORARY_CROSSFILE_FORM_HELPER_SOURCE,
		);
		writeFileSync(
			TEMPORARY_CROSSFILE_FORM_DIV_ABOVE_PATH,
			TEMPORARY_CROSSFILE_FORM_DIV_ABOVE_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_CROSSFILE_FORM_DIV_ABOVE_FILE),
			);
			expect(scan.formBearing).toContain(
				fixtureRel(TEMPORARY_CROSSFILE_FORM_DIV_ABOVE_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_CROSSFILE_FORM_DIV_ABOVE_FILE),
			);
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_CROSSFILE_FORM_HELPER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_CROSSFILE_FORM_DIV_ABOVE_PATH);
			unlinkSync(TEMPORARY_CROSSFILE_FORM_HELPER_PATH);
		}
	});

	test('a cross-file helper rendering the drawer form directly under the surface is clean', () => {
		writeFileSync(
			TEMPORARY_CROSSFILE_FORM_HELPER_PATH,
			TEMPORARY_CROSSFILE_FORM_HELPER_SOURCE,
		);
		writeFileSync(
			TEMPORARY_CROSSFILE_FORM_DIRECT_PATH,
			TEMPORARY_CROSSFILE_FORM_DIRECT_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_CROSSFILE_FORM_DIRECT_FILE),
			);
			expect(scan.formBearing).toContain(
				fixtureRel(TEMPORARY_CROSSFILE_FORM_DIRECT_FILE),
			);
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_CROSSFILE_FORM_DIRECT_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_CROSSFILE_FORM_DIRECT_PATH);
			unlinkSync(TEMPORARY_CROSSFILE_FORM_HELPER_PATH);
		}
	});

	test('a helper whose own body wraps the part in an element reddens through the expansion', () => {
		// The div is inside the DEFINITION, so only the expansion can see it:
		// the part's chain must carry the div and redden. This pins the
		// part-occurrence chain recording (dropping it would leave the #990
		// break green in the helper-inside-div shape).
		writeFileSync(
			TEMPORARY_HELPER_DIV_WRAPPED_PART_PATH,
			TEMPORARY_HELPER_DIV_WRAPPED_PART_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_HELPER_DIV_WRAPPED_PART_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_HELPER_DIV_WRAPPED_PART_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_HELPER_DIV_WRAPPED_PART_PATH);
		}
	});

	test('parts passed into a div-passthrough helper land behind the div and redden', () => {
		// `{children}` inside a definition hands the reference's own JSX
		// children to that position — the walk must continue with them and
		// the div already on the chain. Dropping the marker continuation
		// would make this exact shape green again.
		writeFileSync(
			TEMPORARY_DIV_PASSTHROUGH_HELPER_PATH,
			TEMPORARY_DIV_PASSTHROUGH_HELPER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_DIV_PASSTHROUGH_HELPER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_DIV_PASSTHROUGH_HELPER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_DIV_PASSTHROUGH_HELPER_PATH);
		}
	});

	test('parts passed into a fragment-passthrough helper stay direct children of the form', () => {
		// The positive control for the marker: a fragment passthrough is
		// transparent, so the parts land directly in the form and the file
		// must stay green.
		writeFileSync(
			TEMPORARY_FRAGMENT_PASSTHROUGH_HELPER_PATH,
			TEMPORARY_FRAGMENT_PASSTHROUGH_HELPER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_FRAGMENT_PASSTHROUGH_HELPER_FILE),
			);
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_FRAGMENT_PASSTHROUGH_HELPER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_FRAGMENT_PASSTHROUGH_HELPER_PATH);
		}
	});

	test('a children passthrough as a direct child of the form is unverifiable and reddens', () => {
		// The round-12 fail-loud boundary: parts arriving at runtime through
		// `{children}` cannot be checked, so the file must not be green. This
		// pins the direct-child bare-expression verdict (dropping it would
		// wave a children-fed drawer through unverified).
		writeFileSync(
			TEMPORARY_CHILDREN_IN_FORM_PATH,
			TEMPORARY_CHILDREN_IN_FORM_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_CHILDREN_IN_FORM_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_CHILDREN_IN_FORM_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_CHILDREN_IN_FORM_PATH);
		}
	});

	test('a children passthrough inside an element of the anchored subtree is unverifiable and reddens', () => {
		// Same boundary one level down: the parts would land inside the div
		// at runtime, behind an element — unverifiable, not green.
		writeFileSync(
			TEMPORARY_CHILDREN_IN_SURFACE_ELEMENT_PATH,
			TEMPORARY_CHILDREN_IN_SURFACE_ELEMENT_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_CHILDREN_IN_SURFACE_ELEMENT_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_CHILDREN_IN_SURFACE_ELEMENT_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_CHILDREN_IN_SURFACE_ELEMENT_PATH);
		}
	});

	test('a locally-declared Suspense that renders a layout box is a structural violation, not a nodeless wrapper', () => {
		writeFileSync(
			TEMPORARY_FAKE_SUSPENSE_DRAWER_PATH,
			TEMPORARY_FAKE_SUSPENSE_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_FAKE_SUSPENSE_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_FAKE_SUSPENSE_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_FAKE_SUSPENSE_DRAWER_PATH);
		}
	});

	test('a Suspense imported from a non-react module is a structural violation, not a nodeless wrapper', () => {
		// Round 11's MINOR 4: `getModuleSpecifierValue() === 'react'` was
		// unpinned and fail-open — a Suspense imported from ANY module passed
		// as nodeless, waving the layout box through. The walk additionally
		// resolves the imported Suspense and finds the box's div on the
		// part's chain, so the verdict holds even if the nodeless check is
		// deleted.
		writeFileSync(
			TEMPORARY_NONREACT_SUSPENSE_MODULE_PATH,
			TEMPORARY_NONREACT_SUSPENSE_MODULE_SOURCE,
		);
		writeFileSync(
			TEMPORARY_NAMED_NONREACT_SUSPENSE_PATH,
			TEMPORARY_NAMED_NONREACT_SUSPENSE_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_NAMED_NONREACT_SUSPENSE_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_NAMED_NONREACT_SUSPENSE_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_NAMED_NONREACT_SUSPENSE_PATH);
			unlinkSync(TEMPORARY_NONREACT_SUSPENSE_MODULE_PATH);
		}
	});

	test('a Suspense reached as a member of a non-react namespace import is a structural violation', () => {
		// Round 11's MINOR 4, member half: the `<Layout.Suspense>` branch
		// (`resolveNamespaceImport(...) === 'react'`) was unpinned and
		// fail-open too.
		writeFileSync(
			TEMPORARY_NONREACT_SUSPENSE_MODULE_PATH,
			TEMPORARY_NONREACT_SUSPENSE_MODULE_SOURCE,
		);
		writeFileSync(
			TEMPORARY_NS_MEMBER_NONREACT_SUSPENSE_PATH,
			TEMPORARY_NS_MEMBER_NONREACT_SUSPENSE_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_NS_MEMBER_NONREACT_SUSPENSE_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_NS_MEMBER_NONREACT_SUSPENSE_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_NS_MEMBER_NONREACT_SUSPENSE_PATH);
			unlinkSync(TEMPORARY_NONREACT_SUSPENSE_MODULE_PATH);
		}
	});

	test('a Suspense reached as a member of the react namespace stays transparent', () => {
		// The positive control for the member branch: `<React.Suspense>` IS
		// React's nodeless wrapper and must stay green — the round-11
		// mutations that waved EVERY member through are what these three
		// fixtures together pin.
		writeFileSync(
			TEMPORARY_REACT_NS_SUSPENSE_PATH,
			TEMPORARY_REACT_NS_SUSPENSE_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_REACT_NS_SUSPENSE_FILE),
			);
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_REACT_NS_SUSPENSE_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_REACT_NS_SUSPENSE_PATH);
		}
	});

	test('a name the drawer module does not export is not resolved as a drawer symbol', () => {
		// Round 9's MINOR 2, re-pinned for round 16: the symbol-graph entry
		// resolves a chain to the drawer module only for names the module
		// actually exports. The old pin drove the hand-rolled resolver
		// directly; that resolver is gone, so the pin is a fixture — the
		// unbound export is an alias with no target (UNVERIFIABLE/'other'),
		// the parts under it sit in that 'other' wrapper, and the file is
		// rejected rather than guessed. The export-LIST terminal itself is
		// pinned directly by the drawerModuleExports seam test below — round
		// 17's IMPORTANT 6 showed the fixture reddens regardless of what
		// the terminal returns, so the terminal's own behavior lives there.
		writeFileSync(
			TEMPORARY_NONEXPORT_DRAWER_PATH,
			TEMPORARY_NONEXPORT_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_NONEXPORT_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_NONEXPORT_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_NONEXPORT_DRAWER_PATH);
		}
	});

	test('the drawerModuleExports terminal admits exactly the names the drawer module exports', () => {
		// Round 17's IMPORTANT 6: the nonexport FIXTURE reddens through a
		// second mechanism (the unresolved import alias and the 'other'
		// wrapper), so replacing the whole export-list terminal with "every
		// name is exported" left every test green. This is the terminal's
		// direct seam: it dies when the export-list check dies, whatever
		// the fixtures do.
		const project = getScanProject();
		for (const exportedName of [
			'Drawer',
			'DrawerBody',
			'DrawerClose',
			'DrawerContent',
			'DrawerDescription',
			'DrawerFooter',
			'DrawerForm',
			'DrawerHeader',
			'DrawerTitle',
			'DrawerTrigger',
		]) {
			expect(drawerModuleExports(project, exportedName)).toBe(true);
		}
		expect(drawerModuleExports(project, 'NotADrawerExport')).toBe(false);
		expect(drawerModuleExports(project, 'DrawerFormExtra')).toBe(false);
	});

	test('a drawer whose parts resolve through a SHORTHAND object-literal component map is discovered and rejected', () => {
		// Round 17's BLOCKER 1, verbatim: `const Parts = { DrawerContent,
		// DrawerForm, DrawerBody, DrawerFooter }` — the property symbol only
		// carries the declaration, so the member value must come from the
		// checker's shorthand value symbol. Without that branch the four
		// members resolve null and the #990 div between the surface and the
		// form ships green. The scan-level assertions alone would stay green
		// through the UNVERIFIABLE terminal (round 19's MINOR 3: the named
		// branch never forced the red), so the resolved marker NAMES are
		// asserted directly — the test dies exactly when the shorthand
		// branch dies.
		writeFileSync(
			TEMPORARY_SHORTHAND_MAP_DRAWER_PATH,
			TEMPORARY_SHORTHAND_MAP_DRAWER_SOURCE,
		);

		try {
			const project = getScanProject();
			const sourceFile = project.getSourceFile(
				fixturePath(TEMPORARY_SHORTHAND_MAP_DRAWER_FILE),
			);
			if (!sourceFile) {
				throw new Error(
					`shorthand fixture not loaded: ${TEMPORARY_SHORTHAND_MAP_DRAWER_FILE}`,
				);
			}
			const reassignedNamesByFile = new Map<string, Set<string>>();
			const resolvedByTagText = new Map<string, DrawerTagNameResult>();
			for (const node of [
				...sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
				...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
			]) {
				resolvedByTagText.set(
					node.getTagNameNode().getText(),
					resolveDrawerTagName(
						node.getTagNameNode(),
						project,
						reassignedNamesByFile,
					),
				);
			}
			expect(resolvedByTagText.get('Parts.DrawerContent')).toBe(
				'DrawerContent',
			);
			expect(resolvedByTagText.get('Parts.DrawerForm')).toBe('DrawerForm');
			expect(resolvedByTagText.get('Parts.DrawerBody')).toBe('DrawerBody');
			expect(resolvedByTagText.get('Parts.DrawerFooter')).toBe('DrawerFooter');

			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_SHORTHAND_MAP_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_SHORTHAND_MAP_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_SHORTHAND_MAP_DRAWER_PATH);
		}
	});

	test('the same shorthand component map with a clean surface-to-form link stays green', () => {
		// The control for the shorthand branch: without it every member
		// resolves UNVERIFIABLE and this perfect drawer reddens — the
		// branch exists so the default red is not the only possible red.
		writeFileSync(
			TEMPORARY_SHORTHAND_MAP_CLEAN_DRAWER_PATH,
			TEMPORARY_SHORTHAND_MAP_CLEAN_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_SHORTHAND_MAP_CLEAN_DRAWER_FILE),
			);
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_SHORTHAND_MAP_CLEAN_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_SHORTHAND_MAP_CLEAN_DRAWER_PATH);
		}
	});

	test('tag resolution is keyed on the actual node: earlier same-named parameter tags do not silence a later drawer', () => {
		// Round 17's BLOCKER 2, verbatim: an earlier component whose props
		// are named `Surface`/`Form`/`Body`/`Footer` (parameters — definite
		// non-drawers) followed by the broken drawer built from IMPORTS
		// under those same local names. A text-keyed cache answers the
		// first `Surface` and applies it everywhere; per-node resolution
		// gives the later import-bound nodes their own verdicts and the
		// #990 div reddens.
		writeFileSync(
			TEMPORARY_SCOPE_CACHE_DRAWER_PATH,
			TEMPORARY_SCOPE_CACHE_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_SCOPE_CACHE_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_SCOPE_CACHE_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_SCOPE_CACHE_DRAWER_PATH);
		}
	});

	test('an opaque marker drawer whose namespace import comes through an export * barrel is discovered and rejected', () => {
		// Round 17's BLOCKER 3, verbatim: every marker is opaque
		// (`choose(Drawer.DrawerX)`) and the namespace import is a BARREL
		// (`export * from '~/components/ui/drawer'`) — how this repo
		// organises exports. The discriminator must resolve the barrel the
		// way the tag machinery does; the round-17 shape shipped green
		// because the namespace branch compared the resolved path to the
		// drawer module only.
		writeFileSync(TEMPORARY_R18_BARREL_PATH, TEMPORARY_R18_BARREL_SOURCE);
		writeFileSync(
			TEMPORARY_BARREL_OPAQUE_DRAWER_PATH,
			TEMPORARY_BARREL_OPAQUE_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_BARREL_OPAQUE_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_BARREL_OPAQUE_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_BARREL_OPAQUE_DRAWER_PATH);
			unlinkSync(TEMPORARY_R18_BARREL_PATH);
		}
	});

	test('a type-only namespace import of the drawer module is not a drawer signal', () => {
		// Round 17's IMPORTANT 4, verbatim: `import type * as DrawerTypes
		// from '~/components/ui/drawer'` next to an unrelated opaque
		// component. Type-only imports are not values — the file must stay
		// out of the inventory. Dropping the type-only skip makes the
		// opaque tag's unverifiable verdict pair with the drawer import and
		// this exact file reddens.
		writeFileSync(
			TEMPORARY_TYPE_ONLY_DRAWER_PATH,
			TEMPORARY_TYPE_ONLY_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).not.toContain(
				fixtureRel(TEMPORARY_TYPE_ONLY_DRAWER_FILE),
			);
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_TYPE_ONLY_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_TYPE_ONLY_DRAWER_PATH);
		}
	});

	test('a declaration shape the resolver does not handle reddens instead of passing', () => {
		// The round-18 default, pinned: a DESTRUCTURED binding is a
		// declaration kind (BindingElement) the resolver does not
		// enumerate, so today every marker is UNVERIFIABLE and this file —
		// carrying the exact #990 div between the surface and the form —
		// reddens through the default, not through any per-shape matcher.
		// The fixture does not depend on which shape is unhandled TODAY:
		// if a future round learns to resolve destructuring, the markers
		// become drawer symbols and the same file still reddens through the
		// walk. Only a fail-open terminal (unhandled means null) makes it
		// green.
		writeFileSync(
			TEMPORARY_DESTRUCTURED_DRAWER_PATH,
			TEMPORARY_DESTRUCTURED_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_DESTRUCTURED_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_DESTRUCTURED_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_DESTRUCTURED_DRAWER_PATH);
		}
	});

	test('a drawer whose parts resolve through a LOWERCASE dotted component map is discovered and rejected', () => {
		// Round 19's BLOCKER 1, verbatim: `const kit = { Surface:
		// DrawerContent, ... }` + `<kit.Surface>` — the intrinsic-element
		// cut read `/^[a-z]/` against the whole dotted text, so every
		// marker resolved to a definite null and the file was never even
		// discovered: the #990 div between the surface and the form ships
		// green. The fixture is UNANNOTATED so only the dotted-tag
		// resolution can discover it — the type-annotation escape is
		// round 19's BLOCKER 2's own fixture below.
		writeFileSync(
			TEMPORARY_DOTTED_KIT_DRAWER_PATH,
			TEMPORARY_DOTTED_KIT_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_DOTTED_KIT_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_DOTTED_KIT_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_DOTTED_KIT_DRAWER_PATH);
		}
	});

	test('the same lowercase dotted component map with a clean surface-to-form link stays green', () => {
		// The control for the dotted-kit shape: resolution must make the
		// file ANCHORED, and the clean arrangement must survive the walk —
		// the branch exists so the default red is not the only possible
		// red (killing the dotted-tag resolution makes every marker
		// unverifiable and this perfect drawer reddens).
		writeFileSync(
			TEMPORARY_DOTTED_KIT_CLEAN_DRAWER_PATH,
			TEMPORARY_DOTTED_KIT_CLEAN_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_DOTTED_KIT_CLEAN_DRAWER_FILE),
			);
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_DOTTED_KIT_CLEAN_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_DOTTED_KIT_CLEAN_DRAWER_PATH);
		}
	});

	test('a drawer whose parts resolve through a TYPE-ANNOTATED component map is discovered and rejected', () => {
		// Round 19's BLOCKER 2, verbatim: `const KIT: DrawerKit = {...}`
		// with the markers aliased through `const Surface = KIT.Surface;`.
		// The checker resolves the member to the TYPE's PropertySignature —
		// a kind round 18's allowlist read as "definitely not a drawer" —
		// so the initializer recursion never ran and the #990 div between
		// the surface and the form shipped green. The value-side walk must
		// reach the annotated object literal's own property.
		writeFileSync(
			TEMPORARY_PROPSIG_DRAWER_PATH,
			TEMPORARY_PROPSIG_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_PROPSIG_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_PROPSIG_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_PROPSIG_DRAWER_PATH);
		}
	});

	test('the same type-annotated component map with a clean surface-to-form link stays green', () => {
		// The control for the value-side walk: only the walk's resolution
		// keeps this perfect drawer green. Restore the round-19 allowlist
		// (type-side member means null) and the file loses its anchors; cut
		// the walk but keep the fail-closed terminal (type-side member
		// means UNVERIFIABLE) and the unverifiable markers redden it —
		// either way this exact file dies.
		writeFileSync(
			TEMPORARY_PROPSIG_CLEAN_DRAWER_PATH,
			TEMPORARY_PROPSIG_CLEAN_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_PROPSIG_CLEAN_DRAWER_FILE),
			);
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_PROPSIG_CLEAN_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_PROPSIG_CLEAN_DRAWER_PATH);
		}
	});

	test('a drawer whose four parts are passed into a child component as a prop is discovered and rejected', () => {
		// Round 24's BLOCKER 1, verbatim: the drawer exports flow into a
		// PARAMETER (`kit={{ Surface: DrawerContent, ... }}`) and the child
		// authors the broken #990 chain through `<kit.Surface>` etc. The
		// resolver cannot trace `kit` to a value side, so the member value is
		// not proved — the old fallback read "a parameter is definitely not a
		// drawer" and the break shipped green. Round 24 makes the untraceable
		// Parameter member UNVERIFIABLE (the member type `typeof DrawerContent`
		// is repo-local, so the type-based NOT_DRAWER proof does not apply), so
		// the file is discovered and reddens.
		writeFileSync(
			TEMPORARY_PARAMETER_KIT_DRAWER_PATH,
			TEMPORARY_PARAMETER_KIT_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_PARAMETER_KIT_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_PARAMETER_KIT_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_PARAMETER_KIT_DRAWER_PATH);
		}
	});

	test('a drawer whose four parts are passed through a structurally-typed FC<any> member is discovered and rejected', () => {
		// Round 26's BLOCKER 1, verbatim: the kit members are typed with React's
		// external `FC<any>`, so the member's DECLARED TYPE is external even
		// though the runtime value is the repo-local drawer export. TypeScript
		// member types are structural, not nominal — a repo-local DrawerContent
		// can legally inhabit `FC<any>` — so the type-shaped disproof (round 24's
		// `isMemberTypeProvablyExternal`) is not an identity proof and shipped
		// this exact #990 break green with typecheck clean. The disproof must be
		// about the VALUE's symbol: a parameter member with no traceable value
		// side is UNVERIFIABLE, whatever its declared type says. This fixture
		// imports the drawer module and passes the real exports into the kit, so
		// the unverifiable markers make it discovered and reddened.
		writeFileSync(
			TEMPORARY_EXTERNAL_TYPED_KIT_DRAWER_PATH,
			TEMPORARY_EXTERNAL_TYPED_KIT_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_EXTERNAL_TYPED_KIT_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_EXTERNAL_TYPED_KIT_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_EXTERNAL_TYPED_KIT_DRAWER_PATH);
		}
	});

	test('the shipped app-shell and icon-color-picker member tags resolve through the documented allowance, not a type-shaped disproof', () => {
		// Round 26's BLOCKER 1 paired proof — the legitimate case stays green:
		// `app-shell.tsx`'s `item.Icon` and `icon-color-picker.tsx`'s
		// `option.Icon` are members of genuine untraceable parameters, so they
		// now resolve UNVERIFIABLE by the value rule; they are kept out of the
		// inventory ONLY by the explicit, narrow, value-level allowance in
		// NON_DRAWER_PARAMETER_MEMBER_ALLOWANCES (which names the file, the
		// member, and the value-level reason — the icons come from @tabler/
		// icons-react, never from the drawer module). Resolve the real tags and
		// assert they are definite nulls, and assert neither file surfaces in
		// the scan.
		const project = getScanProject();
		const reassignedNamesByFile = new Map<string, Set<string>>();
		const resolvedByRelPath = new Map<string, DrawerTagNameResult>();

		const appShell = project.getSourceFile(
			path.join(FRONT_ROOT, 'src/components/app-shell/app-shell.tsx'),
		);
		expect(appShell).not.toBeNull();
		if (appShell) {
			for (const node of [
				...appShell.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
				...appShell.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
			]) {
				const text = node.getTagNameNode().getText();
				if (resolvedByRelPath.has(text)) {
					continue;
				}
				resolvedByRelPath.set(
					text,
					resolveDrawerTagName(
						node.getTagNameNode(),
						project,
						reassignedNamesByFile,
					),
				);
			}
			expect(resolvedByRelPath.get('DrawerContent')).toBe('DrawerContent');
			expect(resolvedByRelPath.get('Icon')).toBe(null);
		}

		const colorPicker = project.getSourceFile(
			path.join(FRONT_ROOT, 'src/components/ui/icon-color-picker.tsx'),
		);
		expect(colorPicker).not.toBeNull();
		if (colorPicker) {
			for (const node of [
				...colorPicker.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
				...colorPicker.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
			]) {
				const text = node.getTagNameNode().getText();
				if (text !== 'option.Icon') {
					continue;
				}
				expect(
					resolveDrawerTagName(
						node.getTagNameNode(),
						project,
						reassignedNamesByFile,
					),
				).toBe(null);
			}
		}

		const scan = scanDrawerSurfaces();
		expect(scan.discovered).toContain('src/components/app-shell/app-shell.tsx');
		expect(scan.violations).not.toContain(
			'src/components/app-shell/app-shell.tsx',
		);
		expect(scan.discovered).not.toContain(
			'src/components/ui/icon-color-picker.tsx',
		);
		expect(scan.violations).not.toContain(
			'src/components/ui/icon-color-picker.tsx',
		);
	});

	test('a drawer whose opaque kit tags and drawer imports are split across two files is discovered and both files are rejected', () => {
		// Round 26's BLOCKER 2, verbatim: the ordinary components-as-props SPLIT
		// — the child authors `<kit.Surface>` etc. with NO drawer import, the
		// parent imports the four drawer exports and passes them into the child.
		// Round 15's discriminator required the opaque tags and the imports in
		// the SAME file, so both files dropped out of discovery and the #990
		// break shipped green. Discovery must reason across the module graph:
		// the child is a candidate (unresolved drawer-shaped tags) regardless of
		// where the imports live, and the parent is the anchor (it passes drawer
		// exports into another component). Both files fail closed — discovered
		// AND reddened.
		writeFileSync(
			TEMPORARY_CROSSFILE_KIT_CHILD_PATH,
			TEMPORARY_CROSSFILE_KIT_CHILD_SOURCE,
		);
		writeFileSync(
			TEMPORARY_CROSSFILE_KIT_DRAWER_PATH,
			TEMPORARY_CROSSFILE_KIT_DRAWER_SOURCE,
		);

		try {
			const project = getScanProject();
			const reassignedNamesByFile = new Map<string, Set<string>>();
			const child = project.getSourceFile(
				fixturePath(TEMPORARY_CROSSFILE_KIT_CHILD_FILE),
			);
			expect(child).not.toBeNull();
			if (child) {
				for (const node of [
					...child.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
					...child.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
				]) {
					const text = node.getTagNameNode().getText();
					if (text.startsWith('kit.')) {
						expect(
							resolveDrawerTagName(
								node.getTagNameNode(),
								project,
								reassignedNamesByFile,
							),
						).toBe(UNVERIFIABLE_TAG);
					}
				}
			}

			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_CROSSFILE_KIT_CHILD_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_CROSSFILE_KIT_CHILD_FILE),
			);
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_CROSSFILE_KIT_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_CROSSFILE_KIT_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_CROSSFILE_KIT_CHILD_PATH);
			unlinkSync(TEMPORARY_CROSSFILE_KIT_DRAWER_PATH);
		}
	});

	test('a cross-file pair whose parent passes only local components produces no drawer noise', () => {
		// The control for BLOCKER 2: the pair rule must not redden a split where
		// the parent passes only real LOCAL components into the child. The child
		// still authors `kit.*` tags on an untraceable parameter (UNVERIFIABLE
		// under the fail-closed rule), but its tags carry no drawer signal: the
		// parent is not a drawer passer (none of its prop values resolve to a
		// drawer export), so the child is never anchored and neither file is
		// discovered. A reader who expects the anchor to be anything-drawer-
		// shaped would redden this exact pair — the anchor must be a REAL drawer
		// export flowing across the module graph, not a coincidence of shapes.
		writeFileSync(
			TEMPORARY_CROSSFILE_KIT_CLEAN_CHILD_PATH,
			TEMPORARY_CROSSFILE_KIT_CLEAN_CHILD_SOURCE,
		);
		writeFileSync(
			TEMPORARY_CROSSFILE_KIT_CLEAN_DRAWER_PATH,
			TEMPORARY_CROSSFILE_KIT_CLEAN_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).not.toContain(
				fixtureRel(TEMPORARY_CROSSFILE_KIT_CLEAN_CHILD_FILE),
			);
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_CROSSFILE_KIT_CLEAN_CHILD_FILE),
			);
			expect(scan.discovered).not.toContain(
				fixtureRel(TEMPORARY_CROSSFILE_KIT_CLEAN_DRAWER_FILE),
			);
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_CROSSFILE_KIT_CLEAN_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_CROSSFILE_KIT_CLEAN_CHILD_PATH);
			unlinkSync(TEMPORARY_CROSSFILE_KIT_CLEAN_DRAWER_PATH);
		}
	});

	test('a drawer whose kit is built as a const object and passed by reference is discovered and rejected', () => {
		// Round 28's BLOCKER 1, verbatim: `const kit = { Surface:
		// DrawerContent, ... }; <CrossFileConstKitDrawer kit={kit} />`. The
		// anchor probe used to read only INLINE prop values — an identifier
		// resolved to a definite local value (the object literal is never
		// the drawer module's symbol, which is true but beside the point),
		// so the edge from the parent to the opaque child disappeared and
		// the gate silently dropped both files while the child rendered the
		// exact broken chain. The probe must follow the binding's VALUE
		// SIDE — the object literal — and classify its properties like the
		// inline form: the pair surfaces and both files redden.
		writeFileSync(
			TEMPORARY_CROSSFILE_CONST_KIT_CHILD_PATH,
			TEMPORARY_CROSSFILE_CONST_KIT_CHILD_SOURCE,
		);
		writeFileSync(
			TEMPORARY_CROSSFILE_CONST_KIT_DRAWER_PATH,
			TEMPORARY_CROSSFILE_CONST_KIT_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_CROSSFILE_CONST_KIT_CHILD_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_CROSSFILE_CONST_KIT_CHILD_FILE),
			);
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_CROSSFILE_CONST_KIT_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_CROSSFILE_CONST_KIT_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_CROSSFILE_CONST_KIT_CHILD_PATH);
			unlinkSync(TEMPORARY_CROSSFILE_CONST_KIT_DRAWER_PATH);
		}
	});

	test('a cross-file const-kit pair whose kit holds only local components produces no drawer noise', () => {
		// The BLOCKER 1 control: the SAME `const kit` spelling, but every
		// property is a real local component. The value-side walk resolves
		// them as definite non-references, so no drawer export flows across
		// the module graph and the pair stays out of the inventory — the
		// identifier follow must not have widened the anchor into
		// anything-object-shaped.
		writeFileSync(
			TEMPORARY_CROSSFILE_CONST_KIT_CLEAN_CHILD_PATH,
			TEMPORARY_CROSSFILE_CONST_KIT_CLEAN_CHILD_SOURCE,
		);
		writeFileSync(
			TEMPORARY_CROSSFILE_CONST_KIT_CLEAN_DRAWER_PATH,
			TEMPORARY_CROSSFILE_CONST_KIT_CLEAN_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).not.toContain(
				fixtureRel(TEMPORARY_CROSSFILE_CONST_KIT_CLEAN_CHILD_FILE),
			);
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_CROSSFILE_CONST_KIT_CLEAN_CHILD_FILE),
			);
			expect(scan.discovered).not.toContain(
				fixtureRel(TEMPORARY_CROSSFILE_CONST_KIT_CLEAN_DRAWER_FILE),
			);
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_CROSSFILE_CONST_KIT_CLEAN_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_CROSSFILE_CONST_KIT_CLEAN_CHILD_PATH);
			unlinkSync(TEMPORARY_CROSSFILE_CONST_KIT_CLEAN_DRAWER_PATH);
		}
	});

	test('a drawer whose kit is forwarded through a component parameter is discovered and rejected', () => {
		// Round 28's BLOCKER 2, verbatim: `({ kit, methods }) =>
		// <CrossFileForwardedKitDrawer kit={kit} />` forwards the parameter
		// onward. The parameter was classified as a definite local value, so
		// the forwarder-to-child edge was lost — the parent-to-forwarder edge
		// alone cannot reach the child, and both files fell through the
		// silent gate. A parameter's value comes from call sites: the probe
		// answers UNRESOLVED, the forwarder (anchored by the inline drawer
		// exports at its call site) is that unresolved edge's anchor, and
		// the child surfaces as UNVERIFIABLE — both files redden.
		writeFileSync(
			TEMPORARY_CROSSFILE_FORWARDED_KIT_CHILD_PATH,
			TEMPORARY_CROSSFILE_FORWARDED_KIT_CHILD_SOURCE,
		);
		writeFileSync(
			TEMPORARY_CROSSFILE_FORWARDED_KIT_DRAWER_PATH,
			TEMPORARY_CROSSFILE_FORWARDED_KIT_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_CROSSFILE_FORWARDED_KIT_CHILD_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_CROSSFILE_FORWARDED_KIT_CHILD_FILE),
			);
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_CROSSFILE_FORWARDED_KIT_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_CROSSFILE_FORWARDED_KIT_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_CROSSFILE_FORWARDED_KIT_CHILD_PATH);
			unlinkSync(TEMPORARY_CROSSFILE_FORWARDED_KIT_DRAWER_PATH);
		}
	});

	test('a cross-file forwarded-kit pair whose call site passes only local components produces no drawer noise', () => {
		// The BLOCKER 2 control: the forwarder still forwards a parameter
		// (an UNRESOLVED edge either way), but the call site passes only real
		// local components — the forwarder is never anchored, so the child's
		// opaque tags carry no drawer signal and the pair stays out of the
		// inventory. An unresolved edge from an UNANCHORED passer is the
		// ordinary parameter-forwarding shape and must not redden.
		writeFileSync(
			TEMPORARY_CROSSFILE_FORWARDED_KIT_CLEAN_CHILD_PATH,
			TEMPORARY_CROSSFILE_FORWARDED_KIT_CLEAN_CHILD_SOURCE,
		);
		writeFileSync(
			TEMPORARY_CROSSFILE_FORWARDED_KIT_CLEAN_DRAWER_PATH,
			TEMPORARY_CROSSFILE_FORWARDED_KIT_CLEAN_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).not.toContain(
				fixtureRel(TEMPORARY_CROSSFILE_FORWARDED_KIT_CLEAN_CHILD_FILE),
			);
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_CROSSFILE_FORWARDED_KIT_CLEAN_CHILD_FILE),
			);
			expect(scan.discovered).not.toContain(
				fixtureRel(TEMPORARY_CROSSFILE_FORWARDED_KIT_CLEAN_DRAWER_FILE),
			);
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_CROSSFILE_FORWARDED_KIT_CLEAN_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_CROSSFILE_FORWARDED_KIT_CLEAN_CHILD_PATH);
			unlinkSync(TEMPORARY_CROSSFILE_FORWARDED_KIT_CLEAN_DRAWER_PATH);
		}
	});

	test('a drawer whose opaque child is default-imported is discovered and both files are rejected', () => {
		// Round 28's BLOCKER 3, verbatim: the child does `export default
		// CrossFileDefaultKitDrawer;` and the parent imports it default-style.
		// The import loop in resolveComponentDefinition read only NAMED
		// imports, so the default-imported tag never resolved to its
		// definition — no edge, and both files fell through the silent gate
		// while the child rendered the exact broken chain. The default import
		// must resolve through the same module machinery (including the
		// `export default <local binding>` indirection) so the pair surfaces
		// and both files redden.
		writeFileSync(
			TEMPORARY_CROSSFILE_DEFAULT_KIT_CHILD_PATH,
			TEMPORARY_CROSSFILE_DEFAULT_KIT_CHILD_SOURCE,
		);
		writeFileSync(
			TEMPORARY_CROSSFILE_DEFAULT_KIT_DRAWER_PATH,
			TEMPORARY_CROSSFILE_DEFAULT_KIT_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_CROSSFILE_DEFAULT_KIT_CHILD_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_CROSSFILE_DEFAULT_KIT_CHILD_FILE),
			);
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_CROSSFILE_DEFAULT_KIT_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_CROSSFILE_DEFAULT_KIT_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_CROSSFILE_DEFAULT_KIT_CHILD_PATH);
			unlinkSync(TEMPORARY_CROSSFILE_DEFAULT_KIT_DRAWER_PATH);
		}
	});

	test('a cross-file default-import pair whose parent passes only local components produces no drawer noise', () => {
		// The BLOCKER 3 control: the SAME default-export/default-import
		// arrangement, but only real local components flow across the module
		// graph. The default import resolves (the definition is reachable),
		// the edge classifies as a definite non-reference, and the pair stays
		// out of the inventory.
		writeFileSync(
			TEMPORARY_CROSSFILE_DEFAULT_KIT_CLEAN_CHILD_PATH,
			TEMPORARY_CROSSFILE_DEFAULT_KIT_CLEAN_CHILD_SOURCE,
		);
		writeFileSync(
			TEMPORARY_CROSSFILE_DEFAULT_KIT_CLEAN_DRAWER_PATH,
			TEMPORARY_CROSSFILE_DEFAULT_KIT_CLEAN_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).not.toContain(
				fixtureRel(TEMPORARY_CROSSFILE_DEFAULT_KIT_CLEAN_CHILD_FILE),
			);
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_CROSSFILE_DEFAULT_KIT_CLEAN_CHILD_FILE),
			);
			expect(scan.discovered).not.toContain(
				fixtureRel(TEMPORARY_CROSSFILE_DEFAULT_KIT_CLEAN_DRAWER_FILE),
			);
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_CROSSFILE_DEFAULT_KIT_CLEAN_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_CROSSFILE_DEFAULT_KIT_CLEAN_CHILD_PATH);
			unlinkSync(TEMPORARY_CROSSFILE_DEFAULT_KIT_CLEAN_DRAWER_PATH);
		}
	});

	test('an accessor pair with the setter declared first resolves through the getter and is rejected', () => {
		// Round 24's BLOCKER 2a, verbatim: `getProperty(memberName)` returns
		// whichever accessor is declared FIRST, so the setter-first pair was
		// read as a setter-only member ("value is undefined") and the #990 div
		// between the surface and the form shipped green — while property
		// access INVOKES the getter and returns the real drawer export.
		writeFileSync(
			TEMPORARY_SETTER_GETTER_KIT_DRAWER_PATH,
			TEMPORARY_SETTER_GETTER_KIT_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_SETTER_GETTER_KIT_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_SETTER_GETTER_KIT_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_SETTER_GETTER_KIT_DRAWER_PATH);
		}
	});

	test('a method-valued dotted member whose body renders the real drawer is rejected, not read as a local function', () => {
		// Round 24's BLOCKER 2b, verbatim: `Surface(props) { return
		// createElement(DrawerContent, props); }` used as `<kit.Surface>` is
		// INVOKED and renders the real drawer. A method declaration is not
		// evidence of absence the way a plain function reference is — the
		// single-return body resolves to the export and the #990 div reddens.
		writeFileSync(
			TEMPORARY_METHOD_KIT_DRAWER_PATH,
			TEMPORARY_METHOD_KIT_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_METHOD_KIT_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_METHOD_KIT_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_METHOD_KIT_DRAWER_PATH);
		}
	});

	test('a traced array literal that is later mutated is unverifiable and rejected', () => {
		// Round 24's BLOCKER 3, verbatim: `const kits: DrawerKit[] =
		// [LocalKit]; kits.push(DrawerKit);` then `kits.map((kit) => ...)`. The
		// literal initializer is only the array's FIRST value; the walk used to
		// classify it as "definitely not a drawer" because the traced elements
		// were all local, while the pushed element — the real drawer kit — is
		// what the callback actually sees. The mutation must make the array
		// UNVERIFIABLE, never a definite non-drawer.
		writeFileSync(
			TEMPORARY_MUTATED_ARRAY_KIT_DRAWER_PATH,
			TEMPORARY_MUTATED_ARRAY_KIT_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_MUTATED_ARRAY_KIT_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_MUTATED_ARRAY_KIT_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_MUTATED_ARRAY_KIT_DRAWER_PATH);
		}
	});

	test('a traced array literal mutated through a second alias is unverifiable and rejected', () => {
		// Round 26's BLOCKER 3, verbatim: `const alias = kits; alias.push(
		// DrawerKit);` then `kits.map((kit) => ...)`. The mutation scan matched
		// only writes whose receiver TEXT was the traced binding's name, so the
		// write through `alias` was invisible — the callback was classified from
		// the old local-only literal, every member read definite NOT_DRAWER, and
		// the appended real drawer kit disappeared. The receiver must be
		// resolved through the value side to the array's literal identity, not
		// its spelling, so an alias write is caught and the array is
		// UNVERIFIABLE.
		writeFileSync(
			TEMPORARY_ALIASED_MUTATED_ARRAY_KIT_DRAWER_PATH,
			TEMPORARY_ALIASED_MUTATED_ARRAY_KIT_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_ALIASED_MUTATED_ARRAY_KIT_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_ALIASED_MUTATED_ARRAY_KIT_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_ALIASED_MUTATED_ARRAY_KIT_DRAWER_PATH);
		}
	});

	test('a traced array literal mutated through a helper parameter is unverifiable and rejected', () => {
		// Round 28's BLOCKER 4, verbatim: `appendDrawerKit(alias)` where the
		// helper's body pushes the real drawer kit. The round-26 receiver
		// resolution only followed receivers with a readable value side; a
		// helper PARAMETER has no initializer, so the write inside the helper
		// was invisible and the array was classified from its old local-only
		// literal — every member definite NOT_DRAWER, the appended real kit
		// gone. Passing the array into a call is exactly where the guard
		// cannot see the writes: the literal is unsafe to classify and the
		// file becomes UNVERIFIABLE.
		writeFileSync(
			TEMPORARY_HELPER_MUTATED_ARRAY_KIT_DRAWER_PATH,
			TEMPORARY_HELPER_MUTATED_ARRAY_KIT_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_HELPER_MUTATED_ARRAY_KIT_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_HELPER_MUTATED_ARRAY_KIT_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_HELPER_MUTATED_ARRAY_KIT_DRAWER_PATH);
		}
	});

	test('a helper that receives a different array leaves the traced array trustworthy', () => {
		// The BLOCKER 4 control: the traced `kits` array never escapes into
		// the helper — only `other` does — so its literal stays trustworthy,
		// the members resolve to the REAL drawer exports, and the broken
		// chain is discovered and rejected for its own structural reason.
		// The escape rule must be about the traced array's literal identity,
		// not about the mere existence of a helper call.
		writeFileSync(
			TEMPORARY_HELPER_OTHER_ARRAY_KIT_DRAWER_PATH,
			TEMPORARY_HELPER_OTHER_ARRAY_KIT_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_HELPER_OTHER_ARRAY_KIT_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_HELPER_OTHER_ARRAY_KIT_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_HELPER_OTHER_ARRAY_KIT_DRAWER_PATH);
		}
	});

	test('a member-expression tag on a typed callback parameter over a traceable array resolves to its element, not an opaque signal', () => {
		// Round 19's BLOCKER 1 paired proof, verbatim shape: `<option.Icon
		// />` — a member of a TYPED `.map` callback parameter. Round 21's
		// MINOR 5: this fixture used to carry no drawer import, so it was
		// never DISCOVERED at all and this test could not fail even when the
		// classification it names was deliberately broken. The drawer import
		// + real anchor below make that classification load-bearing: `option`'s
		// iterable (`options`) is a traceable array literal, so round 21's
		// array walk resolves `option.Icon` to `IconOne` (null, a real local
		// component).
		//
		// Round 24's MINOR 5: the OLD fixture typed `option.Icon` as
		// `ComponentType` (external), so killing the array walk did NOT redden
		// this file — the untraced-Parameter fallback still returned null via
		// the external-type proof. The member type is now `typeof IconOne`
		// (repo-local), so the fallback is UNVERIFIABLE and the ROW BELOW is
		// the array walk's own: `option.Icon` resolving to null is the WALKED
		// element, not a fallback verdict. Killing the walk reddens this exact
		// assertion.
		writeFileSync(
			TEMPORARY_MEMBER_OF_PARAMETER_PATH,
			TEMPORARY_MEMBER_OF_PARAMETER_SOURCE,
		);

		try {
			const project = getScanProject();
			const sourceFile = project.getSourceFile(
				fixturePath(TEMPORARY_MEMBER_OF_PARAMETER_FILE),
			);
			if (!sourceFile) {
				throw new Error(
					`member-of-parameter fixture not loaded: ${TEMPORARY_MEMBER_OF_PARAMETER_FILE}`,
				);
			}
			const reassignedNamesByFile = new Map<string, Set<string>>();
			const resolvedByTagText = new Map<string, DrawerTagNameResult>();
			for (const node of [
				...sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
				...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
			]) {
				resolvedByTagText.set(
					node.getTagNameNode().getText(),
					resolveDrawerTagName(
						node.getTagNameNode(),
						project,
						reassignedNamesByFile,
					),
				);
			}
			// The array walk resolves `<option.Icon>` to `IconOne` — a real
			// local component, i.e. null, NOT an opaque/unverifiable signal and
			// NOT a drawer export. Killing the walk makes this UNVERIFIABLE.
			expect(resolvedByTagText.get('option.Icon')).toBe(null);

			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_MEMBER_OF_PARAMETER_FILE),
			);
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_MEMBER_OF_PARAMETER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_MEMBER_OF_PARAMETER_PATH);
		}
	});

	test('a drawer whose parts resolve through a typed array literal accessed via a .map callback parameter is discovered and rejected', () => {
		// Round 21's BLOCKER 1, verbatim: `const kits: DrawerKit[] = [{
		// Surface: DrawerContent, ... }]` + `kits.map((kit) => <kit.Surface
		// />)`. Before the fix, EVERY member of a `.map` callback's element
		// parameter read "definitely not a drawer" regardless of what the
		// array actually held — no anchor and no UNVERIFIABLE signal, so the
		// #990 div between the surface and the form was invisible to
		// discovery. The array walk must resolve through to the real
		// exports.
		writeFileSync(
			TEMPORARY_ARRAY_KIT_DRAWER_PATH,
			TEMPORARY_ARRAY_KIT_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_ARRAY_KIT_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_ARRAY_KIT_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_ARRAY_KIT_DRAWER_PATH);
		}
	});

	test('the same typed array literal with a clean surface-to-form link stays green', () => {
		// The control for the array walk: only the walk's resolution keeps
		// this perfect drawer green (with no anchors at all, a fully green
		// suite is also possible — the walk itself is what must be tested).
		writeFileSync(
			TEMPORARY_ARRAY_KIT_CLEAN_DRAWER_PATH,
			TEMPORARY_ARRAY_KIT_CLEAN_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_ARRAY_KIT_CLEAN_DRAWER_FILE),
			);
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_ARRAY_KIT_CLEAN_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_ARRAY_KIT_CLEAN_DRAWER_PATH);
		}
	});

	test('a drawer whose parts resolve through object-literal getters is discovered and rejected', () => {
		// Round 21's BLOCKER 2, verbatim: `const kit = { get Surface() {
		// return DrawerContent; }, ... }`. Before the fix, GetAccessor was
		// grouped with methods/setters and read as "the member's value IS
		// the function" — but property access INVOKES a getter and returns
		// whatever it returns, so `kit.Surface` silently became "definitely
		// not a drawer" with the #990 div right behind it.
		writeFileSync(
			TEMPORARY_GETTER_KIT_DRAWER_PATH,
			TEMPORARY_GETTER_KIT_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_GETTER_KIT_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_GETTER_KIT_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_GETTER_KIT_DRAWER_PATH);
		}
	});

	test('the same object-literal getters with a clean surface-to-form link stay green', () => {
		// The control for the getter walk: only resolving what the getter
		// RETURNS (not reading it as a real local value) keeps this perfect
		// drawer green.
		writeFileSync(
			TEMPORARY_GETTER_KIT_CLEAN_DRAWER_PATH,
			TEMPORARY_GETTER_KIT_CLEAN_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_GETTER_KIT_CLEAN_DRAWER_FILE),
			);
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_GETTER_KIT_CLEAN_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_GETTER_KIT_CLEAN_DRAWER_PATH);
		}
	});

	test('a plain div between the surface and the form is still rejected at the exact position a display:contents wrapper is allowed', () => {
		// The broken control for round 21's IMPORTANT 4: an ordinary
		// `<div className="p-4">` at the same position a `display: contents`
		// wrapper occupies below. This must stay a violation — the fix must
		// not have widened the guard into accepting any wrapper.
		writeFileSync(
			TEMPORARY_CONTENTS_WRAPPER_BROKEN_PATH,
			TEMPORARY_CONTENTS_WRAPPER_BROKEN_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_CONTENTS_WRAPPER_BROKEN_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_CONTENTS_WRAPPER_BROKEN_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_CONTENTS_WRAPPER_BROKEN_PATH);
		}
	});

	test('a display:contents wrapper between the surface and the form does not break the flex chain and stays green', () => {
		// Round 21's IMPORTANT 4: #990 forbids wrappers that BREAK the flex
		// chain, not every intermediate element. A `display: contents`
		// element generates no principal box, so its child participates
		// directly in the drawer's own formatting context — this is the
		// exact broken-control fixture above with only the class changed.
		writeFileSync(
			TEMPORARY_CONTENTS_WRAPPER_CLEAN_PATH,
			TEMPORARY_CONTENTS_WRAPPER_CLEAN_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_CONTENTS_WRAPPER_CLEAN_FILE),
			);
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_CONTENTS_WRAPPER_CLEAN_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_CONTENTS_WRAPPER_CLEAN_PATH);
		}
	});

	test('a contents wrapper that restores a box above a breakpoint is not established boxless and is rejected', () => {
		// Round 24's IMPORTANT 5 paired proof: `className="contents
		// min-[1100px]:block"` still contains the `contents` token but becomes
		// a block at 1100px+, so it is NOT `display: contents` at every width
		// that matters. The old "contains the token" rule accepted it and the
		// #990 geometry restored above 1100px shipped green (all committed
		// browser samples are below that threshold). The fix must establish
		// `display: contents` actually wins — this wrapper is treated as a
		// real element and the broken chain reddens.
		writeFileSync(
			TEMPORARY_CONTENTS_BOX_RESTORING_PATH,
			TEMPORARY_CONTENTS_BOX_RESTORING_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_CONTENTS_BOX_RESTORING_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_CONTENTS_BOX_RESTORING_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_CONTENTS_BOX_RESTORING_PATH);
		}
	});

	test('a contents wrapper that restores a box with a less common display utility is not established boxless and is rejected', () => {
		// Round 28's IMPORTANT 5, verbatim: the reviewer's mutation changed
		// `min-[1100px]:block` to `min-[1100px]:table-cell`. The recognizer's
		// hand-maintained display set omitted `table-cell` (and `list-item`),
		// so the wrapper was accepted as established boxless even though it
		// restores a real box above the breakpoint. The recognizer now works
		// from the SAME canonical display list as the @apply resolver —
		// everything except `contents` restores a box — so this wrapper is
		// treated as a real element and the broken chain reddens, without
		// reopening the `contents md:block` hole round 24 closed.
		writeFileSync(
			TEMPORARY_CONTENTS_BOX_RESTORING_TABLE_CELL_PATH,
			TEMPORARY_CONTENTS_BOX_RESTORING_TABLE_CELL_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_CONTENTS_BOX_RESTORING_TABLE_CELL_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_CONTENTS_BOX_RESTORING_TABLE_CELL_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_CONTENTS_BOX_RESTORING_TABLE_CELL_PATH);
		}
	});

	test('a contents wrapper whose inline style restores a box is not established boxless and is rejected', () => {
		// Round 26's IMPORTANT 5, verbatim: the reviewer's mutation of the
		// clean round-21 fixture — `<div className="contents" style={{
		// display: 'block' }}>`. The inline style beats the class cascade, so
		// the wrapper generates a real `display: block` box and restores the
		// #990 break. The old guard accepted it on the FIRST evidence (the
		// class list) and never read the later style attribute; the winning
		// value must be established instead. A style that proves `contents`
		// stays boxless, a style that does not name display leaves the class
		// cascade in charge, and a style the guard cannot see (a dynamic
		// object) fails closed.
		writeFileSync(
			TEMPORARY_CONTENTS_STYLE_RESTORING_PATH,
			TEMPORARY_CONTENTS_STYLE_RESTORING_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_CONTENTS_STYLE_RESTORING_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_CONTENTS_STYLE_RESTORING_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_CONTENTS_STYLE_RESTORING_PATH);
		}
	});

	test('a contents wrapper with a style that proves display: contents stays green', () => {
		// The legitimate half of IMPORTANT 5: the inline style wins the
		// cascade and PROVES boxlessness at every width — even though the
		// class list would be the only evidence the old guard consulted, the
		// style is the stronger proof and the clean chain must stay green.
		writeFileSync(
			TEMPORARY_CONTENTS_STYLE_CLEAN_PATH,
			TEMPORARY_CONTENTS_STYLE_CLEAN_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_CONTENTS_STYLE_CLEAN_FILE),
			);
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_CONTENTS_STYLE_CLEAN_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_CONTENTS_STYLE_CLEAN_PATH);
		}
	});

	test('a contents wrapper whose inline style does not name display stays green', () => {
		// The non-geometry control: `style={{ padding: '1rem' }}` does not
		// override the display property, so the class cascade's `contents`
		// still wins. The winning-value rule must not redden a style that
		// never touches display.
		writeFileSync(
			TEMPORARY_CONTENTS_STYLE_NON_DISPLAY_PATH,
			TEMPORARY_CONTENTS_STYLE_NON_DISPLAY_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_CONTENTS_STYLE_NON_DISPLAY_FILE),
			);
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_CONTENTS_STYLE_NON_DISPLAY_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_CONTENTS_STYLE_NON_DISPLAY_PATH);
		}
	});

	test('a contents wrapper with a style the guard cannot see fails closed and is rejected', () => {
		// The fail-closed control for IMPORTANT 5: `style={wrapperStyle}` is
		// not statically decidable, so the guard cannot establish that the
		// wrapper is boxless — the same "not established" rule that governs
		// computed class lists. It is treated as a real element and reddens.
		writeFileSync(
			TEMPORARY_CONTENTS_STYLE_UNDECIDABLE_PATH,
			TEMPORARY_CONTENTS_STYLE_UNDECIDABLE_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_CONTENTS_STYLE_UNDECIDABLE_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_CONTENTS_STYLE_UNDECIDABLE_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_CONTENTS_STYLE_UNDECIDABLE_PATH);
		}
	});

	test('a contents wrapper whose inline style spread restores a box is not established boxless and is rejected', () => {
		// Round 28's IMPORTANT 7, verbatim: `style={{ display: 'contents',
		// ...wrapperStyle }}` with `wrapperStyle = { display: 'block' as
		// const }`. A later spread wins ordinary JavaScript object
		// construction, so the real winning display is `block` — but the
		// resolver found the direct `display: 'contents'` property and
		// declared the wrapper boxless. A spread can supply or override
		// `display`, so the winning value is not statically established and
		// the wrapper is treated as a real element: the broken chain
		// reddens. The direct `style={{ display: 'contents' }}` control
		// stays green (no spread, fully established).
		writeFileSync(
			TEMPORARY_CONTENTS_STYLE_SPREAD_RESTORING_PATH,
			TEMPORARY_CONTENTS_STYLE_SPREAD_RESTORING_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_CONTENTS_STYLE_SPREAD_RESTORING_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_CONTENTS_STYLE_SPREAD_RESTORING_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_CONTENTS_STYLE_SPREAD_RESTORING_PATH);
		}
	});

	test('a member-expression part tag whose base is a named binding through an export * as barrel is discovered and rejected', () => {
		writeFileSync(TEMPORARY_NS_BARREL_PATH, TEMPORARY_NS_BARREL_SOURCE);
		writeFileSync(
			TEMPORARY_NS_BARREL_CALL_SITE_PATH,
			TEMPORARY_NS_BARREL_CALL_SITE_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_NS_BARREL_CALL_SITE_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_NS_BARREL_CALL_SITE_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_NS_BARREL_CALL_SITE_PATH);
			unlinkSync(TEMPORARY_NS_BARREL_PATH);
		}
	});

	test('a drawer whose surface, form, body and footer are local identity aliases of the shared components is discovered and rejected', () => {
		// Round 13's BLOCKER 1, verbatim: `const Surface = DrawerContent;
		// const Form = DrawerForm; const Body = DrawerBody; const Footer =
		// DrawerFooter;` + the #990 `<div>` between surface and form shipped
		// 43/43 green because the walk could only begin at tags whose local
		// binding resolved — and a local declaration was a dead end. The
		// entry point now resolves identity chains BEFORE anchor discovery.
		writeFileSync(
			TEMPORARY_ALIASED_ENTIRE_DRAWER_PATH,
			TEMPORARY_ALIASED_ENTIRE_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_ALIASED_ENTIRE_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_ALIASED_ENTIRE_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_ALIASED_ENTIRE_DRAWER_PATH);
		}
	});

	test('the same identity aliases with a clean surface-to-form link stay green', () => {
		// The control for the aliased shape: resolution must make the file
		// ANCHORED, and the clean arrangement must survive the walk.
		writeFileSync(
			TEMPORARY_ALIASED_ENTIRE_CLEAN_DRAWER_PATH,
			TEMPORARY_ALIASED_ENTIRE_CLEAN_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_ALIASED_ENTIRE_CLEAN_DRAWER_FILE),
			);
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_ALIASED_ENTIRE_CLEAN_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_ALIASED_ENTIRE_CLEAN_DRAWER_PATH);
		}
	});

	test('an identity alias chain longer than one hop is followed to the drawer module', () => {
		// `const Surface2 = Surface;` where `Surface = DrawerContent` — the
		// chain must not stop at the first local hop.
		writeFileSync(
			TEMPORARY_ALIASED_CHAIN_DRAWER_PATH,
			TEMPORARY_ALIASED_CHAIN_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_ALIASED_CHAIN_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_ALIASED_CHAIN_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_ALIASED_CHAIN_DRAWER_PATH);
		}
	});

	test('a conditional whose branches are the same drawer symbol is resolved like an identity alias', () => {
		// `open ? DrawerContent : DrawerContent` is statically the surface —
		// the div above the form must redden.
		writeFileSync(
			TEMPORARY_CONDITIONAL_SAME_SYMBOL_DRAWER_PATH,
			TEMPORARY_CONDITIONAL_SAME_SYMBOL_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_CONDITIONAL_SAME_SYMBOL_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_CONDITIONAL_SAME_SYMBOL_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_CONDITIONAL_SAME_SYMBOL_DRAWER_PATH);
		}
	});

	test('a conditional whose branches disagree is unverifiable: the parts under it redden through the wrapper rule', () => {
		// `open ? DrawerForm : PlainForm` could be either at runtime — the
		// scan must not resolve it to the drawer form, and a body part under
		// it is a structural violation ('other' wrapper).
		writeFileSync(
			TEMPORARY_CONDITIONAL_MIXED_FORM_DRAWER_PATH,
			TEMPORARY_CONDITIONAL_MIXED_FORM_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_CONDITIONAL_MIXED_FORM_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_CONDITIONAL_MIXED_FORM_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_CONDITIONAL_MIXED_FORM_DRAWER_PATH);
		}
	});

	test('a let-reassigned form binding is unverifiable and reddens', () => {
		// `let Form = DrawerForm; if (x) Form = Other;` — the reassignment
		// makes the final binding not statically decidable; the aliased
		// initializer must not be silently trusted.
		writeFileSync(
			TEMPORARY_REASSIGNED_FORM_DRAWER_PATH,
			TEMPORARY_REASSIGNED_FORM_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_REASSIGNED_FORM_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_REASSIGNED_FORM_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_REASSIGNED_FORM_DRAWER_PATH);
		}
	});

	test('a nested return guarded by a literal true is the return that executes — its div reddens', () => {
		// Round 13's IMPORTANT 2, verbatim: `if (true) { return <div>...
		// </div>; } return <DrawerBody />;` — the old collector read only
		// the unreachable clean top-level return. The broken return lives
		// in the HELPER file: the call site has no part tags of its own, so
		// only the expansion through the return collector can redden it.
		writeFileSync(
			TEMPORARY_NESTED_RETURN_PARTS_PATH,
			TEMPORARY_NESTED_RETURN_PARTS_SOURCE,
		);
		writeFileSync(
			TEMPORARY_NESTED_RETURN_DIV_DRAWER_PATH,
			TEMPORARY_NESTED_RETURN_DIV_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_NESTED_RETURN_DIV_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_NESTED_RETURN_DIV_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_NESTED_RETURN_DIV_DRAWER_PATH);
			unlinkSync(TEMPORARY_NESTED_RETURN_PARTS_PATH);
		}
	});

	test('a nested return under a non-literal condition is still read — the broken branch reddens', () => {
		// Both branches can execute, so the union must include the
		// div-wrapped return; dropping nested returns would make this exact
		// shape green again (same cross-file isolation as above).
		writeFileSync(
			TEMPORARY_CONDITIONED_NESTED_RETURN_PARTS_PATH,
			TEMPORARY_CONDITIONED_NESTED_RETURN_PARTS_SOURCE,
		);
		writeFileSync(
			TEMPORARY_CONDITIONED_NESTED_RETURN_DRAWER_PATH,
			TEMPORARY_CONDITIONED_NESTED_RETURN_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_CONDITIONED_NESTED_RETURN_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_CONDITIONED_NESTED_RETURN_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_CONDITIONED_NESTED_RETURN_DRAWER_PATH);
			unlinkSync(TEMPORARY_CONDITIONED_NESTED_RETURN_PARTS_PATH);
		}
	});

	test('an idiomatic early-return body stays green when every return path is clean', () => {
		// The control for multi-return bodies: `if (isEmpty) return null;
		// return <DrawerBody />;` must not blanket-redden block bodies —
		// green with the collector reading every return path.
		writeFileSync(
			TEMPORARY_EARLY_RETURN_PARTS_PATH,
			TEMPORARY_EARLY_RETURN_PARTS_SOURCE,
		);
		writeFileSync(
			TEMPORARY_EARLY_RETURN_CLEAN_DRAWER_PATH,
			TEMPORARY_EARLY_RETURN_CLEAN_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_EARLY_RETURN_CLEAN_DRAWER_FILE),
			);
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_EARLY_RETURN_CLEAN_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_EARLY_RETURN_CLEAN_DRAWER_PATH);
			unlinkSync(TEMPORARY_EARLY_RETURN_PARTS_PATH);
		}
	});

	test('a part wrapped in an element INSIDE a cross-file helper reddens through the expansion at a clean call site', () => {
		// Round 13's IMPORTANT 3: the old negative carried the div at the
		// call site, so it stayed red even when the imported helper bodies
		// resolved to nothing. Here the div lives in the helper and the call
		// site's surface-to-form link is clean — ONLY the expansion can see
		// the break, so the test dies when cross-file resolution dies.
		writeFileSync(
			TEMPORARY_CROSSFILE_DIV_IN_HELPER_PATH,
			TEMPORARY_CROSSFILE_DIV_IN_HELPER_SOURCE,
		);
		writeFileSync(
			TEMPORARY_CROSSFILE_DIV_IN_HELPER_CALL_SITE_PATH,
			TEMPORARY_CROSSFILE_DIV_IN_HELPER_CALL_SITE_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_CROSSFILE_DIV_IN_HELPER_CALL_SITE_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_CROSSFILE_DIV_IN_HELPER_CALL_SITE_FILE),
			);
			// The div-wrapped helper is a structural violation by the
			// round-8 contract ("a helper that wraps the part in a real
			// element IS discovered and judged") — the call-site red comes
			// from the expansion, this one from the wrapper rule.
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_CROSSFILE_DIV_IN_HELPER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_CROSSFILE_DIV_IN_HELPER_CALL_SITE_PATH);
			unlinkSync(TEMPORARY_CROSSFILE_DIV_IN_HELPER_PATH);
		}
	});

	test('the clean counterpart of the div-in-helper pair stays green and is form-bearing only through the expansion', () => {
		// The positive of the pair: chain-preserving helpers, and the FORM
		// also comes from the helper — the call site's formBearing verdict
		// depends on the expansion, so this test dies under the same
		// "helpers resolve to nothing" mutation as the negative.
		writeFileSync(
			TEMPORARY_CROSSFILE_CLEAN_SECTIONS_PATH,
			TEMPORARY_CROSSFILE_CLEAN_SECTIONS_SOURCE,
		);
		writeFileSync(
			TEMPORARY_CROSSFILE_CLEAN_SECTIONS_CALL_SITE_PATH,
			TEMPORARY_CROSSFILE_CLEAN_SECTIONS_CALL_SITE_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_CROSSFILE_CLEAN_SECTIONS_CALL_SITE_FILE),
			);
			expect(scan.formBearing).toContain(
				fixtureRel(TEMPORARY_CROSSFILE_CLEAN_SECTIONS_CALL_SITE_FILE),
			);
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_CROSSFILE_CLEAN_SECTIONS_CALL_SITE_FILE),
			);
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_CROSSFILE_CLEAN_SECTIONS_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_CROSSFILE_CLEAN_SECTIONS_CALL_SITE_PATH);
			unlinkSync(TEMPORARY_CROSSFILE_CLEAN_SECTIONS_PATH);
		}
	});

	test('an unverifiable local tag anywhere in a discovered file reddens it, even outside the anchored subtree', () => {
		// The entry-point half of the fail-loud boundary: `const Mystery =
		// getSurface(); <Mystery />` next to a clean drawer could be a hidden
		// drawer marker — the file must redden even though no anchor walk
		// reaches the tag. Deleting the file-level unverifiable verdict
		// leaves this exact file green.
		writeFileSync(
			TEMPORARY_UNVERIFIABLE_TAG_DRAWER_PATH,
			TEMPORARY_UNVERIFIABLE_TAG_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_UNVERIFIABLE_TAG_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_UNVERIFIABLE_TAG_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_UNVERIFIABLE_TAG_DRAWER_PATH);
		}
	});

	test('a namespace member reached through a local alias of the namespace import is discovered and rejected', () => {
		// `const D = Drawer;` + `<D.DrawerContent>` — the member-expression
		// base is an identity chain too; the div between surface and form
		// must redden through the same entry-point resolution.
		writeFileSync(
			TEMPORARY_NS_BASE_ALIAS_DRAWER_PATH,
			TEMPORARY_NS_BASE_ALIAS_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_NS_BASE_ALIAS_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_NS_BASE_ALIAS_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_NS_BASE_ALIAS_DRAWER_PATH);
		}
	});

	test('a drawer whose parts resolve through a local object-literal component map is discovered and rejected', () => {
		// Round 15's BLOCKER 1, verbatim: `const Parts = { Surface:
		// DrawerContent, Form: DrawerForm, ... }` + `<Parts.Surface>` — the
		// member lookup must resolve the property's initializer through the
		// symbol graph to the drawer module, or the #990 div between the
		// surface and the form ships green.
		writeFileSync(
			TEMPORARY_OBJECT_NS_DRAWER_PATH,
			TEMPORARY_OBJECT_NS_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_OBJECT_NS_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_OBJECT_NS_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_OBJECT_NS_DRAWER_PATH);
		}
	});

	test('a drawer whose parts resolve through a cross-file export const shim is discovered and rejected', () => {
		// Round 15's BLOCKER 2, verbatim: a helper module binds the drawer
		// exports to local names (`export const Surface = DrawerContent;`)
		// and the call site imports THOSE. The identity chain must follow
		// the export's initializer across the file boundary — the #990 div
		// between the surface and the form reddens only then. The shim file
		// itself has no JSX and stays out of the inventory.
		writeFileSync(TEMPORARY_SHIM_PATH, TEMPORARY_SHIM_SOURCE);
		writeFileSync(
			TEMPORARY_SHIM_CALL_SITE_PATH,
			TEMPORARY_SHIM_CALL_SITE_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_SHIM_CALL_SITE_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_SHIM_CALL_SITE_FILE),
			);
			expect(scan.discovered).not.toContain(fixtureRel(TEMPORARY_SHIM_FILE));
			expect(scan.violations).not.toContain(fixtureRel(TEMPORARY_SHIM_FILE));
		} finally {
			unlinkSync(TEMPORARY_SHIM_CALL_SITE_PATH);
			unlinkSync(TEMPORARY_SHIM_PATH);
		}
	});

	test('a drawer whose every marker is an opaque local binding is discovered and rejected when the file imports the drawer module', () => {
		// Round 15's IMPORTANT 3, verbatim: `const Surface = pick(
		// DrawerContent);` — no tag resolves, so there are no anchors and no
		// call-site parts, but the file imports the drawer module and
		// carries unverifiable markers. That import is the discriminator: it
		// is a drawer file with an opaque marker, and the no-signal file
		// (`const Form = getForm();` with no drawer import anywhere) lacks
		// it, so the inventory does not flood.
		writeFileSync(TEMPORARY_OPAQUE_DRAWER_PATH, TEMPORARY_OPAQUE_DRAWER_SOURCE);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_OPAQUE_DRAWER_FILE),
			);
			expect(scan.violations).toContain(
				fixtureRel(TEMPORARY_OPAQUE_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_OPAQUE_DRAWER_PATH);
		}
	});

	test('a structurally perfect drawer that merely declares a lazy() component stays green', () => {
		// Round 15's IMPORTANT 5, verbatim: `const LazyChart = lazy(() =>
		// import('./chart'))` is a runtime component factory — a real local
		// component, not a marker — so the perfect drawer around it must
		// stay green. This is the green half of the paired proof: the
		// opaque fixture above is the red half, and both die when the
		// factory rule is removed (the lazy tag becomes unverifiable and
		// reddens the file).
		writeFileSync(TEMPORARY_LAZY_CHART_PATH, TEMPORARY_LAZY_CHART_SOURCE);
		writeFileSync(TEMPORARY_LAZY_DRAWER_PATH, TEMPORARY_LAZY_DRAWER_SOURCE);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(fixtureRel(TEMPORARY_LAZY_DRAWER_FILE));
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_LAZY_DRAWER_FILE),
			);
			expect(scan.discovered).not.toContain(
				fixtureRel(TEMPORARY_LAZY_CHART_FILE),
			);
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_LAZY_CHART_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_LAZY_DRAWER_PATH);
			unlinkSync(TEMPORARY_LAZY_CHART_PATH);
		}
	});

	test('a same-symbol-conditional drawer with a clean surface-to-form link stays green', () => {
		// Round 15's MINOR 6 — the missing control: every marker routed
		// through `isOpen ? DrawerX : DrawerX`, no intermediate element.
		// ONLY the same-symbol conditional resolution keeps this green;
		// kill that resolution and every marker becomes unverifiable and
		// the file reddens.
		writeFileSync(
			TEMPORARY_CONDITIONAL_SAME_SYMBOL_CLEAN_DRAWER_PATH,
			TEMPORARY_CONDITIONAL_SAME_SYMBOL_CLEAN_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_CONDITIONAL_SAME_SYMBOL_CLEAN_DRAWER_FILE),
			);
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_CONDITIONAL_SAME_SYMBOL_CLEAN_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_CONDITIONAL_SAME_SYMBOL_CLEAN_DRAWER_PATH);
		}
	});

	test('a return behind a literal-true branch that can never execute does not redden the call site', () => {
		// The literal-condition precision: the executing branch is clean and
		// the div-wrapped branch is dead code — the union without the
		// literal evaluation would redden the call site with a return that
		// can never execute.
		writeFileSync(
			TEMPORARY_LITERAL_DEAD_BRANCH_PARTS_PATH,
			TEMPORARY_LITERAL_DEAD_BRANCH_PARTS_SOURCE,
		);
		writeFileSync(
			TEMPORARY_LITERAL_DEAD_BRANCH_DRAWER_PATH,
			TEMPORARY_LITERAL_DEAD_BRANCH_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(
				fixtureRel(TEMPORARY_LITERAL_DEAD_BRANCH_DRAWER_FILE),
			);
			expect(scan.violations).not.toContain(
				fixtureRel(TEMPORARY_LITERAL_DEAD_BRANCH_DRAWER_FILE),
			);
		} finally {
			unlinkSync(TEMPORARY_LITERAL_DEAD_BRANCH_DRAWER_PATH);
			unlinkSync(TEMPORARY_LITERAL_DEAD_BRANCH_PARTS_PATH);
		}
	});

	test('SIGTERM runs the guard signal handlers, removes the temp directory and dies of the signal', async () => {
		// Round 13's IMPORTANT 4: `process.on('exit')` does not run when the
		// process dies on a signal, so the round-12 crash net leaked the
		// whole temp dir on SIGTERM — exactly how CI cancels a job. The
		// child below requires the guard's OWN drawer-guard-tmp-dir.cjs, so
		// this exercises the exact registration a cancelled run goes
		// through, and dies if the signal handlers are removed.
		// Round 17's IMPORTANT 5: the handlers used to `process.exit(1)`,
		// replacing the signal with a fabricated failure status. A run that
		// dies of the signal reports it as such — the exit event carries
		// code null and signal "SIGTERM" — so the child must be observed
		// dying of SIGTERM, not exiting with any invented code.
		const handled = await runSignalProbeChild(
			SIGNAL_PROBE_WITH_HANDLERS,
			'SIGTERM',
		);
		expect(existsSync(handled.dirPath)).toBe(false);
		expect(handled.exitSignal).toBe('SIGTERM');
		expect(handled.exitCode).toBeNull();

		// The control: the round-13 shape (exit handler only) really does
		// leak — the process dies on the signal and no handler runs. This
		// pins that the probe above is exercising the signal path, and
		// documents the defect the handlers close. A signal death is also
		// not a 0 exit.
		const leaked = await runSignalProbeChild(SIGNAL_PROBE_EXIT_ONLY, 'SIGTERM');
		try {
			expect(existsSync(leaked.dirPath)).toBe(true);
			expect(leaked.exitSignal).toBe('SIGTERM');
			expect(leaked.exitCode).toBeNull();
		} finally {
			rmSync(leaked.dirPath, { recursive: true, force: true });
		}
	});

	test('the inventory contains every real drawer surface file', () => {
		const expectedInventory = [
			...DRAWER_FORM_CALL_SITES.map((callSite) => callSite.sourceFile),
			...FORM_LESS_DRAWER_SURFACE_FILES,
		].sort();

		const scan = scanDrawerSurfaces();
		expect(scan.discovered).toEqual(expectedInventory);

		// The two inventory lists are NOT interchangeable: a file whose JSX
		// contains a DrawerForm tag is a form-bearing drawer and must be in
		// DRAWER_FORM_CALL_SITES (where the render tests + e2e openers run).
		// FORM_LESS_DRAWER_SURFACE_FILES has no render obligation at all, so
		// filing a form-bearing drawer there must fail — that is the exact
		// escape the unguarded list used to offer.
		expect(scan.formBearing).toEqual(
			DRAWER_FORM_CALL_SITES.map((callSite) => callSite.sourceFile).sort(),
		);
	});

	test('every real drawer surface keeps body and footer as direct children of the form or the surface', () => {
		expect(scanDrawerSurfaces().violations).toEqual([]);
	});

	for (const callSite of DRAWER_FORM_CALL_SITES) {
		test(`${callSite.name} keeps DrawerBody + DrawerFooter as direct children of the drawer form`, () => {
			renderDrawerByCallSiteId[callSite.id]();
			expectDrawerFormChain(callSite.drawerTestId);
		});
	}

	test('the drawer form wrapper preserves the general form inter-child spacing', () => {
		renderDrawerByCallSiteId['profile-create']();
		render(
			<div data-testid="general-form-spacing-reference">
				<SpacingReferenceForm />
			</div>,
		);

		const drawerForm = screen
			.getByTestId('profile-form-drawer')
			.querySelector('form.publy-drawer-form');
		const generalForm = screen
			.getByTestId('general-form-spacing-reference')
			.querySelector('form');
		expect(drawerForm).not.toBeNull();
		expect(generalForm).not.toBeNull();

		const spacingClasses = (className: string): string[] =>
			className
				.split(/\s+/)
				.filter((token) => token.startsWith('space-y-'))
				.sort();
		expect(spacingClasses(drawerForm?.className ?? '')).toEqual(
			spacingClasses(generalForm?.className ?? ''),
		);
	});

	test('app.css gives .publy-drawer-form the flex geometry as the highest-specificity unconditional rule', () => {
		const appCssSource = readFileSync(
			path.resolve(import.meta.dirname, '../../styles/app.css'),
			'utf8',
		);

		// Round 21's IMPORTANT 3: specificity decides the cascade winner, not
		// source order — a `.publy-drawer .publy-drawer-form` compound
		// declared BEFORE the plain `.publy-drawer-form` rule would still win,
		// and the old "last matching rule" assumption missed exactly that. The
		// ranking below stays scoped to the ALWAYS-applying selectors (a rule
		// nested in `@media`/`@supports` only applies within its own
		// condition, which is not decidable from source alone — see
		// `isNestedInConditionalAtRule`).
		//
		// Round 24's IMPORTANT 4 closes the conditional side BY CONSTRUCTION
		// at the source lane instead of sampling ever-more widths: a
		// conditional rule that targets the drawer form and changes its
		// geometry is a violation no matter which widths the browser lane
		// samples. The e2e spec (`e2e/drawer-form-scroll-geometry.spec.ts`)
		// verifies the real geometry at sampled viewports; this assertion
		// makes a new conditional override redden in the same run CI runs,
		// without a human remembering to add another width.
		const geometryEntry = findCascadeWinningSelector(
			appCssSource,
			'.publy-drawer-form',
		);
		expect(geometryEntry).not.toBeNull();
		expect(geometryEntry?.selector).toBe('.publy-drawer-form');

		const conditionalGeometryRules =
			findConditionalDrawerFormGeometryRules(appCssSource);
		expect(conditionalGeometryRules).toEqual([]);

		const applyParams = (geometryEntry?.rule.nodes ?? [])
			.filter(
				(node): node is AtRule =>
					node.type === 'atrule' && node.name === 'apply',
			)
			.flatMap((node) => node.params.trim().split(/\s+/));

		// Round 11's MINOR 6: the geometry is the PRESENCE of the four
		// utilities, not their order — reordering or extending the rule is
		// semantically identical CSS and must stay green. A deleted utility
		// still reddens.
		const requiredUtilities = ['flex', 'min-h-0', 'flex-1', 'flex-col'];
		expect(
			requiredUtilities.every((utility) => applyParams.includes(utility)),
		).toBe(true);
	});

	test('a conditional rule that changes the drawer form geometry is a violation at any width', () => {
		// Round 24's IMPORTANT 4 paired proof: the reviewer's exact escape —
		// `@media (min-width: 1025px) { .publy-drawer .publy-drawer-form {
		// display: block; } }` — is inactive at every committed browser sample
		// (600/900/1024) and higher-specificity at 1025px+, so a finite width
		// list can never cover it. The source lane closes it by construction:
		// the conditional geometry rule is detected and the fixture-style
		// assertion reddens. The control proves a conditional rule that does
		// NOT touch the geometry (padding only) is not a false positive.
		const breakingSource = `
@media (min-width: 1025px) {
	.publy-drawer .publy-drawer-form {
		display: block;
	}
}

.publy-drawer-form {
	@apply flex min-h-0 flex-1 flex-col;
}
`;
		expect(findConditionalDrawerFormGeometryRules(breakingSource)).toEqual([
			{
				atRule: '@media (min-width: 1025px)',
				selector: '.publy-drawer .publy-drawer-form',
			},
		]);

		const harmlessSource = `
@media (max-width: 639px) {
	.publy-drawer-form {
		padding: 0 10px;
	}
}

.publy-drawer-form {
	@apply flex min-h-0 flex-1 flex-col;
}
`;
		expect(findConditionalDrawerFormGeometryRules(harmlessSource)).toEqual([]);
	});

	test('a conditional rule that @applies a display utility is a violation at any width', () => {
		// Round 26's IMPORTANT 4, verbatim: the reviewer's mutation wrote
		// `@apply block` inside the media query. Round 24's finder compared
		// the @apply UTILITY tokens against CSS PROPERTY names — `block` is a
		// display utility, not the `display` property — so the rule was
		// invisible and the round-23 conditional escape shipped with the
		// real-CSS assertion still green. The @apply branch must resolve what
		// each utility actually sets (property against property), so
		// `@apply block` — and the geometry families (flex-direction,
		// min-height, overflow, flex) — redden, while a non-geometry utility
		// (`p-4`) and the flex/overflow tokens that are not geometry
		// (`flex-wrap`, `overflow-wrap-break-word`) stay green.
		const breakingSource = `
@media (min-width: 1025px) {
	.publy-drawer .publy-drawer-form {
		@apply block;
	}
}

.publy-drawer-form {
	@apply flex min-h-0 flex-1 flex-col;
}
`;
		expect(findConditionalDrawerFormGeometryRules(breakingSource)).toEqual([
			{
				atRule: '@media (min-width: 1025px)',
				selector: '.publy-drawer .publy-drawer-form',
			},
		]);

		// The rest of the geometry families are caught through the same
		// resolution, including an arbitrary-value utility, which names its
		// property directly.
		const geometryFamilySource = `
@media (min-width: 1025px) {
	.publy-drawer .publy-drawer-form {
		@apply flex-col min-h-0 overflow-hidden flex-1 [display:block];
	}
}

.publy-drawer-form {
	@apply flex min-h-0 flex-1 flex-col;
}
`;
		expect(
			findConditionalDrawerFormGeometryRules(geometryFamilySource),
		).toEqual([
			{
				atRule: '@media (min-width: 1025px)',
				selector: '.publy-drawer .publy-drawer-form',
			},
		]);

		// Non-geometry @apply utilities stay green — and the `flex-wrap`/
		// `overflow-wrap-*` tokens are resolved explicitly so the
		// `flex-`/`overflow-` prefixes do not false-positive on them.
		const harmlessSource = `
@media (max-width: 639px) {
	.publy-drawer-form {
		@apply p-4 flex-wrap overflow-wrap-break-word;
	}
}

.publy-drawer-form {
	@apply flex min-h-0 flex-1 flex-col;
}
`;
		expect(findConditionalDrawerFormGeometryRules(harmlessSource)).toEqual([]);
	});

	test('a conditional rule that @applies an unresolvable utility is a violation at any width', () => {
		// Round 28's IMPORTANT 6, verbatim: the reviewer's mutation wrote
		// `@apply sr-only` inside the media query. `sr-only` sets
		// `overflow: hidden` (and other layout properties), and
		// DRAWER_FORM_GEOMETRY_PROPERTIES includes `overflow` — but the
		// resolver returned `[]` for every token it did not recognize, so an
		// undecidable geometry fact read as "harmless" and the rule was
		// invisible. Resolution is now three-valued: a token the resolver
		// cannot resolve is a REPORT, while a token it can prove
		// non-geometry (an arbitrary value naming a non-geometry property,
		// `flex-wrap`, `overflow-wrap-*`, the padding/margin families) stays
		// green.
		const breakingSource = `
@media (min-width: 1025px) {
	.publy-drawer .publy-drawer-form {
		@apply sr-only;
	}
}

.publy-drawer-form {
	@apply flex min-h-0 flex-1 flex-col;
}
`;
		expect(findConditionalDrawerFormGeometryRules(breakingSource)).toEqual([
			{
				atRule: '@media (min-width: 1025px)',
				selector: '.publy-drawer .publy-drawer-form',
			},
		]);

		// Provably non-geometry utilities stay green: an arbitrary value
		// names its property directly, the explicit non-geometry tokens are
		// resolved, and the padding/margin families set only padding/margin.
		const harmlessSource = `
@media (max-width: 639px) {
	.publy-drawer-form {
		@apply p-4 px-2 flex-wrap overflow-wrap-break-word [text-align:center];
	}
}

.publy-drawer-form {
	@apply flex min-h-0 flex-1 flex-col;
}
`;
		expect(findConditionalDrawerFormGeometryRules(harmlessSource)).toEqual([]);
	});

	test('a higher-specificity unconditional rule declared earlier still wins the cascade ranking', () => {
		// Round 21's IMPORTANT 3 paired proof, verbatim shape from the
		// review: an earlier `.publy-drawer .publy-drawer-form` compound
		// (higher specificity) beats a LATER plain `.publy-drawer-form` rule
		// in the real cascade. The old "last matching rule" heuristic would
		// have picked the later, losing rule.
		const source = `
.publy-drawer .publy-drawer-form {
	display: block;
}

.publy-drawer-form {
	@apply flex min-h-0 flex-1 flex-col;
}
`;
		const winner = findCascadeWinningSelector(source, '.publy-drawer-form');
		expect(winner?.selector).toBe('.publy-drawer .publy-drawer-form');

		// The control: with equal specificity, source order breaks the tie —
		// the later plain rule wins over an earlier plain rule.
		const equalSpecificitySource = `
.publy-drawer-form {
	display: block;
}

.publy-drawer-form {
	@apply flex min-h-0 flex-1 flex-col;
}
`;
		const equalSpecificityWinner = findCascadeWinningSelector(
			equalSpecificitySource,
			'.publy-drawer-form',
		);
		expect(equalSpecificityWinner?.rule.toString()).toContain('@apply');

		// A rule nested in `@media`/`@supports` is excluded from the
		// unconditional ranking entirely, no matter its specificity — the
		// unconditional plain rule remains the reported winner.
		const conditionalSource = `
@media (min-width: 901px) {
	.publy-drawer .publy-drawer-form {
		display: block;
	}
}

.publy-drawer-form {
	@apply flex min-h-0 flex-1 flex-col;
}
`;
		const conditionalWinner = findCascadeWinningSelector(
			conditionalSource,
			'.publy-drawer-form',
		);
		expect(conditionalWinner?.selector).toBe('.publy-drawer-form');
	});
});
