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
 * scan cannot miss it. Each discovered file is then required to put every
 * body/footer tag directly inside one of exactly two wrappers:
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
 * Deliberate friction: every file the scanner discovers must appear in the
 * inventory (the `DRAWER_FORM_CALL_SITES` union below, or
 * `FORM_LESS_DRAWER_SURFACE_FILES`), so a new drawer is visible to this suite
 * before it is reviewed. Form-bearing drawers additionally land in the e2e
 * helper and its exhaustive openers, which is where the author must supply a
 * real route, a drawer test id and a Playwright opener.
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
 * True when `moduleSpecifier` (imported from `fromFilePath`) resolves — across
 * at most RE_EXPORT_CHAIN_DEPTH_LIMIT hops of re-export barrels — to the
 * drawer module's `exportName`. Resolution is bounded and memoized per
 * (module, export) pair in `visited`, so a barrel cycle terminates. A hop
 * that cannot be resolved is not the drawer module.
 */
const moduleExportsDrawerSymbol = (
	fromFilePath: string,
	moduleSpecifier: string,
	exportName: string,
	moduleResolution: ModuleResolution,
	project: Project,
	visited: Set<string> = new Set(),
	depth = 0,
): boolean => {
	if (depth >= RE_EXPORT_CHAIN_DEPTH_LIMIT) {
		return false;
	}

	const resolved = ts.resolveModuleName(
		moduleSpecifier,
		fromFilePath,
		moduleResolution.compilerOptions,
		moduleResolution.host,
	).resolvedModule?.resolvedFileName;
	if (!resolved) {
		return false;
	}
	if (path.resolve(resolved) === DRAWER_MODULE_PATH) {
		return true;
	}

	const visitedKey = `${resolved}:${exportName}`;
	if (visited.has(visitedKey)) {
		return false;
	}
	visited.add(visitedKey);

	const reExportingFile = project.addSourceFileAtPath(resolved);
	for (const exportDeclaration of reExportingFile.getExportDeclarations()) {
		const reExportSpecifier = exportDeclaration.getModuleSpecifierValue();
		const namedExports = exportDeclaration.getNamedExports();

		if (reExportSpecifier) {
			const reExportsSymbol =
				namedExports.length === 0 && !exportDeclaration.getNamespaceExport()
					? // `export * from '...'`
						true
					: namedExports.some(
							(specifier) => specifier.getName() === exportName,
						);
			if (
				reExportsSymbol &&
				moduleExportsDrawerSymbol(
					resolved,
					reExportSpecifier,
					exportName,
					moduleResolution,
					project,
					visited,
					depth + 1,
				)
			) {
				return true;
			}
			continue;
		}

		// `export { DrawerForm }` without a specifier re-exports a symbol
		// imported in this file — follow that import instead.
		if (!namedExports.some((specifier) => specifier.getName() === exportName)) {
			continue;
		}
		for (const declaration of reExportingFile.getImportDeclarations()) {
			for (const namedImport of declaration.getNamedImports()) {
				if (
					(namedImport.getAliasNode()?.getText() ?? namedImport.getName()) !==
					exportName
				) {
					continue;
				}
				if (
					moduleExportsDrawerSymbol(
						resolved,
						declaration.getModuleSpecifierValue(),
						namedImport.getName(),
						moduleResolution,
						project,
						visited,
						depth + 1,
					)
				) {
					return true;
				}
			}
		}
	}

	return false;
};

const isDrawerBodyOrFooterTag = (
	node: JsxOpeningElement | JsxSelfClosingElement,
	sourceFile: SourceFile,
): boolean => {
	const tagText = node.getTagNameNode().getText();
	if (tagText === 'DrawerBody' || tagText === 'DrawerFooter') {
		return true;
	}

	// Namespace member access — `<Drawer.DrawerBody>` — counts only when the
	// base is actually a namespace import, so a member of a local object
	// cannot be misread as a drawer part.
	const namespaceMatch = tagText.match(
		/^([A-Za-z_$][\w$]*)\.(DrawerBody|DrawerFooter)$/,
	);
	if (!namespaceMatch) {
		return false;
	}
	return sourceFile
		.getImportDeclarations()
		.some(
			(declaration) =>
				declaration.getNamespaceImport()?.getText() === namespaceMatch[1],
		);
};

