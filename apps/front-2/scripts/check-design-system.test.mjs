import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

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

	assert.match(
		chromeRuleBody,
		/border:\s*1\.33px\s+solid\s+rgba\(255,\s*255,\s*255,\s*0\.12\)/,
	);
	assert.match(chromeRuleBody, /box-shadow:\s*var\(--publy-shadow-chrome\)/);

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
