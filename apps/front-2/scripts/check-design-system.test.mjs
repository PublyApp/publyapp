import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { findSuppressionSitesInSource } from '../src/lib/suppression-reason.ts';
import { scanFront2DesignSystem } from './check-design-system.mjs';

const makeFixture = async (files) => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'front2-design-guard-'));
	for (const [relativePath, content] of Object.entries(files)) {
		const absolutePath = path.join(root, relativePath);
		await mkdir(path.dirname(absolutePath), { recursive: true });
		await writeFile(absolutePath, content);
	}
	return root;
};

const scanStatusFixture = async (source) => {
	const root = await makeFixture({
		'src/routes/authed/staff/status-fixture.tsx': source,
	});
	return scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});
};

test('status menu guard accepts persistent value checkboxes and an exclusive reset', async () => {
	const violations = await scanStatusFixture(`
		<DropdownMenuContent>
			<DropdownMenuCheckboxItem checked={statuses.length === 0} closeOnClick>
				{t('all-statuses')}
			</DropdownMenuCheckboxItem>
			{STATUS_VALUES.map((status) => (
				<DropdownMenuCheckboxItem checked={statuses.includes(status)} closeOnClick={false} showCheckbox>
					{status}
				</DropdownMenuCheckboxItem>
			))}
		</DropdownMenuContent>
	`);
	assert.equal(
		violations.some(
			(item) => item.ruleId === 'status-filter-checkbox-contract',
		),
		false,
	);
});

test('status menu guard accepts an explicit reset-key-discovered menu', async () => {
	const violations = await scanStatusFixture(`
		<DropdownMenuContent>
			<DropdownMenuCheckboxItem closeOnClick>{t('all-statuses')}</DropdownMenuCheckboxItem>
			<DropdownMenuCheckboxItem closeOnClick={false} showCheckbox>Active</DropdownMenuCheckboxItem>
		</DropdownMenuContent>
	`);
	assert.equal(
		violations.some(
			(item) => item.ruleId === 'status-filter-checkbox-contract',
		),
		false,
	);
});

test('status menu guard ignores persistent non-status filters', async () => {
	const violations = await scanStatusFixture(`
		<DropdownMenuContent>
			{LEVEL_VALUES.map((level) => (
				<DropdownMenuCheckboxItem closeOnClick={false}>{level}</DropdownMenuCheckboxItem>
			))}
		</DropdownMenuContent>
	`);
	assert.equal(
		violations.some(
			(item) => item.ruleId === 'status-filter-checkbox-contract',
		),
		false,
	);
});

for (const fixture of [
	{
		name: 'missing showCheckbox',
		item: '<DropdownMenuCheckboxItem closeOnClick={false}>{status}</DropdownMenuCheckboxItem>',
		message: /showCheckbox/,
	},
	{
		name: 'closing status value',
		item: '<DropdownMenuCheckboxItem closeOnClick>{status}</DropdownMenuCheckboxItem>',
		message: /closeOnClick=\{false\}/,
	},
]) {
	test(`status menu guard rejects ${fixture.name}`, async () => {
		const violations = await scanStatusFixture(`
			<DropdownMenuContent>
				<DropdownMenuCheckboxItem closeOnClick>{t('all-statuses')}</DropdownMenuCheckboxItem>
				{STATUSES.map((status) => (${fixture.item}))}
			</DropdownMenuContent>
		`);
		const violation = violations.find(
			(entry) =>
				entry.ruleId === 'status-filter-checkbox-contract' &&
				fixture.message.test(entry.message),
		);
		assert.ok(violation);
	});
}

test('status menu guard rejects a persistent status menu without All statuses', async () => {
	const violations = await scanStatusFixture(`
		<DropdownMenuContent>
			{STATUSES.map((status) => (
				<DropdownMenuCheckboxItem closeOnClick={false} showCheckbox>{status}</DropdownMenuCheckboxItem>
			))}
		</DropdownMenuContent>
	`);
	assert.ok(
		violations.some(
			(entry) =>
				entry.ruleId === 'status-filter-checkbox-contract' &&
				/All statuses/.test(entry.message),
		),
	);
});

for (const [name, attributes] of [
	['shows a checkbox', 'closeOnClick showCheckbox'],
	['does not explicitly close', 'closeOnClick={false}'],
]) {
	test(`status menu guard rejects an All statuses reset that ${name}`, async () => {
		const violations = await scanStatusFixture(`
			<DropdownMenuContent>
				<DropdownMenuCheckboxItem ${attributes}>{t('all-statuses')}</DropdownMenuCheckboxItem>
				{STATUSES.map((status) => (
					<DropdownMenuCheckboxItem closeOnClick={false} showCheckbox>{status}</DropdownMenuCheckboxItem>
				))}
			</DropdownMenuContent>
		`);
		assert.ok(
			violations.some(
				(entry) =>
					entry.ruleId === 'status-filter-checkbox-contract' &&
					/reset/.test(entry.message),
			),
		);
	});
}

test('status menu guard fails closed on spread-obscured item attributes', async () => {
	const violations = await scanStatusFixture(`
		<DropdownMenuContent>
			<DropdownMenuCheckboxItem closeOnClick>{t('all-statuses')}</DropdownMenuCheckboxItem>
			{STATUSES.map((status) => (
				<DropdownMenuCheckboxItem {...statusItemProps}>{status}</DropdownMenuCheckboxItem>
			))}
		</DropdownMenuContent>
	`);
	assert.ok(
		violations.some(
			(entry) =>
				entry.ruleId === 'status-filter-checkbox-contract' &&
				/cannot classify/.test(entry.message),
		),
	);
});

