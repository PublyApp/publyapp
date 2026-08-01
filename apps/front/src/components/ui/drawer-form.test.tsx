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
 *
 * The wrapper walk is DOM-faithful, not syntactic: it sees through
 * everything that creates no node — JSX expressions, conditionals, `&&`
 * chains, calls, parentheses, the `<>` shorthand, and the nodeless React
 * wrappers `Fragment`/`Suspense`/`StrictMode` (only when actually imported
 * from `react`). A part whose walk finds NO enclosing element at all sits
 * inside a component DEFINITION (a composition helper that renders the
 * part), not at a drawer call site: its DOM position is decided by the
 * helper's call site, a definition site has no drawer to break, and the
 * walk's null result is therefore accepted, not a violation. This is a
 * deliberate, documented decision: the guard cannot see the chain through a
 * helper, and it says so in the "what the suite cannot see" section of the
 * round-8 report rather than rejecting correct code. A helper that wraps
 * the part in a real element IS discovered and judged — the walk then finds
 * that element and it is a violation.
 *
 * Deliberate friction: every file the scanner discovers must appear in the
 * inventory (the `DRAWER_FORM_CALL_SITES` union below, or
 * `FORM_LESS_DRAWER_SURFACE_FILES`), so a new drawer is visible to this suite
 * before it is reviewed. Form-bearing drawers additionally land in the e2e
 * helper and its exhaustive openers, which is where the author must supply a
 * real route, a drawer test id and a Playwright opener. The two lists are
 * NOT interchangeable: a discovered file whose JSX contains a `DrawerForm`
 * tag must be in `DRAWER_FORM_CALL_SITES` (the scan reports every such file
 * as `formBearing`), because the formless list carries no render obligation
 * — filing a form-bearing drawer there used to be the silent escape.
 *
 * The scan additionally asserts the `DrawerContent → DrawerForm` link for
 * every discovered surface: the form must be a direct child of the
 * `.publy-drawer` surface. A `<div>` between the surface and the form is
 * the #990 break one level up — the div owns the unconstrained height and
 * the body's scrolling is inert — and it reddens the structural test even
 * though every part tag has a legal wrapper.
 */

import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
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
	type JsxElement,
	type JsxOpeningElement,
	type JsxSelfClosingElement,
	type Node,
	type SourceFile,
} from 'ts-morph';
import { afterEach, describe, expect, test, vi } from 'vitest';
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
const DRAWER_SOURCE_GLOB = path.join(FRONT_ROOT, 'src/**/*.tsx');
const DRAWER_MODULE_RELATIVE_PATH = 'src/components/ui/drawer.tsx';
const DRAWER_MODULE_PATH = path.join(FRONT_ROOT, DRAWER_MODULE_RELATIVE_PATH);
const RE_EXPORT_CHAIN_DEPTH_LIMIT = 6;

// React wrappers that render no DOM node of their own; the wrapper walk
// treats them as transparent (see isNodelessReactWrapper).
const NODELESS_REACT_WRAPPER_NAMES = new Set([
	'Fragment',
	'Suspense',
	'StrictMode',
]);

const TEMPORARY_NEW_DRAWER_FILE =
	'src/components/ui/_drawer-surface-new-fixture.tsx';
const TEMPORARY_NEW_DRAWER_PATH = path.join(
	FRONT_ROOT,
	TEMPORARY_NEW_DRAWER_FILE,
);
const TEMPORARY_NEW_DRAWER_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';

import { DrawerBody, DrawerFooter, DrawerForm } from '~/components/ui/drawer';

export const NewDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<DrawerForm methods={methods}>
		<DrawerBody>probe</DrawerBody>
		<DrawerFooter />
	</DrawerForm>
);
`;

const TEMPORARY_ALIASED_DRAWER_FILE =
	'src/components/ui/_drawer-surface-aliased-fixture.tsx';
const TEMPORARY_ALIASED_DRAWER_PATH = path.join(
	FRONT_ROOT,
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
		<DrawerBody>probe</DrawerBody>
		<DrawerFooter />
	</Form>
);
`;

const TEMPORARY_BARREL_FILE =
	'src/components/ui/_drawer-form-barrel-fixture.ts';
