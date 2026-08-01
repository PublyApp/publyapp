/**
 * @vitest-environment jsdom
 *
 * Guard for fix/990 — a drawer whose `DrawerBody` + `DrawerFooter` are wrapped
 * in a plain `Form`/`<form>` breaks `.publy-drawer`'s flex column, and so does
 * any intermediate block (a `<div>`) between `DrawerForm` and the body/footer:
 * the intermediate block owns the unconstrained height with `min-height: auto`,
 * the body's `min-h-0 flex-1 overflow-y-auto` is inert, and the footer is
 * clipped below the viewport edge with no scrollbar.
 *
 * jsdom has no layout engine, so no computed-height or scrolling assertion can
 * work here. The call-site drawers' own suites mock `~/components/ui/drawer`
 * wholesale — a model, not the artifact — so this guard instead renders every
 * inventoried REAL call-site component against the REAL drawer components and
 * asserts the parent chain the geometry depends on:
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
 * Discovery is import-aware: a JSX tag counts as a DrawerForm call site when
 * its local name is bound to the shared component's export, so
 * `import { DrawerForm as Form }` + `<Form />` is caught, and when it is a
 * namespace member of the drawer module (`import * as Drawer` +
 * `<Drawer.DrawerForm />`). The unresolved-import fallback (round 4) is kept:
 * a `DrawerForm` import whose module cannot be resolved still counts, and so
 * does a bare `DrawerForm` reference that is not declared anywhere in the
 * file. A same-named local component — `const DrawerForm = () => <div />` —
 * is NOT the shared component and does not count.
 */

import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { cleanup, render, screen } from '@testing-library/react';
import postcss from 'postcss';
import type { AtRule, Rule } from 'postcss';
import { createElement, type ReactNode } from 'react';
import {
	Project,
	SyntaxKind,
	ts,
	type JsxOpeningElement,
	type JsxSelfClosingElement,
	type SourceFile,
} from 'ts-morph';
import { afterEach, describe, expect, test, vi } from 'vitest';

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
const TEMPORARY_CALL_SITE_SOURCE_FILE =
	'src/components/ui/_drawer-form-inventory-fixture.tsx';
const TEMPORARY_CALL_SITE_PATH = path.join(
	FRONT_ROOT,
	TEMPORARY_CALL_SITE_SOURCE_FILE,
);
const TEMPORARY_CALL_SITE_SOURCE = `import { DrawerForm } from '~/components/ui/drawer-form';

export const DrawerFormInventoryFixture = () => {
	return (
		<DrawerForm onSubmit={() => undefined}>
			<span>probe</span>
		</DrawerForm>
	);
};
`;
const TEMPORARY_ALIASED_CALL_SITE_FILE =
	'src/components/ui/_drawer-form-aliased-fixture.tsx';
const TEMPORARY_ALIASED_CALL_SITE_PATH = path.join(
	FRONT_ROOT,
	TEMPORARY_ALIASED_CALL_SITE_FILE,
);
const TEMPORARY_ALIASED_CALL_SITE_SOURCE = `import type { FieldValues, UseFormReturn } from 'react-hook-form';

import { DrawerForm as Form } from '~/components/ui/drawer';

export const DrawerFormAliasedFixture = ({
	methods,
}: {
	methods: UseFormReturn<FieldValues>;
}) => <Form methods={methods} />;
`;
const TEMPORARY_LOCAL_DECLARATION_FILE =
	'src/components/ui/_drawer-form-local-declaration-fixture.tsx';
const TEMPORARY_LOCAL_DECLARATION_PATH = path.join(
	FRONT_ROOT,
	TEMPORARY_LOCAL_DECLARATION_FILE,
);
const TEMPORARY_LOCAL_DECLARATION_SOURCE = `const DrawerForm = () => <div />;

export const LocalDrawerFormFixture = () => <DrawerForm />;
`;