test('flags raw shell colors, prototype icons, native selects, confirms, and important overrides', async () => {
	const root = await makeFixture({
		'src/components/app-shell/app-shell.tsx':
			'<div className="bg-slate-900 !text-foreground" />',
		'src/components/table/data-table.tsx':
			'<select className="border-border"><option>10</option></select>',
		'src/routes/authed/staff/tenants.tsx':
			'globalThis.confirm("Suspend?"); <AppErrorView icon="!" title="Error" />',
		'src/components/table/numeric-important.tsx':
			'<div className="!px-2 !z-50">Bad</div>',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.deepEqual(
		[...new Set(violations.map((violation) => violation.ruleId))].sort(),
		[
			'no-important-foundation',
			'no-native-confirm',
			'no-native-product-select',
			'no-prototype-icons',
			'no-raw-visual-color',
		],
	);
});

test('flags HeroUI, MUI, and Lucide imports in migration guard', async () => {
	const root = await makeFixture({
		'src/components/table/data-table.tsx':
			"import { Button } from '@heroui/react';\nimport '@heroui/styles';\nimport { useRouter } from 'react-router';\nimport { Box } from '@mui/material';",
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.some((violation) => violation.ruleId === 'no-heroui-import'),
		true,
	);
	assert.equal(
		violations.some((violation) => violation.ruleId === 'no-mui-import'),
		true,
	);
});

test('flags Lucide imports in migration guard', async () => {
	const root = await makeFixture({
		'src/components/ui/state-surface.tsx':
			"import { AlertCircle } from 'lucide-react';",
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.some((violation) => violation.ruleId === 'no-lucide-import'),
		true,
	);
	assert.equal(
		violations.some((violation) => violation.ruleId === 'no-mui-import'),
		false,
	);
});

test('flags legacy numbered HeroUI color scale utilities', async () => {
	const root = await makeFixture({
		'src/routes/authed/staff/example.tsx':
			'<div className="text-foreground-500 bg-default-100 border-danger-200 text-success-800" />',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.some(
			(violation) => violation.ruleId === 'no-heroui-color-scale',
		),
		true,
	);
});

test('allows Gray UI token aliases', async () => {
	const root = await makeFixture({
		'src/components/table/data-table.tsx':
			'<div className="text-muted-foreground border-border bg-background text-primary-foreground" />',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.filter((violation) => violation.ruleId === 'no-heroui-import')
			.length,
		0,
	);
	assert.equal(
		violations.filter((violation) => violation.ruleId === 'no-raw-visual-color')
			.length,
		0,
	);
});

test('allows ordinary JavaScript negation in shell and table foundation files', async () => {
	const root = await makeFixture({
		'src/components/app-shell/app-shell.tsx':
			'if (!isMenuOpen) { return null; }',
		'src/components/table/data-table.tsx':
			'const disabled = paginationDisabled || !hasPreviousPage;',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.some(
			(violation) => violation.ruleId === 'no-important-foundation',
		),
		false,
	);
});

test('flags legacy rounded styles outside allowed pockets', async () => {
	const root = await makeFixture({
		'src/routes/authed/staff/sample.tsx':
			'<div className="rounded-full">x</div>\n<span style="border-radius:999px">x</span>\n',
		'src/components/app-shell/app-shell.tsx':
			'<button className="app-shell-topbar-action-btn">x</button>\n',
		'src/styles/app.css': '.hero-chip { border-radius: 999px; }\n',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	const roundedRuleHits = violations.filter(
		(violation) => violation.ruleId === 'no-rounded-full-or-999-radius',
	);

	assert.equal(roundedRuleHits.length > 0, true);
});

test('flags new circular-style regressions in refreshed primitives', async () => {
	const root = await makeFixture({
		'src/components/ui/switch.tsx': '<Switch className="rounded-full" />',
		'src/components/ui/tabs.tsx':
			'<TabsList className="inline-flex rounded-full" />',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	const roundedRuleHits = violations.filter(
		(violation) => violation.ruleId === 'no-rounded-full-or-999-radius',
	);

	assert.equal(
		roundedRuleHits.some(
			(violation) =>
				violation.file === 'src/components/ui/switch.tsx' &&
				violation.source.includes('rounded-full'),
		),
		true,
	);
	assert.equal(
		roundedRuleHits.some(
			(violation) =>
				violation.file === 'src/components/ui/tabs.tsx' &&
				violation.source.includes('rounded-full'),
		),
		true,
	);
});

test('keeps circular rounded exceptions for topbar/avatar while flagging primitives', async () => {
	const root = await makeFixture({
		'src/components/ui/avatar.tsx': '<span className="rounded-full"></span>',
		'src/components/app-shell/app-shell.tsx':
			'<button className="app-shell-topbar-action-btn">x</button>',
		'src/styles/app.css':
			'.app-shell-topbar-action-btn { border-radius: 999px !important; }',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	const roundedRuleHits = violations.filter(
		(violation) => violation.ruleId === 'no-rounded-full-or-999-radius',
	);

	assert.equal(
		roundedRuleHits.some(
			(violation) => violation.file === 'src/components/ui/avatar.tsx',
		),
		false,
	);
	assert.equal(
		roundedRuleHits.some(
			(violation) =>
				violation.file === 'src/components/app-shell/app-shell.tsx',
		),
		false,
	);
	assert.equal(
		roundedRuleHits.some(
			(violation) => violation.file === 'src/styles/app.css',
		),
		false,
	);
});

test('flags new rounded styles even in files with legacy debt', async () => {
	const root = await makeFixture({
		'src/components/table/data-table.tsx':
			'<span className="new-handoff-shape rounded-full">Bad</span>',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.some(
			(violation) => violation.ruleId === 'no-rounded-full-or-999-radius',
		),
		true,
	);
});

test('flags non-confirmation centered overlay wording and DialogPopup usage', async () => {
	const root = await makeFixture({
		'src/routes/authed/staff/overlay.tsx':
			'<div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">Centered</div>',
		'src/components/ui/forbidden-dialog.tsx':
			'import { Dialog as DialogPrimitive } from \'@base-ui/react/dialog\';\nconst popup = <DialogPrimitive.Popup className="x" />;',
		'src/components/ui/confirm-dialog.tsx':
			'import { Dialog as DialogPrimitive } from \'@base-ui/react/dialog\';\nconst c = <DialogPrimitive.Popup className="y" />;',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.some(
			(violation) =>
				violation.ruleId === 'no-non-confirmation-centered-overlay',
		),
		true,
	);
	assert.equal(
		violations.some(
			(violation) => violation.ruleId === 'no-dialog-popup-primitives',
		),
		true,
	);
});

test('allows HeroUI imports and rules that should be exempt', async () => {
	const root = await makeFixture({
		'src/components/ui/confirm-dialog.tsx':
			"import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';",
		'src/components/ui/drawer.tsx':
			'import { Dialog as DialogPrimitive } from \'@base-ui/react/dialog\';\nconst drawer = <DialogPrimitive.Popup className="publy-drawer" />;',
		'src/components/app-shell/app-shell.tsx':
			'<div className="app-shell-topbar-action-btn" />',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.filter(
			(violation) => violation.ruleId === 'no-dialog-popup-primitives',
		).length,
		0,
	);
});

test('no longer exempts a deleted ui/dialog.tsx from DialogPopup usage (F12: dialog.tsx removed from the allowlist)', async () => {
	const root = await makeFixture({
		'src/components/ui/dialog.tsx':
			"import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';\nexport const DialogPopup = DialogPrimitive.Popup;",
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.some(
			(violation) => violation.ruleId === 'no-dialog-popup-primitives',
		),
		true,
	);
});

test('allows raw tokens only in app.css', async () => {
	const root = await makeFixture({
		'src/styles/app.css': ':root { --publy-primary-main: #2563eb; }',
		'src/styles/other.css': '.bad { color: #2563eb; }',
		'src/components/table/data-table.tsx':
			'<div className="border-divider text-muted-foreground" />',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.deepEqual(
		violations.map((violation) => violation.ruleId),
		['no-raw-visual-color'],
	);
	assert.equal(violations[0].file, 'src/styles/other.css');
});

test('reports the actual internal anchor when another anchor appears first', async () => {
	const root = await makeFixture({
		'src/routes/authed/staff/example.tsx': `
			<a href={href}>Dynamic</a>
			<div>Between</div>
			<a
				href="/staff/tenants"
				className="quiet"
			>
				Staff tenants
			</a>
		`,
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});
	const anchors = violations.filter(
		(violation) => violation.ruleId === 'no-raw-internal-anchor',
	);

	assert.equal(anchors.length, 1);
	assert.match(anchors[0].source, /href="\/staff\/tenants"/);
	assert.doesNotMatch(anchors[0].source, /href=\{href\}/);
});

test('primary button chrome is on .btn-primary-chrome, with no border-radius override (F6/F9)', async () => {
	const css = await readFile(
		new URL('../src/styles/app.css', import.meta.url),
		'utf8',
	);

	// .button--primary / .button--primary.button--md are dead CSS (F9/F12):
	// zero usages anywhere in src/, superseded by .btn-primary-chrome — this
	// test used to pin the dead selector in place. Assert it's gone.
	assert.doesNotMatch(css, /\.button--primary\b/);

	// chrome properties live on the real class, .btn-primary-chrome
	const chromeRuleMatch = css.match(/\.btn-primary-chrome\s*\{([^}]*)\}/);
	assert.notEqual(chromeRuleMatch, null, '.btn-primary-chrome rule not found');
	const chromeRuleBody = chromeRuleMatch[1];

	// F3: the border literal moved into a named, theme-invariant token
	// (--publy-chrome-border) so no-raw-visual-color's border-shorthand scan
	// doesn't flag the bevel as an unrouted raw rgba() literal.
	assert.match(chromeRuleBody, /border:\s*var\(--publy-chrome-border\)/);
	assert.match(chromeRuleBody, /box-shadow:\s*var\(--publy-shadow-chrome\)/);

	assert.match(
		css,
		/--publy-chrome-border:\s*1\.33px\s+solid\s+rgba\(255,\s*255,\s*255,\s*0\.12\)/,
	);

	// F6: no border-radius here. This class is un-layered (must beat
	// Tailwind's utility layer for border/box-shadow), so a border-radius
	// declaration here would always beat every size variant's own
	// rounded-[...] utility, forcing every primary button to the same
	// radius regardless of size="xs"/"sm"/"default"/"lg".
	assert.doesNotMatch(chromeRuleBody, /border-radius/);
});

test('handoff design tokens are present in app.css', async () => {
	const css = await readFile(
		new URL('../src/styles/app.css', import.meta.url),
		'utf8',
	);

	assert.match(css, /--publy-font-sans:\s*Geist, ui-sans-serif/);
	assert.match(css, /--publy-primary:\s*#fdc700/i);
	assert.match(css, /--publy-primary-foreground:\s*#733e0a/i);
	assert.match(css, /--publy-shell-rail-width:\s*49px/);
	assert.match(css, /--publy-shell-panel-width:\s*272px/);
	assert.match(css, /--publy-shell-topbar-height:\s*64px/);
	assert.match(
		css,
		/--publy-shadow-chrome:\s*0\s+0\s+0\s+0\.67px\s+rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\.2\s*\)\s+inset,?\s*0\s+2px\s+2px\s+rgba\(\s*255,\s*255,\s*255,\s*0\.1\s*\)\s+inset,?\s*0\s+2px\s+2\.67px\s+-0\.67px\s+rgba\(\s*42,\s*42,\s*42,\s*0\.1\s*\),?\s*0\s+0\.67px\s+0\.67px\s+rgba\(\s*42,\s*42,\s*42,\s*0\.08\s*\)/,
	);
	assert.match(css, /--publy-modal-radius:\s*28px/);
});

test('allows issue references that look like numeric hex values in comments', async () => {
	const root = await makeFixture({
		'src/components/app-shell/app-shell.tsx':
			'// fixes #802\\n// see issue #123456\\nconst ok = true;',
		'src/routes/authed/staff/example.tsx':
			'{/* Related to #795 */}<div>ok</div>',
	});

	assert.equal(
		(
			await scanFront2DesignSystem({
				baseDir: root,
				sourceDir: path.join(root, 'src'),
			})
		).some((violation) => violation.ruleId === 'no-raw-visual-color'),
		false,
	);
});

test('flags raw hex color strings and Tailwind arbitrary hex color utilities', async () => {
	const root = await makeFixture({
		'src/components/app-shell/app-shell.tsx':
			'<div className="bg-[#123456] text-[#abcdef]" />',
		'src/components/table/data-table.tsx':
			"const color = '#2563eb'; const style = { color: '#1d4ed8' };",
		'src/styles/other.css': '.bad { color: #2563eb; }',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.filter((violation) => violation.ruleId === 'no-raw-visual-color')
			.length,
		3,
	);
});

test('allows rgb and rgba references in comments', async () => {
	const root = await makeFixture({
		'src/components/app-shell/app-shell.tsx':
			'// removed legacy rgba() overlay\\n// rgb() values now come from tokens\\nconst ok = true;',
		'src/routes/authed/staff/example.tsx':
			'{/* replaced rgba() with semantic tokens */}<div>ok</div>',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.some((violation) => violation.ruleId === 'no-raw-visual-color'),
		false,
	);
});

test('flags rgb and rgba color strings and style declarations', async () => {
	const root = await makeFixture({
		'src/components/app-shell/app-shell.tsx':
			'<div className="bg-[rgba(1,2,3,0.5)]" />',
		'src/components/table/data-table.tsx':
			"const color = 'rgba(1, 2, 3, 0.5)';",
		'src/styles/other.css': '.bad { background: rgb(1, 2, 3); }',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.filter((violation) => violation.ruleId === 'no-raw-visual-color')
			.length,
		3,
	);
});

// W6-GUARDS (shell F6 / ui F6): a CSS named colour keyword outside
// `color-mix()` was entirely unguarded — every direct-literal pattern only
// ever recognised hex and colour-function shapes.
test('W6-GUARDS: flags a raw CSS named colour keyword in a declaration and an inline style object', async () => {
	const root = await makeFixture({
		'src/styles/other.css': '.danger { color: red; }',
		'src/components/table/data-table.tsx':
			"const chrome = { background: 'rebeccapurple' };",
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.filter((violation) => violation.ruleId === 'no-raw-visual-color')
			.length,
		2,
	);
});

// Regression guard: a token reference/value that merely CONTAINS a named
// colour as a word fragment (`var(--publy-border-strong)`) must not
// false-positive — the named-colour pattern is anchored directly after the
// property's colon, not widened across the whole declaration value.
test('W6-GUARDS: does not flag a token reference whose name happens to contain a colour-name fragment (regression guard)', async () => {
	const root = await makeFixture({
		'src/styles/other.css':
			'.ok { border: 1px solid var(--publy-border-strong); }',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.deepEqual(
		violations.filter(
			(violation) => violation.ruleId === 'no-raw-visual-color',
		),
		[],
	);
});

// W6-GUARDS (ui F5): `box-shadow` was only present in the colour-FUNCTION
// pattern, not the hex/named-colour patterns — a raw hex or named-colour
// shadow sailed through while the equivalent rgba() shadow was already
// caught.
test('W6-GUARDS: flags a raw hex and a raw named colour used in a box-shadow declaration', async () => {
	const root = await makeFixture({
		'src/styles/other.css': [
			'.a { box-shadow: 0 0 0 3px #ffffff; }',
			'.b { box-shadow: 0 0 0 3px red; }',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.filter((violation) => violation.ruleId === 'no-raw-visual-color')
			.length,
		2,
	);
});

// r4-ui-F3: the original guard only recognized hex/rgb(a) as direct colour
// literals — hsl(a), hwb, lab, lch, oklab, oklch, and color() sailed through
// unrouted-to-a-token in a property value, an arbitrary Tailwind bracket
// value, and a bare custom-property declaration alike.
test('r4-ui-F3: flags hsl/hwb/lab/lch/oklab/oklch/color() literals in property values, arbitrary Tailwind values, and custom properties', async () => {
	const root = await makeFixture({
		'src/styles/other.css': [
			'.a { background: hsl(0 100% 50%); }',
			'.b { border-color: hwb(220 30% 20%); }',
			'.c { color: lab(29.2345% 39.3825 20.0664); }',
			'.d { outline-color: lch(52.2% 72.2 50); }',
			'.e { fill: oklab(59% 0.1 0.1); }',
			'.f { stroke: oklch(60% 0.15 30); }',
			'.g { background-color: color(display-p3 1 0 0); }',
			'.h { --publy-icon-tile-bg: oklch(70% 0.1 200); }',
		].join('\n'),
		// r5-ui-F2: this Tailwind arbitrary-value `bg-[hsl(...)]` is the exact
		// spelling the round-5 review demonstrated as invisible — the
		// arbitrary-utility detector was hard-coded to `rgba?` only, so this
		// ninth literal never joined the eight CSS-declaration hits below,
		// and the old assertion (`8`) silently certified that gap as green.
		'src/components/table/data-table.tsx':
			'<div className="bg-[hsl(220_10%_10%)]" />',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});
	const colorViolations = violations.filter(
		(violation) => violation.ruleId === 'no-raw-visual-color',
	);

	// r5-ui-F2: assert each of the nine injected literals individually (not
	// just the aggregate count) so that removing ANY ONE detector — not only
	// dropping the total below 9 — fails this test. An aggregate `length ===
	// 9` alone would still pass if two detectors merged onto the same line or
	// a detector silently swapped which literal it caught.
	const bySource = (needle) =>
		colorViolations.filter((violation) => violation.source.includes(needle));
	assert.equal(bySource('hsl(0 100% 50%)').length, 1, 'hsl() in background');
	assert.equal(bySource('hwb(220 30% 20%)').length, 1, 'hwb() in border-color');
	assert.equal(
		bySource('lab(29.2345% 39.3825 20.0664)').length,
		1,
		'lab() in color',
	);
	assert.equal(
		bySource('lch(52.2% 72.2 50)').length,
		1,
		'lch() in outline-color',
	);
	assert.equal(bySource('oklab(59% 0.1 0.1)').length, 1, 'oklab() in fill');
	assert.equal(bySource('oklch(60% 0.15 30)').length, 1, 'oklch() in stroke');
	assert.equal(
		bySource('color(display-p3 1 0 0)').length,
		1,
		'color() in background-color',
	);
	assert.equal(
		bySource('oklch(70% 0.1 200)').length,
		1,
		'oklch() in a custom property',
	);
	assert.equal(
		bySource('bg-[hsl(220_10%_10%)]').length,
		1,
		'oklch()/hsl() inside a Tailwind arbitrary-value utility',
	);
	assert.equal(colorViolations.length, 9);
});

// r5-ui-F2: three evasions different in shape from the round-5-cited example
// (a Tailwind `bg-[hsl(...)]` utility) — a quoted/templated non-rgba colour
// function, a `color-mix()` call whose operand is a raw literal instead of a
// `var(...)` reference, and the same raw-operand shape nested inside an
// otherwise-safe-looking `color-mix()` transparency blend. Each is planted,
// proven caught, then removed (see the packet report for the RED/GREEN
// transcripts of the underlying regex change).
test('r5-ui-F2: flags a quoted oklch() string literal (not just rgba)', async () => {
	const root = await makeFixture({
		'src/components/table/data-table.tsx':
			"const glow = 'oklch(70% 0.15 260)';",
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.filter((violation) => violation.ruleId === 'no-raw-visual-color')
			.length,
		1,
	);
});

test('r5-ui-F2: flags a raw colour literal in a shadow-[] arbitrary utility, not just bg/text/border/ring', async () => {
	const root = await makeFixture({
		'src/components/app-shell/app-shell.tsx':
			'<div className="shadow-[0_0_0_3px_rgba(253,199,0,0.16)]" />',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.filter((violation) => violation.ruleId === 'no-raw-visual-color')
			.length,
		1,
	);
});

// W5-PROOF: the original version of this test put both fixture lines in a
// `<property>: color-mix(...)` CSS declaration, which the pre-existing
// RAW_COLOR_PROPERTY_HEX_PATTERN_MULTILINE/RAW_COLOR_PROPERTY_RGBA_PATTERN_MULTILINE
// scanners already flag on their own — their `[^;]*` infix tolerance matches
// straight through `color-mix(in srgb, ` to the `#fff`/`rgba(` operand
// beyond it, with no awareness that `color-mix` is even present. Deleting
// COLOR_MIX_RAW_OPERAND_PATTERN left the test green, so it never proved the
// new detector does anything. This fixture instead puts the exact same
// operand shapes inside a plain template-literal assignment in a .tsx file —
// no CSS property name, no custom-property prefix, no Tailwind arbitrary
// bracket, no quote immediately before the colour function (the one shape
// QUOTED_DIRECT_COLOR_PATTERN would catch) — so only
// COLOR_MIX_RAW_OPERAND_PATTERN can see the raw operand.
test('r5-ui-F2: flags color-mix() whose operand is a raw hex/rgba literal, not a token reference', async () => {
	const root = await makeFixture({
		'src/components/table/data-table.tsx': [
			'const glowA = `color-mix(in srgb, #fff 25%, transparent)`;',
			'const glowB = `color-mix(in srgb, rgba(0, 0, 0, 0.4) 10%, white)`;',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});
	const colorViolations = violations.filter(
		(violation) => violation.ruleId === 'no-raw-visual-color',
	);
	const flaggedLines = new Set(
		colorViolations.map((violation) => violation.line),
	);

	assert.equal(colorViolations.length, 2);
	assert.deepEqual([...flaggedLines].sort(), [1, 2]);
});

// W5-HARDEN (W5-VERIFY2): three evasions different in shape from the
// original raw-hex/rgba fixture above, all planted by the verifier and all
// invisible to the old whole-expression regex (`[^)]*` stopped at the first
// nested `)`, and the pattern never recognised a bare named colour or a
// `color()` function at all):
//  - a raw colour as the SECOND operand, after a var() first operand;
//  - a bare named CSS colour keyword (`white`) with no function wrapper;
//  - a `color(display-p3 ...)` function operand.
test('r5-ui-F2 (hardened): flags a raw second operand after var(), a bare named colour, and color()', async () => {
	const root = await makeFixture({
		'src/components/table/data-table.tsx': [
			'const rawSecondOperand = `color-mix(in srgb, var(--primary) 50%, #ffffff)`;',
			'const namedRawOperand = `color-mix(in srgb, white 25%, transparent)`;',
			'const colorFunctionOperand = `color-mix(in srgb, color(display-p3 1 0 0) 25%, transparent)`;',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});
	const colorViolations = violations.filter(
		(violation) => violation.ruleId === 'no-raw-visual-color',
	);
	const flaggedLines = new Set(
		colorViolations.map((violation) => violation.line),
	);

	assert.equal(colorViolations.length, 3);
	assert.deepEqual([...flaggedLines].sort(), [1, 2, 3]);
});

// A color-mix() whose colour-interpolation clause (`in oklab`) and every
// operand is a var()/theme-invariant keyword must still be clean — the
// operand parser must not regress into flagging the safe case it exists to
// permit.
test('r5-ui-F2 (hardened): does not flag a fully token-referencing color-mix()', async () => {
	const root = await makeFixture({
		'src/components/table/data-table.tsx':
			'const glow = `color-mix(in oklab, var(--publy-primary) 25%, transparent)`;',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.deepEqual(
		violations.filter(
			(violation) => violation.ruleId === 'no-raw-visual-color',
		),
		[],
	);
});

// W6-GUARDS (tests F5): `isSafeColorMixValue` accepted ANY operand starting
// with `var(` as safe, without inspecting its fallback — a raw-literal
// fallback (rendered by the browser whenever the custom property is unset)
// is exactly as raw as a bare literal operand.
test('W6-GUARDS: flags a color-mix() operand whose var() carries a raw hex fallback', async () => {
	const root = await makeFixture({
		'src/components/table/data-table.tsx':
			'const glow = `color-mix(in srgb, var(--missing-brand, #ffffff) 50%, transparent)`;',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.filter((violation) => violation.ruleId === 'no-raw-visual-color')
			.length,
		1,
	);
});

// Regression guard: a var() fallback that is ITSELF safe (another token
// reference, or a theme-invariant keyword) must stay clean.
test('W6-GUARDS: does not flag a color-mix() operand whose var() fallback is itself a safe token/keyword (regression guard)', async () => {
	const root = await makeFixture({
		'src/components/table/data-table.tsx': [
			'const a = `color-mix(in srgb, var(--publy-primary, var(--publy-accent)) 50%, transparent)`;',
			'const b = `color-mix(in srgb, var(--publy-primary, transparent) 50%, transparent)`;',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.deepEqual(
		violations.filter(
			(violation) => violation.ruleId === 'no-raw-visual-color',
		),
		[],
	);
});

// W5-HARDEN2 item 4A: CSS function/keyword spelling is ASCII case-insensitive
// end to end — `COLOR-MIX(IN SRGB, WHITE 25%, TRANSPARENT)` is exactly as raw
// as the lowercase form, but the opener regex used to be case-sensitive.
test('W5-HARDEN2: flags an uppercase-spelled color-mix() with a raw operand', async () => {
	const root = await makeFixture({
		'src/components/table/data-table.tsx':
			'const glow = `COLOR-MIX(IN SRGB, WHITE 25%, TRANSPARENT)`;',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.filter((violation) => violation.ruleId === 'no-raw-visual-color')
			.length,
		1,
	);
});

// W5-HARDEN2 item 4B: the ordinary source driver tests one line at a time,
// so a color-mix() call wrapped across several lines (a multi-line template
// literal) never has its matching close paren on the same line the opener
// was found on — invisible to a per-line scan. A whole-file pass (mirroring
// how the CSS statement-join branch already spans multiple lines) is
// required to see it.
test('W5-HARDEN2: flags a color-mix() with a raw operand wrapped across multiple lines in a .tsx template literal', async () => {
	const root = await makeFixture({
		'src/components/table/data-table.tsx': [
			'export const w5Harden2ColorMix = `color-mix(',
			'\tin srgb,',
			'\tvar(--publy-primary) 50%,',
			'\twhite 50%',
			')`;',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});
	const colorViolations = violations.filter(
		(violation) => violation.ruleId === 'no-raw-visual-color',
	);

	assert.equal(colorViolations.length, 1);
	assert.equal(colorViolations[0].line, 1);
});

// A multi-line color-mix() call whose every operand is safe must still be
// clean — the whole-file pass must not regress into treating "spans several
// lines" itself as suspicious.
test('W5-HARDEN2: does not flag a fully token-referencing color-mix() wrapped across multiple lines', async () => {
	const root = await makeFixture({
		'src/components/table/data-table.tsx': [
			'export const w5Harden2ColorMix = `color-mix(',
			'\tin srgb,',
			'\tvar(--publy-primary) 50%,',
			'\ttransparent',
			')`;',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.deepEqual(
		violations.filter(
			(violation) => violation.ruleId === 'no-raw-visual-color',
		),
		[],
	);
});

// W5-HARDEN2 item 4 (over-rejection, boundary matrix): a fully token-derived
// NESTED color-mix() and a token-derived relative-colour operand
// (`rgb(from var(--x) r g b)`) must NOT be flagged — every colour source in
// both is theme-aware, only the syntax is more complex than a bare var().
test('W5-HARDEN2: does not flag a fully token-referencing nested color-mix() or relative-colour operand', async () => {
	const root = await makeFixture({
		'src/components/table/data-table.tsx': [
			'const nested = `color-mix(in srgb, color-mix(in srgb, var(--publy-primary) 50%, transparent) 50%, var(--publy-secondary))`;',
			'const relative = `color-mix(in srgb, rgb(from var(--publy-primary) r g b) 50%, transparent)`;',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.deepEqual(
		violations.filter(
			(violation) => violation.ruleId === 'no-raw-visual-color',
		),
		[],
	);
});

// The nested/relative safety carve-outs above must not become a blanket
// exemption: a nested color-mix() with its OWN raw operand, and a relative
// operand based on a raw (non-var) colour, must still be flagged.
test('W5-HARDEN2: still flags a nested color-mix() with its own raw operand, and a relative-colour operand based on a raw colour', async () => {
	const root = await makeFixture({
		'src/components/table/data-table.tsx': [
			'const nested = `color-mix(in srgb, color-mix(in srgb, white 50%, transparent) 50%, var(--publy-secondary))`;',
			'const relative = `color-mix(in srgb, rgb(from white r g b) 50%, transparent)`;',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});
	const colorViolations = violations.filter(
		(violation) => violation.ruleId === 'no-raw-visual-color',
	);
	const flaggedLines = new Set(
		colorViolations.map((violation) => violation.line),
	);

	assert.equal(colorViolations.length, 2);
	assert.deepEqual([...flaggedLines].sort(), [1, 2]);
});

test('r4-ui-F3: token-theme-parity flags a light-only root oklch() token with no html.dark counterpart', async () => {
	const root = await makeFixture({
		'src/styles/app.css': [
			':root {',
			'\t--publy-surface-experimental: oklch(95% 0.02 90);',
			'}',
			'',
			'html.dark {',
			'\t--publy-other-token: 1;',
			'}',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
		checkTokenGuards: true,
	});

	assert.ok(
		violations.some(
			(violation) =>
				violation.ruleId === 'token-theme-parity' &&
				violation.source.includes('oklch'),
		),
	);
});

test('r4-ui-F3: does not flag color-mix() referencing a token as a raw colour literal', async () => {
	const root = await makeFixture({
		'src/styles/other.css':
			'.ok { background: color-mix(in srgb, var(--publy-primary) 25%, transparent); }',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.filter((violation) => violation.ruleId === 'no-raw-visual-color')
			.length,
		0,
	);
});

test('flags wrapped internal staff and tenant anchors in authed routes', async () => {
	const root = await makeFixture({
		'src/routes/authed/staff/example.tsx': `
			<a
				href="/staff/dashboard"
				className="quiet"
			>
				Staff
			</a>
			<a
				href="/tenant"
			>
				Tenant
			</a>
		`,
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.filter(
			(violation) => violation.ruleId === 'no-raw-internal-anchor',
		).length,
		2,
	);
});

test('flags a raw anchor whose href is a path-constant expression', async () => {
	const root = await makeFixture({
		'src/routes/authed/staff/example.tsx':
			'<a href={STAFF_INVITATIONS_LIST_PATH} className="publy-back-link">Back</a>',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});
	const anchors = violations.filter(
		(violation) => violation.ruleId === 'no-raw-internal-anchor',
	);

	assert.equal(anchors.length, 1);
	assert.match(anchors[0].source, /href=\{STAFF_INVITATIONS_LIST_PATH\}/);
});

test('does not flag a TanStack Link with a path-constant `to` prop', async () => {
	const root = await makeFixture({
		'src/routes/authed/staff/example.tsx':
			'<Link to={STAFF_INVITATIONS_LIST_PATH} className="publy-back-link">Back</Link>',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});
	const anchors = violations.filter(
		(violation) => violation.ruleId === 'no-raw-internal-anchor',
	);

	assert.equal(anchors.length, 0);
});

test('flags a page.route glob whose trailing single star cannot cross a path separator', async () => {
	const root = await makeFixture({
		'e2e/tenants.spec.ts':
			"await page.route('**/staff/tenants*', handler);\nawait page.route('**/staff/profiles**', handler);",
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDirs: [path.join(root, 'e2e')],
	});

	const globViolations = violations.filter(
		(violation) => violation.ruleId === 'no-single-star-route-glob',
	);

	assert.equal(globViolations.length, 1);
	assert.equal(globViolations[0].line, 1);
	assert.match(globViolations[0].source, /staff\/tenants\*/);
});

test('a design-system-ignore marker suppresses only when it carries a reason', async () => {
	const bare = await makeFixture({
		'e2e/bare.spec.ts':
			"// design-system-ignore: no-single-star-route-glob\nawait page.route('**/staff/tenants*', handler);",
	});
	const reasoned = await makeFixture({
		'e2e/reasoned.spec.ts':
			"// design-system-ignore: no-single-star-route-glob — collection-only mock\nawait page.route('**/staff/tenants*', handler);",
	});

	const countFor = async (root) => {
		const violations = await scanFront2DesignSystem({
			baseDir: root,
			sourceDirs: [path.join(root, 'e2e')],
		});
		return violations.filter(
			(violation) => violation.ruleId === 'no-single-star-route-glob',
		).length;
	};

	assert.equal(await countFor(bare), 1, 'a bare marker must not suppress');
	assert.equal(await countFor(reasoned), 0, 'a reasoned marker must suppress');
});

// W5-PROOF: a JSX-comment-form marker whose only "reason" text is the
// comment's own closing delimiter (`*/}`) must not count as reasoned — the
// same emptiness bug the data-honesty and i18n-guard suppression conventions
// shared.
test('a design-system-ignore marker in JSX-comment form still requires a reason beyond `*/}`', async () => {
	const countForSource = async (source) => {
		const root = await makeFixture({ 'e2e/jsx.spec.ts': source });
		const violations = await scanFront2DesignSystem({
			baseDir: root,
			sourceDirs: [path.join(root, 'e2e')],
		});
		return violations.filter(
			(violation) => violation.ruleId === 'no-single-star-route-glob',
		).length;
	};

	assert.equal(
		await countForSource(
			"{/* design-system-ignore: no-single-star-route-glob */}\nawait page.route('**/staff/tenants*', handler);",
		),
		1,
		'a bare JSX comment marker (only `*/}` after the rule id) must not suppress',
	);
	assert.equal(
		await countForSource(
			"{/* design-system-ignore: no-single-star-route-glob   */}\nawait page.route('**/staff/tenants*', handler);",
		),
		1,
		'trailing whitespace before the JSX close must not count as a reason',
	);
	assert.equal(
		await countForSource(
			"{/* design-system-ignore: no-single-star-route-glob . */}\nawait page.route('**/staff/tenants*', handler);",
		),
		1,
		'a single non-word character must not count as a reason',
	);
	assert.equal(
		await countForSource(
			"{/* design-system-ignore: no-single-star-route-glob — collection-only mock */}\nawait page.route('**/staff/tenants*', handler);",
		),
		0,
		'a genuine reasoned JSX comment marker must still suppress',
	);
});

test('F30: flags a single-star glob registered via context.route(), not just page.route()', async () => {
	const root = await makeFixture({
		'e2e/context-route.spec.ts':
			"await context.route('**/staff/tenants*', handler);",
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDirs: [path.join(root, 'e2e')],
	});

	const globViolations = violations.filter(
		(violation) => violation.ruleId === 'no-single-star-route-glob',
	);

	assert.equal(globViolations.length, 1);
	assert.match(globViolations[0].source, /staff\/tenants\*/);
});

// W6-GUARDS (tests F6): a fixture/receiver alias — a renamed or destructured
// Playwright fixture, not the two hand-picked names `page`/`context` — was
// structurally invisible to the previous receiver-name-anchored regex.
test('W6-GUARDS: flags a single-star glob registered via an aliased receiver, not just page/context', async () => {
	const root = await makeFixture({
		'e2e/staff-fixture.spec.ts':
			"await staffPage.route('**/staff/tenants*', handler);",
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDirs: [path.join(root, 'e2e')],
	});

	const globViolations = violations.filter(
		(violation) => violation.ruleId === 'no-single-star-route-glob',
	);

	assert.equal(globViolations.length, 1);
	assert.match(globViolations[0].source, /staff\/tenants\*/);
});

// W6-GUARDS (tests F6): a glob passed through a local constant instead of an
// inline literal — a different shape from the alias evasion above — can
// never be statically checked for the single-star shape, so it must fail
// closed rather than silently pass.
test('W6-GUARDS: fails closed when a route glob is passed as a non-literal identifier, not inlined', async () => {
	const root = await makeFixture({
		'e2e/constant-glob.spec.ts':
			"const glob = '**/staff/tenants*';\nawait page.route(glob, handler);",
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDirs: [path.join(root, 'e2e')],
	});

	const globViolations = violations.filter(
		(violation) => violation.ruleId === 'no-single-star-route-glob',
	);

	assert.equal(globViolations.length, 1);
	assert.match(globViolations[0].source, /page\.route\(glob/);
});

// Regression guard: this codebase's existing e2e specs widely compose globs
// as template literals (`` `**/staff/tenants/${TENANT_ID}/users` `` and
// similar), with or without a trailing `**`. The fail-closed constant check
// above must not treat every template-literal glob as unresolvable — only a
// genuinely non-literal (bare identifier) argument.
test('W6-GUARDS: does not fail closed on an ordinary interpolated template-literal glob (regression guard)', async () => {
	const root = await makeFixture({
		'e2e/template-glob.spec.ts':
			'await page.route(\n\t`**/staff/tenants/${TENANT_ID}/users/export**`,\n\thandler,\n);',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDirs: [path.join(root, 'e2e')],
	});

	const globViolations = violations.filter(
		(violation) => violation.ruleId === 'no-single-star-route-glob',
	);

	assert.equal(globViolations.length, 0);
});

test('F5: no-raw-visual-color is block-aware in app.css, not file-aware — raw hex outside :root/html.dark still fails', async () => {
	const root = await makeFixture({
		'src/styles/app.css': [
			':root {',
			'\t--publy-primary: #fdc700;',
			'}',
			'',
			'html.dark {',
			'\t--publy-primary: #f0bd00;',
			'}',
			'',
			'.publy-new-rule {',
			'\tbackground: #ffffff;',
			'}',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	const colorViolations = violations.filter(
		(violation) => violation.ruleId === 'no-raw-visual-color',
	);

	// The two :root/html.dark declarations are allowed; the third raw hex,
	// outside both blocks, is not — this is exactly the F1 shape (a new rule
	// with a hardcoded #fff outside the token layer) that a whole-file
	// `allow: (path) => path === 'src/styles/app.css'` exemption would miss.
	assert.equal(colorViolations.length, 1);
	assert.match(colorViolations[0].source, /background:\s*#ffffff/);
});

// r3 F3: the property allowlist previously only covered
// color/background/border-color/outline-color — a `border:`/`outline:`
// shorthand carrying the same literal sailed through unflagged, which is
// exactly how .btn-primary-chrome's border landed unscanned next to its
// correctly-tokenised box-shadow twin.
test('r3 F3: no-raw-visual-color catches the border/outline shorthand, not just border-color/outline-color', async () => {
	const root = await makeFixture({
		'src/styles/app.css': [
			':root {',
			'\t--publy-primary: #fdc700;',
			'}',
			'',
			'html.dark {',
			'\t--publy-primary: #f0bd00;',
			'}',
			'',
			'.publy-new-chrome {',
			'\tborder: 1px solid rgba(255, 255, 255, 0.12);',
			'\toutline: 2px solid #ffffff;',
			'}',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	const colorViolations = violations.filter(
		(violation) => violation.ruleId === 'no-raw-visual-color',
	);

	assert.equal(colorViolations.length, 2);
	assert.ok(colorViolations.some((v) => /border:/.test(v.source)));
	assert.ok(colorViolations.some((v) => /outline:/.test(v.source)));
});

// r3 F3: a raw literal handed straight to a `--custom-prop:` declaration has
// no property name at all, so it was invisible to every pattern in the
// rule — the shape 32 `--publy-icon-tile-bg`/`-fg` literals shipped as.
test('r3 F3: no-raw-visual-color catches a raw colour literal in a custom-property declaration', async () => {
	const root = await makeFixture({
		'src/styles/app.css': [
			':root {',
			'\t--publy-primary: #fdc700;',
			'}',
			'',
			'html.dark {',
			'\t--publy-primary: #f0bd00;',
			'}',
			'',
			".publy-tone-tile[data-tone='0'] {",
			'\t--publy-tone-bg: #f0f9ff;',
			'}',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	const colorViolations = violations.filter(
		(violation) => violation.ruleId === 'no-raw-visual-color',
	);

	assert.equal(colorViolations.length, 1);
	assert.match(colorViolations[0].source, /--publy-tone-bg:\s*#f0f9ff/);
});

// r3 F3: token-theme-parity's :root/html.dark loop is blind to a
// colour-valued custom property declared on an ordinary component
// selector — the same 32-literal shape, but checking whether it has a
// paired `html.dark <selector>` counterpart rather than whether it's a raw
// literal at all.
test('r3 F3: token-theme-parity flags a selector-scoped custom property with no html.dark counterpart', async () => {
	const root = await makeFixture({
		'src/styles/app.css': [
			':root {',
			'\t--publy-primary: #fdc700;',
			'}',
			'',
			'html.dark {',
			'\t--publy-primary: #f0bd00;',
			'}',
			'',
			".publy-tone-tile[data-tone='0'] {",
			'\t--publy-tone-bg: #f0f9ff;',
			'}',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
		checkTokenGuards: true,
	});

	const parityHits = violations.filter(
		(violation) =>
			violation.ruleId === 'token-theme-parity' &&
			/--publy-tone-bg/.test(violation.source),
	);

	assert.equal(parityHits.length, 1);
});

test('r3 F3: token-theme-parity does not flag a selector-scoped custom property that has a matching html.dark counterpart', async () => {
	const root = await makeFixture({
		'src/styles/app.css': [
			':root {',
			'\t--publy-primary: #fdc700;',
			'}',
			'',
			'html.dark {',
			'\t--publy-primary: #f0bd00;',
			'}',
			'',
			".publy-tone-tile[data-tone='0'] {",
			'\t--publy-tone-bg: #f0f9ff;',
			'}',
			'',
			"html.dark .publy-tone-tile[data-tone='0'] {",
			'\t--publy-tone-bg: #082f49;',
			'}',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
		checkTokenGuards: true,
	});

	const parityHits = violations.filter(
		(violation) =>
			violation.ruleId === 'token-theme-parity' &&
			/--publy-tone-bg/.test(violation.source),
	);

	assert.equal(parityHits.length, 0);
});

// r3 F4: `recordViolation` only honoured `design-system-ignore` when it
// received a `lines` argument — the default line-scan branch (every
// line-mode rule except the two `mode: 'source'` rules) called it without
// one, so the escape hatch was inert for exactly the rules contributors are
// most likely to reach for it on.
test('r3 F4: a design-system-ignore marker suppresses a default line-scan rule (no-prototype-icons)', async () => {
	const bare = await makeFixture({
		'src/routes/authed/staff/bare.tsx':
			'// design-system-ignore: no-prototype-icons\n<AppErrorView icon="!" title="Error" />',
	});
	const reasoned = await makeFixture({
		'src/routes/authed/staff/reasoned.tsx':
			'// design-system-ignore: no-prototype-icons — legacy fixture pending redesign\n<AppErrorView icon="!" title="Error" />',
	});

	const countFor = async (root) => {
		const violations = await scanFront2DesignSystem({
			baseDir: root,
			sourceDir: path.join(root, 'src'),
		});
		return violations.filter(
			(violation) => violation.ruleId === 'no-prototype-icons',
		).length;
	};

	assert.equal(await countFor(bare), 1, 'a bare marker must not suppress');
	assert.equal(await countFor(reasoned), 0, 'a reasoned marker must suppress');
});

test('F6: throws on a vacuous scan (0 files) instead of silently passing', async () => {
	const root = await makeFixture({
		'src/keep.txt':
			'not scanned — wrong extension, and directory is empty of .ts/.tsx/.css',
	});

	await assert.rejects(
		() =>
			scanFront2DesignSystem({
				baseDir: root,
				sourceDirs: [path.join(root, 'nonexistent-dir')],
			}),
		/scanned 0 files/,
	);
});

test('F6: does not throw when the scan finds at least one file', async () => {
	const root = await makeFixture({
		'src/example.tsx': '<div />',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(Array.isArray(violations), true);
	assert.equal(violations.scannedFileCount, 1);
});

test('r3-F4: throws when one of several sourceDirs is missing, even though the combined total is non-zero', async () => {
	const root = await makeFixture({
		'src/example.tsx': '<div />',
	});

	// `src/` alone contributes a file, so the old combined `files.length === 0`
	// check would never fire here — but `e2e/` was never created, so any rule
	// scoped to `e2e/` (e.g. `no-single-star-route-glob`) silently scans
	// nothing. This must still throw.
	await assert.rejects(
		() =>
			scanFront2DesignSystem({
				baseDir: root,
				sourceDirs: [path.join(root, 'src'), path.join(root, 'e2e')],
			}),
		/scanned 0 files from 1 of 2 source directories/,
	);
});

test('F7: self-pruning stale-debt check flags a guardDebt entry whose source text no longer appears in its file', async () => {
	const root = await makeFixture({
		'src/routes/authed/staff/example.tsx':
			'<div className="rounded-full">x</div>',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
		checkStaleDebt: true,
		guardDebt: [
			{
				ruleId: 'no-rounded-full-or-999-radius',
				file: 'src/routes/authed/staff/example.tsx',
				sourceIncludes: 'this substring was never in the file',
				reason: 'fixture: intentionally stale',
			},
		],
	});

	const staleViolations = violations.filter(
		(violation) => violation.ruleId === 'stale-guard-debt',
	);

	assert.equal(staleViolations.length, 1);
	assert.equal(staleViolations[0].file, 'src/routes/authed/staff/example.tsx');
});

test('F7: self-pruning stale-debt check does not flag a guardDebt entry that still matches', async () => {
	const root = await makeFixture({
		'src/routes/authed/staff/example.tsx':
			'<div className="rounded-full">x</div>',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
		checkStaleDebt: true,
		guardDebt: [
			{
				ruleId: 'no-rounded-full-or-999-radius',
				file: 'src/routes/authed/staff/example.tsx',
				sourceIncludes: 'rounded-full',
				reason: 'fixture: still valid',
			},
		],
	});

	assert.equal(
		violations.some((violation) => violation.ruleId === 'stale-guard-debt'),
		false,
	);
});

// r3 F10: a debt entry whose file was deleted entirely (not just present
// with different content) used to `continue` past unnoticed, so it lived on
// forever and would silently re-permit a violation if the path was ever
// recreated.
test('r3 F10: self-pruning stale-debt check flags a guardDebt entry whose file no longer exists in the scan', async () => {
	const root = await makeFixture({
		'src/routes/authed/staff/still-here.tsx': '<div>ok</div>',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
		checkStaleDebt: true,
		guardDebt: [
			{
				ruleId: 'no-rounded-full-or-999-radius',
				file: 'src/routes/authed/staff/deleted-file.tsx',
				sourceIncludes: 'rounded-full',
				reason: 'fixture: file no longer exists',
			},
		],
	});

	const staleViolations = violations.filter(
		(violation) => violation.ruleId === 'stale-guard-debt',
	);

	assert.equal(staleViolations.length, 1);
	assert.equal(
		staleViolations[0].file,
		'src/routes/authed/staff/deleted-file.tsx',
	);
});

test('F7: self-pruning stale-debt check is opt-in — off by default so a fixture reusing a real debt file path is not misjudged', async () => {
	// This exact relative path is a real KNOWN_HANDOFF_GUARD_DEBT file in the
	// live scripts/check-design-system.mjs list, registered against a
	// completely different sourceIncludes substring than this fixture's
	// content. Without the opt-in default, this fixture alone would
	// misreport that real entry as stale.
	const root = await makeFixture({
		'src/components/app-shell/app-shell.tsx':
			'<div className="unrelated-fixture-markup" />',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.some((violation) => violation.ruleId === 'stale-guard-debt'),
		false,
	);
});

test('F9: no-important-foundation catches the Tailwind v4 `suffix!` syntax, not just the dead v3 `!prefix` form', async () => {
	const root = await makeFixture({
		'src/components/table/v4-important.tsx':
			'<div className="border-transparent! top-1/2!">Bad</div>',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.some(
			(violation) => violation.ruleId === 'no-important-foundation',
		),
		true,
	);
});

test('F9: no-important-foundation now scans app.css, where the real !important declarations live', async () => {
	const root = await makeFixture({
		'src/styles/app.css': '.new-rule {\n\tcolor: red !important;\n}\n',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.some(
			(violation) =>
				violation.ruleId === 'no-important-foundation' &&
				violation.file === 'src/styles/app.css',
		),
		true,
	);
});

test('F3: token-theme-parity flags a colour token declared in :root with no html.dark counterpart', async () => {
	const root = await makeFixture({
		'src/styles/app.css': [
			':root {',
			'\t--publy-alert-critical-bg: #fee2e2;',
			'}',
			'',
			'html.dark {',
			'\t--publy-background: #18181b;',
			'}',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
		checkTokenGuards: true,
	});

	const parityHits = violations.filter(
		(violation) => violation.ruleId === 'token-theme-parity',
	);

	assert.equal(parityHits.length, 1);
	assert.match(parityHits[0].source, /--publy-alert-critical-bg/);
});

test('F3: token-theme-parity does not flag a token whose value only references another (already themed) token', async () => {
	const root = await makeFixture({
		'src/styles/app.css': [
			':root {',
			'\t--publy-border: #e4e4e7;',
			'\t--publy-shadow-ring: 0 0 0 1px var(--publy-border);',
			'\t--publy-focus-ring: color-mix(in srgb, var(--publy-primary) 25%, transparent);',
			'}',
			'',
			'html.dark {',
			'\t--publy-border: rgba(255, 255, 255, 0.1);',
			'}',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
		checkTokenGuards: true,
	});

	assert.equal(
		violations.some((violation) => violation.ruleId === 'token-theme-parity'),
		false,
	);
});

test('F3: token-theme-parity does not flag the documented theme-invariant allowlist', async () => {
	const root = await makeFixture({
		'src/styles/app.css': [
			':root {',
			'\t--publy-avatar-1: #0f766e;',
			'\t--publy-auth-panel-bg: #18181b;',
			'\t--publy-shadow-chrome: 0 2px 2px rgba(255, 255, 255, 0.1) inset;',
			'}',
			'',
			'html.dark {',
			'\t--publy-background: #18181b;',
			'}',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
		checkTokenGuards: true,
	});

	assert.equal(
		violations.some((violation) => violation.ruleId === 'token-theme-parity'),
		false,
	);
});

test('F3: token-must-be-declared flags a --publy-* reference with no declaration anywhere in app.css', async () => {
	const root = await makeFixture({
		'src/styles/app.css': ':root {\n\t--publy-primary: #fdc700;\n}\n',
		'src/components/ui/card.tsx':
			'<div style={{ boxShadow: "var(--publy-shadow-card)" }} />',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
		checkTokenGuards: true,
	});

	const declaredHits = violations.filter(
		(violation) => violation.ruleId === 'token-must-be-declared',
	);

	assert.equal(declaredHits.length, 1);
	assert.equal(declaredHits[0].file, 'src/components/ui/card.tsx');
	assert.match(declaredHits[0].source, /--publy-shadow-card/);
});

test('F3: token-must-be-declared does not flag a reference to a token declared in app.css', async () => {
	const root = await makeFixture({
		'src/styles/app.css': ':root {\n\t--publy-primary: #fdc700;\n}\n',
		'src/components/ui/card.tsx':
			'<div style={{ color: "var(--publy-primary)" }} />',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
		checkTokenGuards: true,
	});

	assert.equal(
		violations.some(
			(violation) => violation.ruleId === 'token-must-be-declared',
		),
		false,
	);
});

// W6-GUARDS (ui F3): the token-declaration extractor regexed raw source text
// without stripping comments, so a commented-out mention of a token name
// satisfied `token-must-be-declared` for a real usage even though no actual
// declaration exists anywhere.
test('W6-GUARDS: token-must-be-declared still flags a reference whose only "declaration" is inside a CSS comment', async () => {
	const root = await makeFixture({
		'src/styles/app.css':
			':root {\n\t/* --publy-missing: reserved; */\n\t--publy-primary: #fdc700;\n}\n',
		'src/components/ui/card.tsx':
			'<div style={{ boxShadow: "var(--publy-missing)" }} />',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
		checkTokenGuards: true,
	});

	const declaredHits = violations.filter(
		(violation) => violation.ruleId === 'token-must-be-declared',
	);

	assert.equal(declaredHits.length, 1);
	assert.match(declaredHits[0].source, /--publy-missing/);
});

// W6-GUARDS (ui F3): the same comment-blindness let token-theme-parity pass
// a token that is genuinely declared in :root but only ever COMMENTED in
// html.dark — the parity guard must still see it as missing a real dark
// counterpart.
test('W6-GUARDS: token-theme-parity still flags a token whose only html.dark "counterpart" is inside a CSS comment', async () => {
	const root = await makeFixture({
		'src/styles/app.css':
			':root {\n\t--publy-primary: #fdc700;\n}\n\nhtml.dark {\n\t/* --publy-primary: dark value pending; */\n}\n',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
		checkTokenGuards: true,
	});

	const parityHits = violations.filter(
		(violation) => violation.ruleId === 'token-theme-parity',
	);

	assert.equal(parityHits.length, 1);
	assert.match(parityHits[0].source, /--publy-primary/);
});

test('F3: token guards are opt-in — off by default so an existing fixture without a full token layer is not misjudged', async () => {
	const root = await makeFixture({
		'src/styles/app.css': ':root {\n\t--publy-alert-critical-bg: #fee2e2;\n}\n',
		'src/components/ui/card.tsx': 'var(--publy-undeclared-token)',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.some(
			(violation) =>
				violation.ruleId === 'token-theme-parity' ||
				violation.ruleId === 'token-must-be-declared',
		),
		false,
	);
});

test('F4: no-important-foundation now scans src/components/ui/ and src/routes/, where r1 left a bg-red-500!-shaped regression invisible', async () => {
	const root = await makeFixture({
		'src/components/ui/new-primitive.tsx':
			'<div className="bg-red-500!">Bad</div>',
		'src/routes/authed/staff/example.tsx':
			'<div className="bg-red-500!">Bad</div>',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	const hits = violations.filter(
		(violation) => violation.ruleId === 'no-important-foundation',
	);

	assert.equal(hits.length, 2);
	assert.equal(
		hits.some(
			(violation) => violation.file === 'src/components/ui/new-primitive.tsx',
		),
		true,
	);
	assert.equal(
		hits.some(
			(violation) => violation.file === 'src/routes/authed/staff/example.tsx',
		),
		true,
	);
});

test('F4: no-important-foundation excludes test-file string fixtures under src/routes/ from the widened scan', async () => {
	const root = await makeFixture({
		'src/routes/authed/staff/example.test.tsx':
			"target: { value: 'Not Valid!' },",
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.some(
			(violation) => violation.ruleId === 'no-important-foundation',
		),
		false,
	);
});

test('F4: the real src/components/ui/ pre-existing `!`-suffix usages (badge, tabs, tooltip) are recorded debt, not silent violations', async () => {
	const violations = await scanFront2DesignSystem({ checkStaleDebt: true });

	assert.deepEqual(
		violations.filter(
			(violation) =>
				violation.ruleId === 'no-important-foundation' &&
				violation.file.startsWith('src/components/ui/'),
		),
		[],
	);
	assert.deepEqual(
		violations.filter((violation) => violation.ruleId === 'stale-guard-debt'),
		[],
	);
});

test('F4: no-raw-visual-color is multi-line-aware — a wrapped box-shadow with the property name and the colour literal on different lines still fails', async () => {
	const root = await makeFixture({
		'src/styles/app.css': [
			'@layer components {',
			'\t.publy-new-elevated-rule {',
			'\t\tbox-shadow:',
			'\t\t\t0 20px 25px -5px rgb(0 0 0 / 0.15),',
			'\t\t\t0 8px 10px -6px rgb(0 0 0 / 0.15);',
			'\t}',
			'}',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	const colorViolations = violations.filter(
		(violation) => violation.ruleId === 'no-raw-visual-color',
	);

	assert.equal(colorViolations.length, 1);
	assert.match(colorViolations[0].source, /box-shadow/);
	assert.match(colorViolations[0].source, /rgb\(0 0 0 \/ 0\.15\)/);
});

test('F4: no-raw-visual-color multi-line scanning still respects the :root/html.dark token-layer exemption', async () => {
	const root = await makeFixture({
		'src/styles/app.css': [
			':root {',
			'\t--publy-shadow-menu:',
			'\t\t0 12px 32px rgba(24, 24, 27, 0.14),',
			'\t\t0 2px 6px rgba(24, 24, 27, 0.06);',
			'}',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.some((violation) => violation.ruleId === 'no-raw-visual-color'),
		false,
	);
});

test('F4: the real .publy-selection-bar rule no longer hardcodes a raw rgb() shadow (moved to a token)', async () => {
	const css = await readFile(
		new URL('../src/styles/app.css', import.meta.url),
		'utf8',
	);

	const ruleMatch = css.match(/\.publy-selection-bar\s*\{([^}]*)\}/);
	assert.notEqual(ruleMatch, null, '.publy-selection-bar rule not found');
	assert.doesNotMatch(ruleMatch[1], /rgb\(/);
	assert.match(ruleMatch[1], /var\(--publy-shadow-selection-bar\)/);
});

test('F6: .publy-state-icon svg is declared exactly once (the un-layered copy); the layered duplicate is gone', async () => {
	const css = await readFile(
		new URL('../src/styles/app.css', import.meta.url),
		'utf8',
	);

	const occurrences = css.match(/\.publy-state-icon svg \{/g) ?? [];
	assert.equal(occurrences.length, 1);
});

test('F6: the tbody last-child border-bottom rule no longer has a dead layered `{ border-bottom: 0 }` duplicate, and its comment no longer claims a specificity/order win', async () => {
	const css = await readFile(
		new URL('../src/styles/app.css', import.meta.url),
		'utf8',
	);

	assert.doesNotMatch(
		css,
		/tr:last-child \[data-slot='table-cell'\] \{\s*border-bottom: 0;/,
	);
	assert.doesNotMatch(
		css,
		/tr:last-child \[data-slot='table-selection-cell'\] \{\s*border-bottom: 0;/,
	);
	assert.doesNotMatch(css, /same specificity, declared later wins/);
});

test('F6: the auth panel, T6B, TEN-2 and P3 component rules moved into @layer components', async () => {
	const css = await readFile(
		new URL('../src/styles/app.css', import.meta.url),
		'utf8',
	);
	const lines = css.split('\n');

	// Tracks brace depth and, separately, the depth at which the innermost
	// still-open `@layer components {` was opened — a selector is "layered"
	// only if that innermost open layer's depth is still on the stack when
	// the selector's line is reached (naive substring/regex counting can't
	// tell a selector's own `{` from an unrelated one earlier in the file).
	const layerOpenDepths = [];
	let depth = 0;
	const layeredAtLine = [];
	for (const line of lines) {
		layeredAtLine.push(layerOpenDepths.length > 0);
		if (/@layer components\s*\{/.test(line)) {
			layerOpenDepths.push(depth);
		}
		for (const char of line) {
			if (char === '{') {
				depth += 1;
			} else if (char === '}') {
				depth -= 1;
				if (
					layerOpenDepths.length > 0 &&
					depth === layerOpenDepths[layerOpenDepths.length - 1]
				) {
					layerOpenDepths.pop();
				}
			}
		}
	}

	for (const selector of [
		'.publy-auth-brand-panel',
		'.publy-profile-icon-tile {',
		'.publy-profile-card-grid {',
		"tr:last-child [data-slot='table-cell']",
	]) {
		const lineIndex = lines.findIndex((line) => line.includes(selector));
		assert.ok(lineIndex > -1, `${selector} not found`);
		assert.equal(
			layeredAtLine[lineIndex],
			true,
			`${selector} expected to be inside @layer components`,
		);
	}

	// Contrast case: the table foundation recipe cluster's documented
	// conflict keeps it un-layered.
	const chromeLineIndex = lines.findIndex((line) =>
		line.includes('.btn-primary-chrome {'),
	);
	assert.ok(chromeLineIndex > -1);
	assert.equal(layeredAtLine[chromeLineIndex], false);
});

test('F1: the --publy-z-* popup stacking scale keeps popups above the drawer/dialog surface, which is above the overlay backdrop', async () => {
	const css = await readFile(
		new URL('../src/styles/app.css', import.meta.url),
		'utf8',
	);

	const valueOf = (tokenName) => {
		const match = css.match(new RegExp(`${tokenName}:\\s*([0-9]+)\\s*;`));
		assert.notEqual(match, null, `${tokenName} not declared in app.css`);
		return Number(match[1]);
	};

	const overlay = valueOf('--publy-z-overlay');
	const drawerSurface = valueOf('--publy-z-drawer-surface');
	const menu = valueOf('--publy-z-menu');
	const select = valueOf('--publy-z-select');

	// This is the exact ordering bug r1 F16 shipped on paper: a Select/
	// DropdownMenu opened from inside a Drawer must paint above the drawer's
	// own opaque surface, so `menu`/`select` must outrank `drawer-surface`,
	// which must in turn outrank the dimming `overlay` backdrop underneath it.
	assert.ok(
		overlay < drawerSurface,
		`overlay (${overlay}) must be below drawer-surface (${drawerSurface})`,
	);
	assert.ok(
		drawerSurface < menu,
		`drawer-surface (${drawerSurface}) must be below menu (${menu})`,
	);
	assert.ok(
		menu <= select,
		`menu (${menu}) must not outrank select (${select})`,
	);
});

test('F3: the real app.css token layer passes both guards with zero violations', async () => {
	const violations = await scanFront2DesignSystem({ checkTokenGuards: true });

	assert.deepEqual(
		violations.filter(
			(violation) =>
				violation.ruleId === 'token-theme-parity' ||
				violation.ruleId === 'token-must-be-declared',
		),
		[],
	);
});

// W5-HARDEN: reason-quality alone can't stop `aaa` becoming a "substantive"
// reason wordier than the bar requires — the structural backstop is this
// inventory diff. A design-system-ignore comment that isn't in
// suppression-inventory.json (planted here, never regenerated) must fail.
test('checkSuppressionInventory: an undocumented design-system-ignore suppression fails the guard', async () => {
	const root = await makeFixture({
		'src/components/table/data-table.tsx': [
			'{/* design-system-ignore: no-rounded-full-or-999-radius a brand new undocumented reason */}',
			'<div className="rounded-full" />',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
		checkSuppressionInventory: true,
	});

	assert.ok(
		violations.some(
			(violation) => violation.ruleId === 'suppression-inventory-drift',
		),
	);
});

test('checkSuppressionInventory: is opt-in — off by default so ordinary fixtures are not misjudged against the real inventory', async () => {
	const root = await makeFixture({
		'src/components/table/data-table.tsx': [
			'{/* design-system-ignore: no-rounded-full-or-999-radius a brand new undocumented reason */}',
			'<div className="rounded-full" />',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.deepEqual(
		violations.filter(
			(violation) => violation.ruleId === 'suppression-inventory-drift',
		),
		[],
	);
});

test('checkSuppressionInventory: the real repo has zero drift against the committed inventory', async () => {
	const violations = await scanFront2DesignSystem({
		checkSuppressionInventory: true,
	});

	assert.deepEqual(
		violations.filter(
			(violation) => violation.ruleId === 'suppression-inventory-drift',
		),
		[],
	);
});

// W5-HARDEN2: the actual defect W5-VERIFY3B found — the live guard's
// suppression check and suppression-inventory discovery were two independent
// parsers that could (and did) disagree: a marker embedded on the previous
// line AFTER real code (`const x = true; // design-system-ignore: rule — reason`)
// was honoured by the live guard (`previous.indexOf(marker)`, unanchored) but
// invisible to `findSuppressionSitesInSource` (requires the marker be the
// first thing after a real comment opener on the trimmed line) — the CLI
// reported "0 violations" for a raw-hex literal that was, in fact, silenced.
// Both now call the SAME parser (`isPreviousLineSuppressed` /
// `findSuppressionSitesInSource`), so this drives both code paths — the real
// no-raw-visual-color violation outcome, and raw site discovery — over an
// identical fixture corpus and asserts they can never again disagree. The
// second corpus entry is a differently-shaped evasion of my own invention
// (embedded marker inside a `/* */` line that doesn't open the line, rather
// than a `//` line comment) — different comment syntax, same underlying bug
// class — proving this isn't just a literal replay of the cited example.
const DIVERGENCE_CORPUS = [
	{
		name: 'embedded trailing marker after real code (W5-VERIFY3B report shape)',
		previousLine:
			'const suppressionAnchor = true; // design-system-ignore: no-raw-visual-color — intentionally raw interoperability fixture',
	},
	{
		name: 'marker embedded in a block comment that does not open the line (second, differently-shaped evasion)',
		previousLine:
			'x; /* design-system-ignore: no-raw-visual-color — a second embedded shape, different comment syntax */',
	},
	{
		name: 'a genuine, comment-opener-first marker (must agree as SUPPRESSED, not just as rejected)',
		previousLine:
			'// design-system-ignore: no-raw-visual-color — intentionally raw interoperability fixture',
	},
];

test('the live guard and suppression-inventory discovery never disagree on whether a line is a suppression site', async () => {
	for (const { name, previousLine } of DIVERGENCE_CORPUS) {
		const relativePath = 'src/components/w5-harden2-divergence.tsx';
		const root = await makeFixture({
			[relativePath]: [
				previousLine,
				"export const w5Harden2DivergenceColor = '#abcdef';",
			].join('\n'),
		});

		const violations = await scanFront2DesignSystem({
			baseDir: root,
			sourceDir: path.join(root, 'src'),
		});
		const liveSuppressed = !violations.some(
			(violation) => violation.ruleId === 'no-raw-visual-color',
		);

		const inventoryFound = findSuppressionSitesInSource(
			previousLine,
			relativePath,
		).some((site) => site.convention === 'design-system-ignore');

		assert.equal(
			liveSuppressed,
			inventoryFound,
			`${name}: live guard suppressed=${liveSuppressed} but inventory discovery found=${inventoryFound}`,
		);
	}
});