const TEMPORARY_BARREL_PATH = path.join(FRONT_ROOT, TEMPORARY_BARREL_FILE);
const TEMPORARY_BARREL_SOURCE = `export { DrawerForm } from './drawer';
`;
const TEMPORARY_BARREL_CALL_SITE_FILE =
	'src/components/ui/_drawer-surface-barrel-fixture.tsx';
const TEMPORARY_BARREL_CALL_SITE_PATH = path.join(
	FRONT_ROOT,
	TEMPORARY_BARREL_CALL_SITE_FILE,
);
const TEMPORARY_BARREL_CALL_SITE_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';

import { DrawerBody, DrawerFooter } from '~/components/ui/drawer';
import { DrawerForm } from '~/components/ui/_drawer-form-barrel-fixture';

export const BarrelDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<DrawerForm methods={methods}>
		<DrawerBody>probe</DrawerBody>
		<DrawerFooter />
	</DrawerForm>
);
`;

const TEMPORARY_NAMESPACE_DRAWER_FILE =
	'src/components/ui/_drawer-surface-namespace-fixture.tsx';
const TEMPORARY_NAMESPACE_DRAWER_PATH = path.join(
	FRONT_ROOT,
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
		<Drawer.DrawerBody>probe</Drawer.DrawerBody>
		<Drawer.DrawerFooter />
	</Drawer.DrawerForm>
);
`;

const TEMPORARY_REGRESSED_DRAWER_FILE =
	'src/components/ui/_drawer-surface-regressed-fixture.tsx';