type DrawerFormImportBindings = {
	drawerFormLocalNames: ReadonlySet<string>;
	drawerModuleNamespaces: ReadonlySet<string>;
	unresolvedDrawerFormImports: ReadonlySet<string>;
	otherModuleDrawerFormImports: ReadonlySet<string>;
	localDrawerFormDeclared: boolean;
};

type ModuleResolution = {
	compilerOptions: ts.CompilerOptions;
	host: ts.ModuleResolutionHost;
};

const collectDrawerFormImportBindings = (
	sourceFile: SourceFile,
	moduleResolution: ModuleResolution,
): DrawerFormImportBindings => {
	const drawerModulePath = path.join(FRONT_ROOT, DRAWER_MODULE_RELATIVE_PATH);
	const drawerFormLocalNames = new Set<string>();
	const drawerModuleNamespaces = new Set<string>();
	const unresolvedDrawerFormImports = new Set<string>();
	const otherModuleDrawerFormImports = new Set<string>();

	for (const declaration of sourceFile.getImportDeclarations()) {
		const namespaceImport = declaration.getNamespaceImport();
		const importsDrawerForm = declaration
			.getNamedImports()
			.some((namedImport) => namedImport.getName() === 'DrawerForm');

		if (!namespaceImport && !importsDrawerForm) {
			continue;
		}

		const resolvedModule = ts.resolveModuleName(
			declaration.getModuleSpecifierValue(),
			sourceFile.getFilePath(),
			moduleResolution.compilerOptions,
			moduleResolution.host,
		).resolvedModule?.resolvedFileName;
		const isDrawerModule = resolvedModule === drawerModulePath;

		if (namespaceImport) {
			if (isDrawerModule) {
				drawerModuleNamespaces.add(namespaceImport.getText());
			}
			continue;
		}

		for (const namedImport of declaration.getNamedImports()) {
			if (namedImport.getName() !== 'DrawerForm') {
				continue;
			}

			const localName =
				namedImport.getAliasNode()?.getText() ?? namedImport.getName();
			if (isDrawerModule) {
				drawerFormLocalNames.add(localName);
			} else if (resolvedModule) {
				otherModuleDrawerFormImports.add(localName);
			} else {
				unresolvedDrawerFormImports.add(localName);
			}
		}
	}

	const localDrawerFormDeclared =
		sourceFile
			.getDescendantsOfKind(SyntaxKind.VariableDeclaration)
			.some((declaration) => declaration.getName() === 'DrawerForm') ||
		sourceFile
			.getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
			.some((declaration) => declaration.getName() === 'DrawerForm') ||
		sourceFile
			.getDescendantsOfKind(SyntaxKind.ClassDeclaration)
			.some((declaration) => declaration.getName() === 'DrawerForm');

	return {
		drawerFormLocalNames,
		drawerModuleNamespaces,
		unresolvedDrawerFormImports,
		otherModuleDrawerFormImports,
		localDrawerFormDeclared,
	};
};

const isDrawerFormCallSite = (
	node: JsxOpeningElement | JsxSelfClosingElement,
	bindings: DrawerFormImportBindings,
): boolean => {
	const tagText = node.getTagNameNode().getText();

	if (bindings.drawerFormLocalNames.has(tagText)) {
		return true;
	}

	if (bindings.unresolvedDrawerFormImports.has(tagText)) {
		return true;
	}

	if (bindings.otherModuleDrawerFormImports.has(tagText)) {
		return false;
	}

	const namespaceMemberAccess = tagText.match(/^(.+)\.DrawerForm$/);
	if (
		namespaceMemberAccess &&
		bindings.drawerModuleNamespaces.has(namespaceMemberAccess[1])
	) {
		return true;
	}

	// Conservative fallback for a bare `DrawerForm` reference that is neither
	// imported nor declared anywhere in the file — round 4's fail-open. A
	// same-named local component (or an import of a different module's
	// DrawerForm) cannot fake this, which is what separates a real call site
	// from the finding-4 false positive.
	if (tagText === 'DrawerForm' && !bindings.localDrawerFormDeclared) {
		return true;
	}

	return false;
};

