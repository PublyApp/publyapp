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
 * One deliberate exception, round 14's BLOCKER 1: a local declaration whose
 * binding is an identity chain (`const Surface = DrawerContent;
 * const Form = DrawerForm; const Body = DrawerBody;`) is resolved to its
 * target BEFORE anchor discovery — the walk's entry point — and a local
 * binding the scan cannot classify (a call, a mixed-symbol conditional, a
 * reassigned `let`) is UNVERIFIABLE and reddens instead of silently not
 * being an anchor.
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
 * (round 14, BLOCKER 1): everything the scan cannot resolve statically —
 * at the walk roots and at the anchors themselves — is UNVERIFIABLE and
 * reddens the file, so a drawer whose geometry cannot be verified is never
 * silently green. The one remaining silent boundary is documented there
 * too: a file whose every drawer marker sits behind a binding with no
 * drawer signal at all (e.g. `const Form = getForm()` with nothing else
 * drawer-related in the file) is not discovered — nothing tells the scan
 * it is a drawer file.
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

import {
	existsSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { cleanup, render, screen } from '@testing-library/react';
import postcss from 'postcss';
import type { AtRule, Rule } from 'postcss';
import { createElement, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import {
	Project,
	SyntaxKind,
	ts,
	type ArrowFunction,
	type BinaryExpression,
	type Block,
	type CallExpression,
	type CaseClause,
	type CatchClause,
	type ConditionalExpression,
	type DoStatement,
	type FinallyClause,
	type ForInStatement,
	type ForOfStatement,
	type ForStatement,
	type FunctionDeclaration,
	type IfStatement,
	type JsxElement,
	type JsxExpression,
	type JsxFragment,
	type JsxOpeningElement,
	type JsxSelfClosingElement,
	type LabeledStatement,
	type Node,
	type PrefixUnaryExpression,
	type PropertyAccessExpression,
	type ReturnStatement,
	type SourceFile,
	type Statement,
	type SwitchStatement,
	type TryStatement,
	type VariableDeclaration,
	type WhileStatement,
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
}));

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

vi.mock('~/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: () => false,
}));