const TEMPORARY_REGRESSED_DRAWER_PATH = path.join(
	FRONT_ROOT,
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
				<DrawerTitle>Regressed</DrawerTitle>
			</DrawerHeader>
			<Form methods={methods}>
				<DrawerBody>content</DrawerBody>
				<DrawerFooter>
					<button type="submit">Save</button>
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
const TEMPORARY_ALIASED_PARTS_DRAWER_PATH = path.join(
	FRONT_ROOT,
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
				<DrawerTitle>Regressed</DrawerTitle>
			</DrawerHeader>
			<Form methods={methods}>
				<Body>content</Body>
				<Footer>
					<button type="submit">Save</button>
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
const TEMPORARY_ALIASED_BARREL_PARTS_PATH = path.join(
	FRONT_ROOT,
	TEMPORARY_ALIASED_BARREL_PARTS_FILE,
);
const TEMPORARY_ALIASED_BARREL_PARTS_SOURCE = `export { DrawerBody as Body, DrawerFooter as Footer } from './drawer';
`;
const TEMPORARY_ALIASED_BARREL_PARTS_CALL_SITE_FILE =
	'src/components/ui/_drawer-surface-aliased-barrel-parts-fixture.tsx';
const TEMPORARY_ALIASED_BARREL_PARTS_CALL_SITE_PATH = path.join(
	FRONT_ROOT,
	TEMPORARY_ALIASED_BARREL_PARTS_CALL_SITE_FILE,
);
const TEMPORARY_ALIASED_BARREL_PARTS_CALL_SITE_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { Form } from '~/components/field';
import { DrawerContent, DrawerHeader, DrawerTitle } from '~/components/ui/drawer';
import { Body, Footer } from '~/components/ui/_drawer-parts-aliased-barrel-fixture';

export const AliasedBarrelPartsDrawerFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => (
	<DrawerContent data-testid="r8-aliased-barrel-parts">
		<DrawerHeader>
			<DrawerTitle>Regressed</DrawerTitle>
		</DrawerHeader>
		<Form methods={methods}>
			<Body>content</Body>
			<Footer>
				<button type="submit">Save</button>
			</Footer>
		</Form>
	</DrawerContent>
);
`;

const TEMPORARY_LOCAL_SHADOW_DRAWER_FILE =
	'src/components/ui/_drawer-surface-local-shadow-fixture.tsx';
const TEMPORARY_LOCAL_SHADOW_DRAWER_PATH = path.join(
	FRONT_ROOT,
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
		<DrawerBody>probe</DrawerBody>
		<DrawerFooter />
	</Form>
);
`;

const TEMPORARY_UNRESOLVED_DRAWER_FILE =
	'src/components/ui/_drawer-surface-unresolved-fixture.tsx';
const TEMPORARY_UNRESOLVED_DRAWER_PATH = path.join(
	FRONT_ROOT,
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
		<DrawerBody>probe</DrawerBody>
		<DrawerFooter />
	</Form>
);
`;

const TEMPORARY_BARE_WRAPPER_DRAWER_FILE =
	'src/components/ui/_drawer-surface-bare-fixture.tsx';
const TEMPORARY_BARE_WRAPPER_DRAWER_PATH = path.join(
	FRONT_ROOT,
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
		<DrawerBody>probe</DrawerBody>
		<DrawerFooter />
	</DrawerForm>
);
`;

const TEMPORARY_CONDITIONAL_DRAWER_FILE =
	'src/components/ui/_drawer-surface-conditional-fixture.tsx';
const TEMPORARY_CONDITIONAL_DRAWER_PATH = path.join(
	FRONT_ROOT,
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
		{isEmpty ? <DrawerBody>empty</DrawerBody> : <DrawerBody>full</DrawerBody>}
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
const TEMPORARY_NODELESS_WRAPPERS_DRAWER_PATH = path.join(
	FRONT_ROOT,
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
			<DrawerBody>content</DrawerBody>
		</Suspense>
		<Fragment>
			<DrawerFooter>
				<button type="submit">Save</button>
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
const TEMPORARY_DEFINITION_HELPER_PATH = path.join(
	FRONT_ROOT,
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
const TEMPORARY_DIV_WRAPPED_PARTS_DRAWER_PATH = path.join(
	FRONT_ROOT,
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
			<DrawerBody>content</DrawerBody>
		</div>
		<DrawerFooter>
			<button type="submit">Save</button>
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
const TEMPORARY_DIV_ABOVE_FORM_DRAWER_PATH = path.join(
	FRONT_ROOT,
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
				<DrawerTitle>Broken above the form</DrawerTitle>
			</DrawerHeader>
			<div className="p-4">
				<DrawerForm methods={methods}>
					<DrawerBody>content</DrawerBody>
					<DrawerFooter>
						<button type="submit">Save</button>
					</DrawerFooter>
				</DrawerForm>
			</div>
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

type ModuleResolution = {
	compilerOptions: ts.CompilerOptions;
	host: ts.ModuleResolutionHost;
};

const toPortableSourcePath = (filePath: string): string =>
	path.relative(FRONT_ROOT, filePath).split(path.sep).join('/');

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
 * Resolves a JSX tag's local name to the name the drawer module exports it
 * under, or null when the tag is NOT the drawer module's symbol — through
 * the same chain every wrapper goes through: direct import, alias
 * (`DrawerBody as Body`), namespace member (`Drawer.DrawerBody` where the
 * base is a namespace import), and re-export barrels including aliased
 * re-exports. A same-named local declaration shadows every import; an
 * import that cannot be resolved is null (fail-closed). Discovery uses the
 * same machinery as the wrapper check, so there is no import spelling that
 * the scan can miss while the wrapper check accepts.
 */
const resolveDrawerTagName = (
	sourceFile: SourceFile,
	tagText: string,
	moduleResolution: ModuleResolution,
	project: Project,
	moduleCache: Map<string, string | null>,
	declaredNamesByFile: Map<string, Set<string>>,
): string | null => {
	const namespaceMatch = tagText.match(
		/^([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)$/,
	);
	if (namespaceMatch) {
		const namespaceSpecifier = resolveNamespaceImport(
			sourceFile,
			namespaceMatch[1],
		);
		if (!namespaceSpecifier) {
			return null;
		}
		return resolveDrawerSymbol(
			sourceFile.getFilePath(),
			namespaceSpecifier,
			namespaceMatch[2],
			moduleResolution,
			project,
			undefined,
			0,
			moduleCache,
		);
	}

	// A same-named local declaration shadows every import — `const Body = ...`
	// in this file is THIS file's component, never the drawer module's part.
	if (isLocallyDeclared(sourceFile, tagText, declaredNamesByFile)) {
		return null;
	}

	for (const declaration of sourceFile.getImportDeclarations()) {
		for (const namedImport of declaration.getNamedImports()) {
			const localName =
				namedImport.getAliasNode()?.getText() ?? namedImport.getName();
			if (localName !== tagText) {
				continue;
			}
			return resolveDrawerSymbol(
				sourceFile.getFilePath(),
				declaration.getModuleSpecifierValue(),
				namedImport.getName(),
				moduleResolution,
				project,
			);
		}
	}

	return null;
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
): 'drawer-form' | 'drawer-content' | 'other' => {
	const name = resolveDrawerTagName(
		sourceFile,
		tagText,
		moduleResolution,
		project,
		moduleCache,
		declaredNamesByFile,
	);
	if (name === 'DrawerForm') {
		return 'drawer-form';
	}
	if (name === 'DrawerContent') {
		return 'drawer-content';
	}
	return 'other';
};

const scanDrawerSurfaces = (): {
	discovered: string[];
	violations: string[];
	formBearing: string[];
} => {
	const project = new Project({
		tsConfigFilePath: path.join(FRONT_ROOT, 'tsconfig.json'),
		skipAddingFilesFromTsConfig: true,
	});
	const moduleResolution: ModuleResolution = {
		compilerOptions: project.getCompilerOptions(),
		host: project.getModuleResolutionHost(),
	};

	// Per-file memo of tag text -> drawer export name, so the 6-hop chain
	// resolution runs once per distinct name instead of once per tag, and a
	// scan-wide memo of resolved (file, specifier) pairs for the module
	// resolution inside the chain.
	const resolvedTagNames = new Map<string, Map<string, string | null>>();
	const moduleCache = new Map<string, string | null>();
	const declaredNamesByFile = new Map<string, Set<string>>();
	const drawerTagName = (
		sourceFile: SourceFile,
		tagText: string,
	): string | null => {
		let byName = resolvedTagNames.get(sourceFile.getFilePath());
		if (!byName) {
			byName = new Map<string, string | null>();
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
				),
			);
		}
		return byName.get(tagText) ?? null;
	};

	const discovered: string[] = [];
	const violations: string[] = [];
	const formBearing: string[] = [];

	for (const sourceFile of project.addSourceFilesAtPaths(DRAWER_SOURCE_GLOB)) {
		if (/\.(?:spec|test)\.tsx$/.test(sourceFile.getBaseName())) {
			continue;
		}

		const jsxTags = [
			...sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
			...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
		];

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
		if (partNodes.length === 0) {
			continue;
		}

		// A part tag with NO enclosing element sits inside a component
		// DEFINITION (a composition helper that renders the part), not at a
		// drawer call site: the DOM position of such a part is decided by the
		// helper's call site, which lives in another file. A definition site
		// has no drawer to break, so it is neither discovered nor a violation
		// (a helper that wraps the part in an element IS discovered and
		// judged here, since the wrapper walk then finds that element).
		const callSitePartNodes = partNodes.filter(
			(node) => wrapperOf(node) !== null,
		);
		if (callSitePartNodes.length === 0) {
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
			);
			return binding !== 'drawer-form' && binding !== 'drawer-content';
		});

		// The DrawerContent -> DrawerForm link, asserted for every discovered
		// surface: the form must itself be a direct child of the `.publy-drawer`
		// surface, or an intermediate block (the #990 break one level up)
		// re-owns the unconstrained height and the body's scrolling is inert.
		// Definition-site forms get the same pass as definition-site parts.
		const formNodes = jsxTags.filter(
			(node) =>
				drawerTagName(sourceFile, node.getTagNameNode().getText()) ===
				'DrawerForm',
		);
		const callSiteFormNodes = formNodes.filter(
			(node) => wrapperOf(node) !== null,
		);
		if (callSiteFormNodes.length > 0) {
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
				) !== 'drawer-content'
			);
		});

		if (isRejected || formLinkBroken) {
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

describe('drawer surface flex chain guard (#990)', () => {
	test('the scanner discovers a new drawer on disk by its DrawerBody + DrawerFooter tags', () => {
		writeFileSync(TEMPORARY_NEW_DRAWER_PATH, TEMPORARY_NEW_DRAWER_SOURCE);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(TEMPORARY_NEW_DRAWER_FILE);
			expect(scan.violations).not.toContain(TEMPORARY_NEW_DRAWER_FILE);
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
			expect(scan.discovered).toContain(TEMPORARY_ALIASED_DRAWER_FILE);
			expect(scan.violations).not.toContain(TEMPORARY_ALIASED_DRAWER_FILE);
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
			expect(scan.discovered).toContain(TEMPORARY_BARREL_CALL_SITE_FILE);
			expect(scan.violations).not.toContain(TEMPORARY_BARREL_CALL_SITE_FILE);
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
			expect(scan.discovered).toContain(TEMPORARY_NAMESPACE_DRAWER_FILE);
			expect(scan.violations).not.toContain(TEMPORARY_NAMESPACE_DRAWER_FILE);
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
			expect(scan.discovered).toContain(TEMPORARY_REGRESSED_DRAWER_FILE);
			expect(scan.violations).toContain(TEMPORARY_REGRESSED_DRAWER_FILE);
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
			expect(scan.discovered).toContain(TEMPORARY_ALIASED_PARTS_DRAWER_FILE);
			expect(scan.violations).toContain(TEMPORARY_ALIASED_PARTS_DRAWER_FILE);
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
				TEMPORARY_ALIASED_BARREL_PARTS_CALL_SITE_FILE,
			);
			expect(scan.violations).toContain(
				TEMPORARY_ALIASED_BARREL_PARTS_CALL_SITE_FILE,
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
			expect(scan.discovered).toContain(TEMPORARY_LOCAL_SHADOW_DRAWER_FILE);
			expect(scan.violations).toContain(TEMPORARY_LOCAL_SHADOW_DRAWER_FILE);
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
			expect(scan.discovered).toContain(TEMPORARY_UNRESOLVED_DRAWER_FILE);
			expect(scan.violations).toContain(TEMPORARY_UNRESOLVED_DRAWER_FILE);
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
			expect(scan.discovered).toContain(TEMPORARY_BARE_WRAPPER_DRAWER_FILE);
			expect(scan.violations).toContain(TEMPORARY_BARE_WRAPPER_DRAWER_FILE);
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
			expect(scan.discovered).toContain(TEMPORARY_CONDITIONAL_DRAWER_FILE);
			expect(scan.violations).not.toContain(TEMPORARY_CONDITIONAL_DRAWER_FILE);
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
				TEMPORARY_NODELESS_WRAPPERS_DRAWER_FILE,
			);
			expect(scan.violations).not.toContain(
				TEMPORARY_NODELESS_WRAPPERS_DRAWER_FILE,
			);
		} finally {
			unlinkSync(TEMPORARY_NODELESS_WRAPPERS_DRAWER_PATH);
		}
	});

	test('a composition helper that renders DrawerBody directly is a definition site, not a drawer call site', () => {
		writeFileSync(
			TEMPORARY_DEFINITION_HELPER_PATH,
			TEMPORARY_DEFINITION_HELPER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).not.toContain(TEMPORARY_DEFINITION_HELPER_FILE);
			expect(scan.violations).not.toContain(TEMPORARY_DEFINITION_HELPER_FILE);
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
				TEMPORARY_DIV_WRAPPED_PARTS_DRAWER_FILE,
			);
			expect(scan.violations).toContain(
				TEMPORARY_DIV_WRAPPED_PARTS_DRAWER_FILE,
			);
		} finally {
			unlinkSync(TEMPORARY_DIV_WRAPPED_PARTS_DRAWER_PATH);
		}
	});

	test('a form sitting under an intermediate element inside the surface is a structural violation', () => {
		writeFileSync(
			TEMPORARY_DIV_ABOVE_FORM_DRAWER_PATH,
			TEMPORARY_DIV_ABOVE_FORM_DRAWER_SOURCE,
		);

		try {
			const scan = scanDrawerSurfaces();
			expect(scan.discovered).toContain(TEMPORARY_DIV_ABOVE_FORM_DRAWER_FILE);
			expect(scan.violations).toContain(TEMPORARY_DIV_ABOVE_FORM_DRAWER_FILE);
		} finally {
			unlinkSync(TEMPORARY_DIV_ABOVE_FORM_DRAWER_PATH);
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
			.map((node) => node.params.trim().split(/\s+/).join(' '));

		expect(applyParams).toContain('flex min-h-0 flex-1 flex-col');
	});
});