const isTransparentExpression = (node: Node): boolean => {
	const kind = node.getKind();
	// JsxExpression/Fragment create no DOM node; the expression kinds cover
	// conditionals, `&&` chains, `.map()` calls and parentheses between a tag
	// and its wrapper element. A node that is none of these (a `<div>`, a
	// statement, an attribute) means the tag is not directly inside an
	// element, which the caller treats as a structural violation.
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
 * The nearest element that actually contains the body/footer tag in the DOM
 * sense: fragments and JSX expressions create no node, so they are skipped;
 * any other kind of ancestor means the tag is not inside an element at all.
 */
const findWrapperOpeningElement = (
	node: JsxOpeningElement | JsxSelfClosingElement,
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
			return (current as JsxElement).getOpeningElement();
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
): 'drawer-form' | 'drawer-content' | 'other' => {
	const namespaceMatch = tagText.match(
		/^([A-Za-z_$][\w$]*)\.(DrawerForm|DrawerContent)$/,
	);
	if (namespaceMatch) {
		const namespaceImport = sourceFile
			.getImportDeclarations()
			.find(
				(declaration) =>
					declaration.getNamespaceImport()?.getText() === namespaceMatch[1],
			);
		if (!namespaceImport) {
			return 'other';
		}
		const isDrawerMember = moduleExportsDrawerSymbol(
			sourceFile.getFilePath(),
			namespaceImport.getModuleSpecifierValue(),
			namespaceMatch[2],
			moduleResolution,
			project,
		);
		if (!isDrawerMember) {
			return 'other';
		}
		return namespaceMatch[2] === 'DrawerForm'
			? 'drawer-form'
			: 'drawer-content';
	}

	// A same-named local declaration shadows every import — `const Form = ...`
	// in this file is THIS file's component, never the drawer module's export.
	const locallyDeclared =
		sourceFile
			.getDescendantsOfKind(SyntaxKind.VariableDeclaration)
			.some((declaration) => declaration.getName() === tagText) ||
		sourceFile
			.getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
			.some((declaration) => declaration.getName() === tagText) ||
		sourceFile
			.getDescendantsOfKind(SyntaxKind.ClassDeclaration)
			.some((declaration) => declaration.getName() === tagText);
	if (locallyDeclared) {
		return 'other';
	}

	for (const declaration of sourceFile.getImportDeclarations()) {
		for (const namedImport of declaration.getNamedImports()) {
			const localName =
				namedImport.getAliasNode()?.getText() ?? namedImport.getName();
			if (localName !== tagText) {
				continue;
			}
			if (
				namedImport.getName() !== 'DrawerForm' &&
				namedImport.getName() !== 'DrawerContent'
			) {
				return 'other';
			}
			const isDrawerExport = moduleExportsDrawerSymbol(
				sourceFile.getFilePath(),
				declaration.getModuleSpecifierValue(),
				namedImport.getName(),
				moduleResolution,
				project,
			);
			if (!isDrawerExport) {
				return 'other';
			}
			return namedImport.getName() === 'DrawerForm'
				? 'drawer-form'
				: 'drawer-content';
		}
	}

	// Unresolved — neither imported nor declared: cannot be the drawer
	// module's export, so a body/footer under it is rejected (fail-closed).
	return 'other';
};

const scanDrawerSurfaces = (): {
	discovered: string[];
	violations: string[];
} => {
	const project = new Project({
		tsConfigFilePath: path.join(FRONT_ROOT, 'tsconfig.json'),
		skipAddingFilesFromTsConfig: true,
	});
	const moduleResolution: ModuleResolution = {
		compilerOptions: project.getCompilerOptions(),
		host: project.getModuleResolutionHost(),
	};

	const discovered: string[] = [];
	const violations: string[] = [];

	for (const sourceFile of project.addSourceFilesAtPaths(DRAWER_SOURCE_GLOB)) {
		if (/\.(?:spec|test)\.tsx$/.test(sourceFile.getBaseName())) {
			continue;
		}

		const drawerPartNodes = [
			...sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
			...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
		].filter((node) => isDrawerBodyOrFooterTag(node, sourceFile));
		if (drawerPartNodes.length === 0) {
			continue;
		}

		discovered.push(toPortableSourcePath(sourceFile.getFilePath()));

		const isRejected = drawerPartNodes.some((node) => {
			const wrapper = findWrapperOpeningElement(node);
			if (!wrapper) {
				return true;
			}
			const binding = resolveTagBinding(
				sourceFile,
				wrapper.getTagNameNode().getText(),
				moduleResolution,
				project,
			);
			return binding !== 'drawer-form' && binding !== 'drawer-content';
		});
		if (isRejected) {
			violations.push(toPortableSourcePath(sourceFile.getFilePath()));
		}
	}

	return {
		discovered: discovered.sort(),
		violations: violations.sort(),
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

	test('the inventory contains every real drawer surface file', () => {
		const expectedInventory = [
			...DRAWER_FORM_CALL_SITES.map((callSite) => callSite.sourceFile),
			...FORM_LESS_DRAWER_SURFACE_FILES,
		].sort();

		expect(scanDrawerSurfaces().discovered).toEqual(expectedInventory);
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