const findDrawerFormCallSites = (): string[] => {
	const project = new Project({
		tsConfigFilePath: path.join(FRONT_ROOT, 'tsconfig.json'),
		skipAddingFilesFromTsConfig: true,
	});
	const moduleResolution: ModuleResolution = {
		compilerOptions: project.getCompilerOptions(),
		host: project.getModuleResolutionHost(),
	};
	const sourceFiles: string[] = [];

	for (const sourceFile of project.addSourceFilesAtPaths(DRAWER_SOURCE_GLOB)) {
		if (/\.(?:spec|test)\.tsx$/.test(sourceFile.getBaseName())) {
			continue;
		}

		const bindings = collectDrawerFormImportBindings(
			sourceFile,
			moduleResolution,
		);
		const drawerFormNodes = [
			...sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
			...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
		];
		const hasDrawerForm = drawerFormNodes.some((node) =>
			isDrawerFormCallSite(node, bindings),
		);

		if (hasDrawerForm) {
			sourceFiles.push(
				path
					.relative(FRONT_ROOT, sourceFile.getFilePath())
					.split(path.sep)
					.join('/'),
			);
		}
	}

	return sourceFiles.sort();
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

afterEach(cleanup);

describe('DrawerForm flex chain at the real call sites', () => {
	test('the scanner discovers a newly added DrawerForm JSX call site on disk', () => {
		writeFileSync(TEMPORARY_CALL_SITE_PATH, TEMPORARY_CALL_SITE_SOURCE);

		try {
			expect(findDrawerFormCallSites()).toContain(
				TEMPORARY_CALL_SITE_SOURCE_FILE,
			);
		} finally {
			unlinkSync(TEMPORARY_CALL_SITE_PATH);
		}
	});

	test('the scanner discovers an aliased import of the shared DrawerForm', () => {
		writeFileSync(
			TEMPORARY_ALIASED_CALL_SITE_PATH,
			TEMPORARY_ALIASED_CALL_SITE_SOURCE,
		);

		try {
			expect(findDrawerFormCallSites()).toContain(
				TEMPORARY_ALIASED_CALL_SITE_FILE,
			);
		} finally {
			unlinkSync(TEMPORARY_ALIASED_CALL_SITE_PATH);
		}
	});

	test('the scanner ignores a same-named local component that is not the shared DrawerForm', () => {
		writeFileSync(
			TEMPORARY_LOCAL_DECLARATION_PATH,
			TEMPORARY_LOCAL_DECLARATION_SOURCE,
		);

		try {
			expect(findDrawerFormCallSites()).not.toContain(
				TEMPORARY_LOCAL_DECLARATION_FILE,
			);
		} finally {
			unlinkSync(TEMPORARY_LOCAL_DECLARATION_PATH);
		}
	});

	test('the inventory contains every real DrawerForm JSX call site', () => {
		const inventoriedSourceFiles = DRAWER_FORM_CALL_SITES.map(
			(callSite) => callSite.sourceFile,
		).sort();

		expect(findDrawerFormCallSites()).toEqual(inventoriedSourceFiles);
	});

	for (const callSite of DRAWER_FORM_CALL_SITES) {
		test(`${callSite.name} keeps DrawerBody + DrawerFooter as direct children of the drawer form`, () => {
			renderDrawerByCallSiteId[callSite.id]();
			expectDrawerFormChain(callSite.drawerTestId);
		});
	}

	test('the drawer form wrapper preserves the general form inter-child spacing', () => {
		renderDrawerByCallSiteId['profile-create']();

		const form = screen
			.getByTestId('profile-form-drawer')
			.querySelector('form.publy-drawer-form');
		expect(form).not.toBeNull();
		expect(form?.className).toContain('space-y-4');
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