vi.mock('~/lib/query/staff-tenants', () => ({
	invalidateAllStaffTenantScopes: () => Promise.resolve(),
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

import { ChangeStaffUserEmailDialog } from '../../routes/authed/staff/staff-users/_change-email-dialog';
import { InviteTenantUserDrawer } from '../../routes/authed/staff/tenants/$tenantId/_invite-user-drawer';
import { ProfileEditDetailsDrawer } from '../../routes/authed/staff/tenants/$tenantId/profiles/_profile-edit-details-drawer';
import { ProfileFormDrawer } from '../../routes/authed/staff/tenants/$tenantId/profiles/_profile-form-drawer';

const noop = () => undefined;

const FRONT_ROOT = path.resolve(import.meta.dirname, '../../..');
const DRAWER_MODULE_RELATIVE_PATH = 'src/components/ui/drawer.tsx';
const DRAWER_MODULE_PATH = path.join(FRONT_ROOT, DRAWER_MODULE_RELATIVE_PATH);
const RE_EXPORT_CHAIN_DEPTH_LIMIT = 6;

// Round 11's IMPORTANT 3: the fixture files must NOT live under
// `apps/front/src`. The guard writes and deletes them mid-suite, and a
// parallel src-wide scanner (i18n-key-coverage.test.ts) lists src files and
// then reads each one — a fixture deleted between the list and the read is
// an ENOENT that reddens an innocent suite (reproduced at HEAD in round 11:
// five i18n tests red). They live in a per-run temp directory instead,
// created once here and removed on every exit path: the afterAll below,
// plus a synchronous process 'exit' net so a crashed or failed run still
// cleans up (a sibling guard leaked 60,000 /tmp directories once; this
// directory must never do the same).
const FIXTURE_TMP_DIR = mkdtempSync(path.join(tmpdir(), 'publy-drawer-guard-'));
process.on('exit', () => {
	rmSync(FIXTURE_TMP_DIR, { recursive: true, force: true });
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
// is not the binding the JSX tag sees, so the file is unverifiable.
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

type ModuleResolution = {
	compilerOptions: ts.CompilerOptions;
	host: ts.ModuleResolutionHost;
};

const toPortableSourcePath = (filePath: string): string =>
	path.relative(FRONT_ROOT, filePath).split(path.sep).join('/');

// The scan's ts-morph Project is expensive to construct (tsconfig parse,
// module-resolution host) and the per-file ASTs dominate the rest of the
// work, so ONE project is shared by every scanDrawerSurfaces() call in the
// suite. Fixture files are written and deleted between scans, so each scan
// reconciles the shared project against the current on-disk file set
// instead of rebuilding it (round 10's MINOR 4 — the suite was paying one
// full-src parse per assertion).
let sharedScanProject: Project | null = null;

const getScanProject = (): Project => {
	if (!sharedScanProject) {
		sharedScanProject = new Project({
			tsConfigFilePath: path.join(FRONT_ROOT, 'tsconfig.json'),
			skipAddingFilesFromTsConfig: true,
		});
	}
	return sharedScanProject;
};

const walkSrcTsxFiles = (): string[] => {
	const results: string[] = [];
	const walk = (dir: string): void => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const fullPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(fullPath);
			} else if (entry.isFile() && entry.name.endsWith('.tsx')) {
				results.push(fullPath);
			}
		}
	};
	walk(path.join(FRONT_ROOT, 'src'));
	// Fixtures live in a per-run temp directory outside src (round 11's
	// IMPORTANT 3 — see FIXTURE_TMP_DIR), so the scan reconciles that
	// directory alongside the real tree.
	walk(FIXTURE_TMP_DIR);
	return results;
};

// Round 11's MINOR 5: the shared project never re-reads a path it has
// parsed — `addSourceFileAtPathIfExists` on an already-loaded path returns
// the cached SourceFile, so a fixture rewritten between scans (same path,
// new content) was scanned as its old self: a silent false negative. The
// reconcile below refreshes exactly the files whose (size, mtime) changed —
// unchanged files cost one stat per scan, changed files are re-read from
// disk, and the 35651a2c perf win (one project, no full re-parse) survives.
const sourceFileFreshness = new Map<string, string>();

const reconcileScanProject = (
	project: Project,
	desiredFilePaths: Set<string>,
): void => {
	for (const sourceFile of project.getSourceFiles()) {
		const filePath = sourceFile.getFilePath();
		if (!desiredFilePaths.has(filePath)) {
			project.removeSourceFile(sourceFile);
			sourceFileFreshness.delete(filePath);
		}
	}
	for (const filePath of desiredFilePaths) {
		const stat = statSync(filePath, { bigint: true });
		const stamp = `${stat.size}:${stat.mtimeNs}`;
		if (sourceFileFreshness.get(filePath) === stamp) {
			continue;
		}
		const existing = project.getSourceFile(filePath);
		if (existing) {
			existing.refreshFromFileSystemSync();
		} else {
			project.addSourceFileAtPathIfExists(filePath);
		}
		sourceFileFreshness.set(filePath, stamp);
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

/**
 * Follows `exportName` from `moduleSpecifier` (imported from `fromFilePath`)
 * through at most RE_EXPORT_CHAIN_DEPTH_LIMIT hops of re-export barrels and
 * returns the name under which the drawer module itself exports the symbol —
 * the ORIGINAL name once every alias hop has been undone. Returns null when
 * the chain does not terminate at the drawer module (including hops that
 * cannot be resolved: a hop that cannot be resolved is not the drawer
 * module, so this fails closed). Resolution is bounded and memoized per
 * (module, export) pair in `visited`, so a barrel cycle terminates.
 *
 * A hop matches by the name the barrel's consumers see
 * (`getAliasNode() ?? getName()`), and recurses with the name the next
 * module must export — so `export { DrawerBody as Body } from './drawer'`
 * followed as `Body` continues as `DrawerBody`, and only a chain that ends
 * at the drawer module actually exporting `DrawerBody` counts.
 */
const resolveDrawerSymbol = (
	fromFilePath: string,
	moduleSpecifier: string,
	exportName: string,
	moduleResolution: ModuleResolution,
	project: Project,
	visited: Set<string> = new Set(),
	depth = 0,
	moduleCache: Map<string, string | null> = new Map(),
): string | null => {
	if (depth >= RE_EXPORT_CHAIN_DEPTH_LIMIT) {
		return null;
	}

	// `ts.resolveModuleName` is filesystem work; the resolution of a
	// (file, specifier) pair is the same for every export name, so it is
	// memoized for the whole scan.
	const cacheKey = `${fromFilePath}|${moduleSpecifier}`;
	let resolved = moduleCache.get(cacheKey);
	if (resolved === undefined) {
		resolved =
			ts.resolveModuleName(
				moduleSpecifier,
				fromFilePath,
				moduleResolution.compilerOptions,
				moduleResolution.host,
			).resolvedModule?.resolvedFileName ?? null;
		moduleCache.set(cacheKey, resolved);
	}
	if (!resolved) {
		return null;
	}
	if (path.resolve(resolved) === DRAWER_MODULE_PATH) {
		return drawerModuleExports(project, exportName) ? exportName : null;
	}
	// A drawer re-export barrel is a repo-local file — a node_modules module
	// can never re-export the drawer module's symbols, so it is not the
	// drawer and the chain ends here. Skipping the parse is what keeps this
	// resolution cheap enough to run for every tag name in every file.
	if (resolved.includes(`${path.sep}node_modules${path.sep}`)) {
		return null;
	}

	const visitedKey = `${resolved}:${exportName}`;
	if (visited.has(visitedKey)) {
		return null;
	}
	visited.add(visitedKey);

	const reExportingFile = project.addSourceFileAtPath(resolved);
	for (const exportDeclaration of reExportingFile.getExportDeclarations()) {
		const reExportSpecifier = exportDeclaration.getModuleSpecifierValue();
		const namedExports = exportDeclaration.getNamedExports();

		if (reExportSpecifier) {
			if (
				namedExports.length === 0 &&
				!exportDeclaration.getNamespaceExport()
			) {
				// `export * from '...'` — forwards every named export unchanged.
				const result = resolveDrawerSymbol(
					resolved,
					reExportSpecifier,
					exportName,
					moduleResolution,
					project,
					visited,
					depth + 1,
					moduleCache,
				);
				if (result) {
					return result;
				}
				continue;
			}
			const namespaceExport = exportDeclaration.getNamespaceExport();
			if (namespaceExport) {
				// `export * as X from '...'` — the namespace re-exports every
				// member of the target module under X, so a member lookup
				// through a base binding that resolves to this barrel
				// forwards to the target module regardless of the namespace
				// name X (round 9's MINOR 3).
				const result = resolveDrawerSymbol(
					resolved,
					reExportSpecifier,
					exportName,
					moduleResolution,
					project,
					visited,
					depth + 1,
					moduleCache,
				);
				if (result) {
					return result;
				}
				continue;
			}
			for (const specifier of namedExports) {
				if (
					(specifier.getAliasNode()?.getText() ?? specifier.getName()) !==
					exportName
				) {
					continue;
				}
				const result = resolveDrawerSymbol(
					resolved,
					reExportSpecifier,
					specifier.getName(),
					moduleResolution,
					project,
					visited,
					depth + 1,
					moduleCache,
				);
				if (result) {
					return result;
				}
			}
			continue;
		}

		// `export { X as Y }` without a specifier re-exports a symbol bound in
		// this file (usually imported) — follow that binding's import instead.
		for (const specifier of namedExports) {
			if (
				(specifier.getAliasNode()?.getText() ?? specifier.getName()) !==
				exportName
			) {
				continue;
			}
			const originalName = specifier.getName();
			for (const declaration of reExportingFile.getImportDeclarations()) {
				for (const namedImport of declaration.getNamedImports()) {
					if (
						(namedImport.getAliasNode()?.getText() ?? namedImport.getName()) !==
						originalName
					) {
						continue;
					}
					const result = resolveDrawerSymbol(
						resolved,
						declaration.getModuleSpecifierValue(),
						namedImport.getName(),
						moduleResolution,
						project,
						visited,
						depth + 1,
						moduleCache,
					);
					if (result) {
						return result;
					}
				}
			}
		}
	}

	return null;
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
 * Resolves a name that is NOT locally declared in `sourceFile` through
 * the import machinery — direct import, alias (`DrawerForm as Form`) and
 * re-export barrels (including aliased re-exports), the same chain the
 * wrapper check uses. Null when the name is not an import of the drawer
 * module's symbol (including an import that cannot be resolved, which
 * fails closed).
 */
const resolveImportedName = (
	sourceFile: SourceFile,
	name: string,
	moduleResolution: ModuleResolution,
	project: Project,
	moduleCache: Map<string, string | null>,
): string | null => {
	for (const declaration of sourceFile.getImportDeclarations()) {
		for (const namedImport of declaration.getNamedImports()) {
			const localName =
				namedImport.getAliasNode()?.getText() ?? namedImport.getName();
			if (localName !== name) {
				continue;
			}
			return resolveDrawerSymbol(
				sourceFile.getFilePath(),
				declaration.getModuleSpecifierValue(),
				namedImport.getName(),
				moduleResolution,
				project,
				undefined,
				0,
				moduleCache,
			);
		}
	}
	return null;
};

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
			if (binaryExpression.getOperatorToken() === SyntaxKind.EqualsToken) {
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

/**
 * Resolves a locally-declared name as a MEMBER-EXPRESSION base — the
 * `Drawer` in `<Drawer.DrawerBody />` — through identity chains before
 * the normal base resolution: `const D = Drawer; <D.DrawerBody />` is
 * the same alias the tag-name machinery resolves, so a same-named local
 * base is only a shadow when its own binding is statically a local value
 * (an object, a component). A base the scan cannot classify is
 * UNVERIFIABLE. The terminal name runs the normal base path: namespace
 * import, or a named binding of a namespace re-export barrel.
 */
const resolveMemberAccessName = (
	sourceFile: SourceFile,
	baseName: string,
	memberName: string,
	moduleResolution: ModuleResolution,
	project: Project,
	moduleCache: Map<string, string | null>,
	declaredNamesByFile: Map<string, Set<string>>,
	reassignedNamesByFile: Map<string, Set<string>>,
): DrawerTagNameResult => {
	if (isLocallyDeclared(sourceFile, baseName, declaredNamesByFile)) {
		const terminal = resolveLocalBaseChainTerminal(
			sourceFile,
			baseName,
			declaredNamesByFile,
			reassignedNamesByFile,
		);
		if (terminal === null) {
			return null;
		}
		if (terminal === UNVERIFIABLE_TAG) {
			return UNVERIFIABLE_TAG;
		}
		baseName = terminal;
	}
	let namespaceSpecifier = resolveNamespaceImport(sourceFile, baseName);
	if (!namespaceSpecifier) {
		// A member-expression base that is a NAMED binding (round 9's
		// MINOR 3): `import { Drawer } from '...'` where the barrel
		// re-exports the drawer module as a namespace
		// (`export * as Drawer from './drawer'`). Follow the binding
		// like any named import; the chain resolver forwards the member
		// through the barrel's namespace re-export.
		for (const declaration of sourceFile.getImportDeclarations()) {
			for (const namedImport of declaration.getNamedImports()) {
				const localName =
					namedImport.getAliasNode()?.getText() ?? namedImport.getName();
				if (localName !== baseName) {
					continue;
				}
				namespaceSpecifier = declaration.getModuleSpecifierValue();
			}
		}
		if (!namespaceSpecifier) {
			return null;
		}
	}
	return resolveDrawerSymbol(
		sourceFile.getFilePath(),
		namespaceSpecifier,
		memberName,
		moduleResolution,
		project,
		undefined,
		0,
		moduleCache,
	);
};

/**
 * Follows a locally-declared name used as a member-expression base
 * through identity chains to the terminal name that is NOT locally
 * declared. Returns null when the chain ends at a real local value (an
 * object literal, a component) — its member is this file's own, never
 * the drawer module's — and UNVERIFIABLE when the chain cannot be
 * decided (a call, a reassigned `let`, a cycle).
 */
const resolveLocalBaseChainTerminal = (
	sourceFile: SourceFile,
	name: string,
	declaredNamesByFile: Map<string, Set<string>>,
	reassignedNamesByFile: Map<string, Set<string>>,
	seen: Set<string> = new Set(),
): string | null | typeof UNVERIFIABLE_TAG => {
	if (seen.has(name)) {
		return UNVERIFIABLE_TAG;
	}
	seen.add(name);
	if (!isLocallyDeclared(sourceFile, name, declaredNamesByFile)) {
		return name;
	}
	if (isReassigned(sourceFile, name, reassignedNamesByFile)) {
		return UNVERIFIABLE_TAG;
	}
	const declaration = findLocalComponentDeclaration(sourceFile, name);
	if (!declaration) {
		return null;
	}
	if (declaration.getKind() !== SyntaxKind.VariableDeclaration) {
		return null;
	}
	const initializer = (declaration as VariableDeclaration).getInitializer();
	if (!initializer) {
		return UNVERIFIABLE_TAG;
	}
	const unwrapped = unwrapExpression(initializer);
	const kind = unwrapped.getKind();
	if (kind === SyntaxKind.Identifier) {
		return resolveLocalBaseChainTerminal(
			sourceFile,
			unwrapped.getText(),
			declaredNamesByFile,
			reassignedNamesByFile,
			seen,
		);
	}
	if (
		kind === SyntaxKind.ObjectLiteralExpression ||
		kind === SyntaxKind.ArrayLiteralExpression ||
		kind === SyntaxKind.JsxElement ||
		kind === SyntaxKind.JsxSelfClosingElement ||
		kind === SyntaxKind.JsxFragment ||
		kind === SyntaxKind.ArrowFunction ||
		kind === SyntaxKind.FunctionExpression ||
		kind === SyntaxKind.ClassExpression
	) {
		return null;
	}
	return UNVERIFIABLE_TAG;
};

/**
 * Resolves a locally-declared name used as a JSX tag. The declaration's
 * binding is followed exactly like an import when it is statically an
 * alias (see resolveAliasExpression); a real local component (arrow,
 * JSX body, memo/forwardRef) is null — the drawer module's symbols are
 * never this file's own components, and the anchored walk expands those
 * through resolveComponentDefinition. Anything else — a call, a mixed
 * conditional, a reassigned `let`, a missing initializer — is
 * UNVERIFIABLE: the tag COULD be a drawer marker the walk keys its entry
 * on, so it must redden rather than silently not be an anchor.
 */
const resolveLocallyDeclaredName = (
	sourceFile: SourceFile,
	name: string,
	moduleResolution: ModuleResolution,
	project: Project,
	moduleCache: Map<string, string | null>,
	declaredNamesByFile: Map<string, Set<string>>,
	reassignedNamesByFile: Map<string, Set<string>>,
	seen: Set<string> = new Set(),
): DrawerTagNameResult => {
	if (seen.has(name)) {
		return UNVERIFIABLE_TAG;
	}
	seen.add(name);
	if (isReassigned(sourceFile, name, reassignedNamesByFile)) {
		return UNVERIFIABLE_TAG;
	}
	const declaration = findLocalComponentDeclaration(sourceFile, name);
	if (!declaration) {
		return null;
	}
	const kind = declaration.getKind();
	if (
		kind === SyntaxKind.FunctionDeclaration ||
		kind === SyntaxKind.ClassDeclaration
	) {
		// A real local component — not the drawer module's symbol; the
		// anchored walk expands it (and reddens it when its body is not
		// statically walkable).
		return null;
	}
	const initializer = (declaration as VariableDeclaration).getInitializer();
	if (!initializer) {
		return UNVERIFIABLE_TAG;
	}
	return resolveAliasExpression(
		sourceFile,
		initializer,
		moduleResolution,
		project,
		moduleCache,
		declaredNamesByFile,
		reassignedNamesByFile,
		seen,
	);
};

/**
 * Classifies an expression as an alias of the drawer module's symbols or
 * as a statically-decidable non-drawer value. Identifier chains follow
 * local declarations recursively (`const Form = DrawerForm`,
 * `const Form = Inner; const Inner = DrawerForm;`), and a
 * member-expression aliases a namespace member (`const Form =
 * Drawer.DrawerForm`). A conditional is resolved branch by branch: both
 * branches resolving to the SAME drawer symbol is an alias; both to
 * non-drawer values is a local value; anything mixed or unresolvable is
 * UNVERIFIABLE. A statically-decidable component body is a local
 * component (null); a bare value (null, a string, an object literal) is
 * not a drawer marker (null); everything else cannot be classified and
 * fails loud.
 */
const resolveAliasExpression = (
	sourceFile: SourceFile,
	expression: Node,
	moduleResolution: ModuleResolution,
	project: Project,
	moduleCache: Map<string, string | null>,
	declaredNamesByFile: Map<string, Set<string>>,
	reassignedNamesByFile: Map<string, Set<string>>,
	seen: Set<string>,
): DrawerTagNameResult => {
	const unwrapped = unwrapExpression(expression);
	const kind = unwrapped.getKind();
	if (kind === SyntaxKind.Identifier) {
		const targetName = unwrapped.getText();
		if (isLocallyDeclared(sourceFile, targetName, declaredNamesByFile)) {
			return resolveLocallyDeclaredName(
				sourceFile,
				targetName,
				moduleResolution,
				project,
				moduleCache,
				declaredNamesByFile,
				reassignedNamesByFile,
				seen,
			);
		}
		return resolveImportedName(
			sourceFile,
			targetName,
			moduleResolution,
			project,
			moduleCache,
		);
	}
	if (kind === SyntaxKind.PropertyAccessExpression) {
		const property = unwrapped as PropertyAccessExpression;
		return resolveMemberAccessName(
			sourceFile,
			property.getExpression().getText(),
			property.getName(),
			moduleResolution,
			project,
			moduleCache,
			declaredNamesByFile,
			reassignedNamesByFile,
		);
	}
	if (kind === SyntaxKind.ConditionalExpression) {
		const conditional = unwrapped as ConditionalExpression;
		// Each branch gets its own copy of the cycle set: resolving the
		// same local name in both branches is normal, not a cycle.
		const whenTrue = resolveAliasExpression(
			sourceFile,
			conditional.getWhenTrue(),
			moduleResolution,
			project,
			moduleCache,
			declaredNamesByFile,
			reassignedNamesByFile,
			new Set(seen),
		);
		const whenFalse = resolveAliasExpression(
			sourceFile,
			conditional.getWhenFalse(),
			moduleResolution,
			project,
			moduleCache,
			declaredNamesByFile,
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
	const body = extractComponentBody(unwrapped);
	if (body) {
		// A statically-decidable component (arrow, JSX body, memo,
		// forwardRef, ...) — a real local component, not a marker.
		return null;
	}
	return UNVERIFIABLE_TAG;
};

/**
 * Resolves a JSX tag's local name to the name the drawer module exports it
 * under, or null when the tag is NOT the drawer module's symbol — through
 * the same chain every wrapper goes through: direct import, alias
 * (`DrawerBody as Body`), namespace member (`Drawer.DrawerBody` where the
 * base is a namespace import or a named binding of a namespace re-export),
 * and re-export barrels including aliased re-exports. A same-named local
 * declaration no longer ends resolution (round 14, BLOCKER 1): identity
 * alias chains and same-symbol conditionals are resolved to their targets,
 * and a local binding the scan cannot classify is UNVERIFIABLE — it might
 * be a drawer marker the anchored walk keys its entry on, so it must fail
 * loud instead of silently not being an anchor. An import that cannot be
 * resolved is null (fail-closed). Discovery uses the same machinery as the
 * wrapper check, so there is no import spelling that the scan can miss
 * while the wrapper check accepts.
 */
const resolveDrawerTagName = (
	sourceFile: SourceFile,
	tagText: string,
	moduleResolution: ModuleResolution,
	project: Project,
	moduleCache: Map<string, string | null>,
	declaredNamesByFile: Map<string, Set<string>>,
	reassignedNamesByFile: Map<string, Set<string>>,
): DrawerTagNameResult => {
	const namespaceMatch = tagText.match(
		/^([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)$/,
	);
	if (namespaceMatch) {
		return resolveMemberAccessName(
			sourceFile,
			namespaceMatch[1],
			namespaceMatch[2],
			moduleResolution,
			project,
			moduleCache,
			declaredNamesByFile,
			reassignedNamesByFile,
		);
	}

	if (isLocallyDeclared(sourceFile, tagText, declaredNamesByFile)) {
		return resolveLocallyDeclaredName(
			sourceFile,
			tagText,
			moduleResolution,
			project,
			moduleCache,
			declaredNamesByFile,
			reassignedNamesByFile,
		);
	}

	return resolveImportedName(
		sourceFile,
		tagText,
		moduleResolution,
		project,
		moduleCache,
	);
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

/**
 * The nearest element that actually contains the body/footer tag in the DOM
 * sense: fragments, JSX expressions and the other kinds below create no
 * node, so they are skipped — and so are the nodeless React wrappers. Any
 * other kind of ancestor means the tag is not directly inside an element,
 * which the caller treats as a structural violation. A null result means no
 * enclosing element exists at all in the file, i.e. the tag sits inside a
 * component DEFINITION (a composition helper) rather than at a drawer call
 * site.
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
			if (isNodelessReactWrapper(openingElement, sourceFile)) {
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
	sourceFile: SourceFile,
	tagText: string,
	moduleResolution: ModuleResolution,
	project: Project,
	moduleCache: Map<string, string | null>,
	declaredNamesByFile: Map<string, Set<string>>,
	reassignedNamesByFile: Map<string, Set<string>>,
): 'drawer-form' | 'drawer-content' | 'other' => {
	const name = resolveDrawerTagName(
		sourceFile,
		tagText,
		moduleResolution,
		project,
		moduleCache,
		declaredNamesByFile,
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
	drawerTagName: (
		sourceFile: SourceFile,
		tagText: string,
	) => DrawerTagNameResult;
	definitionCache: Map<string, Map<string, DrawerSectionDefinition | null>>;
};

const isNodeModulesFilePath = (filePath: string): boolean =>
	filePath.includes(`${path.sep}node_modules${path.sep}`);

const resolveModuleFilePath = (
	fromFilePath: string,
	moduleSpecifier: string,
	moduleResolution: ModuleResolution,
	moduleCache: Map<string, string | null>,
): string | null => {
	const cacheKey = `${fromFilePath}|${moduleSpecifier}`;
	let resolved = moduleCache.get(cacheKey);
	if (resolved === undefined) {
		resolved =
			ts.resolveModuleName(
				moduleSpecifier,
				fromFilePath,
				moduleResolution.compilerOptions,
				moduleResolution.host,
			).resolvedModule?.resolvedFileName ?? null;
		moduleCache.set(cacheKey, resolved);
	}
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
				const finallyCollected = collectStatementReturns(
					(finallyBlock as FinallyClause).getBlock().getStatements(),
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
			kind === SyntaxKind.ForStatement ||
			kind === SyntaxKind.ForInStatement ||
			kind === SyntaxKind.ForOfStatement ||
			kind === SyntaxKind.WhileStatement ||
			kind === SyntaxKind.DoStatement
		) {
			const loopBody = (
				statement as Node & { getStatement(): Statement }
			).getStatement();
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
	for (const declaration of sourceFile.getFunctions()) {
		if (declaration.getName() === name) {
			return declaration;
		}
	}
	for (const declaration of sourceFile.getClasses()) {
		if (declaration.getName() === name) {
			return declaration;
		}
	}
	for (const declaration of sourceFile.getVariableDeclarations()) {
		if (declaration.getName() === name) {
			return declaration;
		}
	}
	return null;
};

const findLocalExportInModule = (
	file: SourceFile,
	name: string,
): Node | null => {
	if (name === 'default') {
		const exportAssignment = file.getExportAssignments()[0];
		if (exportAssignment) {
			return exportAssignment.getExpression();
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
	const filePath = sourceFile.getFilePath();
	let byName = context.definitionCache.get(filePath);
	if (!byName) {
		byName = new Map<string, DrawerSectionDefinition | null>();
		context.definitionCache.set(filePath, byName);
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
	const drawerName = context.drawerTagName(sourceFile, tagText);

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
	if (isNodelessReactWrapper(opening, sourceFile)) {
		// Fragment/Suspense/StrictMode imported from react — no DOM node, so
		// the walk passes through without a chain element.
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

const scanDrawerSurfaces = (): {
	discovered: string[];
	violations: string[];
	formBearing: string[];
} => {
	const project = getScanProject();
	// Reconcile the shared project with the current on-disk file set: a
	// fixture written for an earlier assertion and deleted since must not
	// linger as a loaded source file, and a fixture on disk now but never
	// loaded must be added. Real files are loaded once and reused; a file
	// rewritten in place between scans is refreshed from disk (round 11's
	// MINOR 5).
	const desiredFilePaths = new Set(walkSrcTsxFiles());
	reconcileScanProject(project, desiredFilePaths);
	const moduleResolution: ModuleResolution = {
		compilerOptions: project.getCompilerOptions(),
		host: project.getModuleResolutionHost(),
	};

	// Per-file memo of tag text -> drawer export name, so the 6-hop chain
	// resolution runs once per distinct name instead of once per tag, and a
	// scan-wide memo of resolved (file, specifier) pairs for the module
	// resolution inside the chain.
	const resolvedTagNames = new Map<string, Map<string, DrawerTagNameResult>>();
	const moduleCache = new Map<string, string | null>();
	const declaredNamesByFile = new Map<string, Set<string>>();
	const reassignedNamesByFile = new Map<string, Set<string>>();
	const drawerTagName = (
		sourceFile: SourceFile,
		tagText: string,
	): DrawerTagNameResult => {
		let byName = resolvedTagNames.get(sourceFile.getFilePath());
		if (!byName) {
			byName = new Map<string, DrawerTagNameResult>();
			resolvedTagNames.set(sourceFile.getFilePath(), byName);
		}
		if (!byName.has(tagText)) {
			byName.set(
				tagText,
				resolveDrawerTagName(
					sourceFile,
					tagText,
					moduleResolution,
					project,
					moduleCache,
					declaredNamesByFile,
					reassignedNamesByFile,
				),
			);
		}
		return byName.get(tagText) ?? null;
	};

	const discovered: string[] = [];
	const violations: string[] = [];
	const formBearing: string[] = [];

	for (const sourceFile of project.getSourceFiles()) {
		if (/\.(?:spec|test)\.tsx$/.test(sourceFile.getBaseName())) {
			continue;
		}

		const jsxTags = [
			...sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
			...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
		];

		// Round 14, BLOCKER 1: a tag whose local binding cannot be classified
		// statically (a call, a mixed conditional, a reassigned `let`, ...)
		// could be a drawer marker the walk keys its entry on — in a drawer
		// file it must fail loud instead of silently not being an anchor. A
		// file with ONLY such tags is not discovered at all: it never was,
		// and treating every unresolvable local component as a drawer file
		// would flood the inventory.
		const hasUnverifiableTag = jsxTags.some(
			(node) =>
				drawerTagName(sourceFile, node.getTagNameNode().getText()) ===
				UNVERIFIABLE_TAG,
		);

		const wrapperOf = (node: JsxOpeningElement | JsxSelfClosingElement) =>
			findWrapperOpeningElement(node, sourceFile);

		const partNodes = jsxTags.filter((node) => {
			const tagText = node.getTagNameNode().getText();
			const name = drawerTagName(sourceFile, tagText);
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
			(node) =>
				drawerTagName(sourceFile, node.getTagNameNode().getText()) ===
				'DrawerForm',
		);
		const surfaceNodes = jsxTags.filter(
			(node) =>
				drawerTagName(sourceFile, node.getTagNameNode().getText()) ===
				'DrawerContent',
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
				definitionCache: new Map(),
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
					sourceFile,
					wrapper.getTagNameNode().getText(),
					moduleResolution,
					project,
					moduleCache,
					declaredNamesByFile,
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

		if (
			anchorElements.length === 0 &&
			callSitePartNodes.length === 0 &&
			callSiteFormNodes.length === 0
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
				sourceFile,
				wrapper.getTagNameNode().getText(),
				moduleResolution,
				project,
				moduleCache,
				declaredNamesByFile,
				reassignedNamesByFile,
			);
			return binding !== 'drawer-form' && binding !== 'drawer-content';
		});

		if (
			isRejected ||
			formLinkBroken ||
			walkState.unverifiable ||
			hasUnverifiableTag ||
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

const renderDrawerByCallSiteId: Record<DrawerFormCallSiteId, () => void> = {
	'profile-create': () => {
		render(
			<ProfileFormDrawer
				tenantId="tenant-1"
				isOpen
				onOpenChange={noop}
				onSaved={noop}
				onSessionExpired={noop}
			/>,
		);
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
};

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

afterEach(cleanup);

// Round 11's IMPORTANT 3 — the fixture directory must be gone when the suite
// is done, on every exit path. The assertion proves the afterAll cleanup
// actually ran; the process 'exit' net above covers crashes and aborts.
afterAll(() => {
	rmSync(FIXTURE_TMP_DIR, { recursive: true, force: true });
	expect(existsSync(FIXTURE_TMP_DIR)).toBe(false);
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
		// same temp path" silently scanned the first content twice. The
		// freshness-tracking reconcile must re-read the rewritten fixture.
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

	test('a chain terminating at the drawer module is only resolved for names the drawer module actually exports', () => {
		// Pins the terminal `drawerModuleExports` gate in resolveDrawerSymbol
		// (round 9's MINOR 2): a resolved chain that reaches the drawer
		// module with a name the module does not export is null, not the
		// name. No fixture can exercise that verdict — every fixture import
		// that terminates at the drawer module does so with a name it
		// genuinely exports, and the literal-text part fallback neutralizes
		// the rest — so the pin drives resolveDrawerSymbol directly.
		const project = getScanProject();
		project.addSourceFileAtPathIfExists(DRAWER_MODULE_PATH);
		const moduleResolution: ModuleResolution = {
			compilerOptions: project.getCompilerOptions(),
			host: project.getModuleResolutionHost(),
		};

		expect(
			resolveDrawerSymbol(
				DRAWER_MODULE_PATH,
				'./drawer',
				'DrawerBody',
				moduleResolution,
				project,
			),
		).toBe('DrawerBody');
		expect(
			resolveDrawerSymbol(
				DRAWER_MODULE_PATH,
				'./drawer',
				'NotADrawerExport',
				moduleResolution,
				project,
			),
		).toBeNull();
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

	test('app.css gives .publy-drawer-form the flex geometry as the last matching rule', () => {
		const appCssSource = readFileSync(
			path.resolve(import.meta.dirname, '../../styles/app.css'),
			'utf8',
		);

		const root = postcss.parse(appCssSource);

		const matchingRules: Rule[] = [];
		root.walkRules((rule) => {
			if (
				rule.selectors?.some((selector) =>
					selector.includes('.publy-drawer-form'),
				)
			) {
				matchingRules.push(rule);
			}
		});

		expect(matchingRules.length).toBeGreaterThan(0);

		// The rule the browser applies is the last one whose selector matches —
		// any later `.publy-drawer-form` rule would win in the cascade and could
		// delete the geometry. A commented-out rule never becomes a rule node,
		// so it cannot satisfy this either.
		const geometryRule = matchingRules[matchingRules.length - 1];
		expect(geometryRule.selectors).toEqual(['.publy-drawer-form']);

		const applyParams = geometryRule.nodes
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
});
