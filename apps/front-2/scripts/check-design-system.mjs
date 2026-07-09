import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const rootDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const srcDir = path.join(rootDir, 'src');

const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.css']);
const TOKEN_LAYER_FILES = new Set(['src/styles/app.css']);
const ROUNDED_RULE_ID = 'no-rounded-full-or-999-radius';
const KNOWN_HANDOFF_GUARD_DEBT = [
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/components/app-shell/app-shell.tsx',
		sourceIncludes: 'rounded-full px-4 py-2',
		reason: 'Legacy mobile shell trigger; Task 3 shell pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/components/error-views/AppErrorView.tsx',
		sourceIncludes: 'h-16 w-16 items-center justify-center rounded-full',
		reason: 'Legacy error icon tile; Task 4 state-surface pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/components/error-views/LogoutRedirect.tsx',
		sourceIncludes: 'size-8 animate-spin rounded-full',
		reason: 'Legacy loading spinner; spinner cleanup is outside Task 1.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/components/query-display.tsx',
		sourceIncludes: 'animate-spin rounded-full border-2',
		reason: 'Legacy loading spinner; spinner cleanup is outside Task 1.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/components/table/data-table.tsx',
		sourceIncludes:
			'<Skeleton className="size-[26px] shrink-0 rounded-full" />',
		reason: 'Legacy table skeleton; Task 4 table pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/components/table/data-table.tsx',
		sourceIncludes: '<Skeleton className="h-3 w-40 rounded-full" />',
		reason: 'Legacy table skeleton; Task 4 table pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/components/table/data-table.tsx',
		sourceIncludes: '<Skeleton className="h-3 w-56 rounded-full" />',
		reason: 'Legacy table skeleton; Task 4 table pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/components/table/data-table.tsx',
		sourceIncludes: '<Skeleton className="ml-auto h-5 w-16 rounded-full" />',
		reason: 'Legacy table skeleton; Task 4 table pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/components/table/data-table.tsx',
		sourceIncludes: '<Skeleton className="h-5 w-16 rounded-full" />',
		reason: 'Legacy table skeleton; Task 4 table pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/components/table/data-table.tsx',
		sourceIncludes: 'size-3.5 animate-spin rounded-full',
		reason: 'Legacy pagination spinner; Task 4 table pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/routes/authed/staff/invitations/$invitationId.tsx',
		sourceIncludes: 'h-auto rounded-full border-none',
		reason: 'Legacy staff invitation chip; module pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/routes/authed/staff/invitations/new.tsx',
		sourceIncludes: 'size-4 animate-spin rounded-full',
		reason: 'Legacy route spinner; module pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/routes/authed/staff/profiles/$profileId/users.tsx',
		sourceIncludes: 'size-4 animate-spin rounded-full',
		reason: 'Legacy route spinner; module pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/routes/authed/staff/profiles/$profileId/users.tsx',
		sourceIncludes: 'rounded-full border border-divider px-4 py-2',
		reason: 'Legacy profile chip; Staff module pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/routes/authed/staff/profiles/$profileId/users.tsx',
		sourceIncludes: 'rounded-full bg-primary px-4 py-2',
		reason: 'Legacy profile chip; Staff module pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/routes/authed/staff/profiles/$profileId.tsx',
		sourceIncludes: 'size-4 animate-spin rounded-full',
		reason: 'Legacy route spinner; module pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/routes/authed/staff/profiles/$profileId.tsx',
		sourceIncludes: 'rounded-full bg-primary px-4 py-2',
		reason: 'Legacy profile chip; Staff module pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/routes/authed/staff/profiles/$profileId.tsx',
		sourceIncludes: 'rounded-full border border-divider px-4 py-2',
		reason: 'Legacy profile chip; Staff module pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/routes/authed/staff/profiles/$profileId.tsx',
		sourceIncludes: 'rounded-full bg-muted px-2.5 py-1',
		reason: 'Legacy status chip; Staff module pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/routes/authed/staff/profiles-new.tsx',
		sourceIncludes: 'size-4 animate-spin rounded-full',
		reason: 'Legacy route spinner; module pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/routes/authed/staff/staff-users/$userId.tsx',
		sourceIncludes: 'size-4 animate-spin rounded-full',
		reason: 'Legacy route spinner; module pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/routes/authed/staff/staff-users/$userId.tsx',
		sourceIncludes: 'h-2 w-2 rounded-full bg-primary',
		reason: 'Legacy status dot; Staff module pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/routes/authed/staff/tenants/$tenantId/_tenant-details-shell.tsx',
		sourceIncludes: 'size-4 animate-spin rounded-full',
		reason: 'Legacy route spinner; module pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/routes/authed/staff/tenants/$tenantId/invitations.tsx',
		sourceIncludes: 'inline-flex rounded-full bg-muted',
		reason: 'Legacy invitation chip; Tenants module pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/routes/authed/staff/tenants/$tenantId/profiles/$profileId-edit.tsx',
		sourceIncludes: 'size-4 animate-spin rounded-full',
		reason: 'Legacy route spinner; module pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/routes/authed/staff/tenants/$tenantId/profiles/$profileId.tsx',
		sourceIncludes: 'size-4 animate-spin rounded-full',
		reason: 'Legacy route spinner; module pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/routes/authed/staff/tenants/$tenantId/profiles/$profileId.tsx',
		sourceIncludes: 'rounded-full bg-muted px-2 py-1',
		reason: 'Legacy status chip; Tenants module pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/routes/authed/staff/tenants/$tenantId/users/$userId-edit.tsx',
		sourceIncludes: 'size-4 animate-spin rounded-full',
		reason: 'Legacy route spinner; module pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/routes/authed/staff/tenants/$tenantId/users/$userId.tsx',
		sourceIncludes: 'h-2 w-2 rounded-full bg-primary',
		reason: 'Legacy status dot; Tenants module pass owns this.',
	},
	{
		ruleId: ROUNDED_RULE_ID,
		file: 'src/routes/login.tsx',
		sourceIncludes: 'size-4 animate-spin rounded-full',
		reason: 'Legacy login spinner; auth shell pass owns this.',
	},
];

const hasNearbySelector = (lines, lineIndex, selector, lookback = 8) => {
	const start = Math.max(0, lineIndex - lookback);
	for (let index = lineIndex; index >= start; index--) {
		if (lines[index].includes(selector)) {
			return true;
		}
	}

	return false;
};

const isRoundedRadiusAllowed = (relativePath, line, lineIndex, lines) => {
	if (relativePath === 'src/components/ui/avatar.tsx') {
		return true;
	}

	if (relativePath === 'src/components/app-shell/app-shell.tsx') {
		return line.includes('app-shell-topbar-action-btn');
	}

	if (relativePath !== 'src/styles/app.css') {
		return false;
	}

	return (
		line.includes('.app-shell-topbar-action-btn') ||
		hasNearbySelector(lines, lineIndex, '.app-shell-topbar-action-btn') ||
		hasNearbySelector(lines, lineIndex, '.publy-avatar-initials')
	);
};

const isConfirmDialogFile = (relativePath) =>
	relativePath === 'src/components/ui/confirm-dialog.tsx' ||
	relativePath === 'src/components/ui/dialog.tsx' ||
	relativePath === 'src/components/ui/drawer.tsx';

const isKnownHandoffGuardDebt = ({ ruleId, file, source }) => {
	for (const debt of KNOWN_HANDOFF_GUARD_DEBT) {
		if (
			debt.ruleId === ruleId &&
			debt.file === file &&
			source.includes(debt.sourceIncludes)
		) {
			return true;
		}
	}

	return false;
};

const recordViolation = (violations, violation) => {
	if (isKnownHandoffGuardDebt(violation)) {
		return;
	}

	violations.push(violation);
};

const rules = [
	{
		id: 'no-heroui-import',
		message: 'Use local Gray UI primitives instead of HeroUI.',
		appliesTo: (relativePath) => relativePath.startsWith('src/'),
		patterns: [/from ['"]@heroui\//, /import ['"]@heroui\//],
	},
	{
		id: 'no-mui-import',
		message: 'Use local primitives instead of MUI libraries.',
		appliesTo: (relativePath) => relativePath.startsWith('src/'),
		patterns: [/from ['"]@mui\//, /from ['"]@mui/],
	},
	{
		id: 'no-lucide-import',
		message: 'Use Tabler icons from the Gray UI stack instead of Lucide.',
		appliesTo: (relativePath) => relativePath.startsWith('src/'),
		patterns: [/from ['"]lucide-react['"]/, /import ['"]lucide-react['"]/],
	},
	{
		id: 'no-heroui-color-scale',
		message:
			'Use Gray UI semantic tokens instead of legacy HeroUI numbered color scales.',
		appliesTo: (relativePath) => relativePath.startsWith('src/'),
		patterns: [
			/\b(?:bg|text|border|ring|from|to|via)-(?:danger|success|warning|foreground|default|primary|content\d?)-\d{2,3}\b/,
		],
	},
	{
		id: 'no-raw-visual-color',
		message:
			'Use front-2 semantic tokens instead of raw hex/rgb/slate/white-alpha styling.',
		appliesTo: (relativePath) =>
			relativePath.startsWith('src/components/app-shell/') ||
			relativePath.startsWith('src/components/table/') ||
			relativePath.startsWith('src/routes/authed/') ||
			relativePath.startsWith('src/styles/'),
		allow: (relativePath) => TOKEN_LAYER_FILES.has(relativePath),
		patterns: [
			/["'][#][0-9a-fA-F]{3,8}["']/, // quoted raw color tokens
			/\b(?:bg|text|border|ring|from|to|via)-\[#(?:[0-9a-fA-F]{3,8})\]/,
			/\b(?:color|background|background-color|border-color|outline-color)\s*:\s*#[0-9a-fA-F]{3,8}\b/,
			/\b(?:bg|text|border|ring|from|to|via)-slate-\d{2,3}\b/,
			/\b(?:bg|border|text|ring)-white\/\d+\b/,
			/\b(?:bg|border|text|ring)-black\/\d+\b/,
			/["'`]\s*rgba?\(/,
			/\b(?:bg|text|border|ring|from|to|via)-\[(?:rgba?\([^\]]+\))\]/,
			/\b(?:color|background|background-color|border-color|outline-color|box-shadow)\s*:\s*rgba?\(/,
		],
	},
	{
		id: 'no-native-product-select',
		message:
			'Prefer local Select primitives on product surfaces during migration.',
		appliesTo: (relativePath) =>
			relativePath.startsWith('src/components/table/') ||
			relativePath.startsWith('src/routes/authed/'),
		patterns: [/<select\b/],
	},
	{
		id: 'no-prototype-icons',
		message:
			'Use Tabler icon components, not emoji/punctuation/numeric icon strings.',
		appliesTo: (relativePath) => relativePath.startsWith('src/'),
		patterns: [/icon=["'](?:!|\?|401|⛔|🔎)["']/],
	},
	{
		id: 'no-native-confirm',
		message: 'Use local confirm dialog in product surfaces.',
		appliesTo: (relativePath) => relativePath.startsWith('src/routes/authed/'),
		patterns: [/globalThis\.confirm\b/],
	},
	{
		id: 'no-important-foundation',
		message: 'Fix cascade through tokens/theme/wrappers, not !important.',
		appliesTo: (relativePath) =>
			relativePath.startsWith('src/components/app-shell/') ||
			relativePath.startsWith('src/components/table/'),
		patterns: [/!important/, /![a-z0-9]+-[a-z0-9][a-z0-9-]*/],
	},
	{
		id: 'no-rounded-full-or-999-radius',
		message:
			'Only avatar surfaces and 36px topbar icon buttons may remain fully rounded.',
		appliesTo: () => true,
		patterns: [/\brounded-full\b/, /\bborder-radius:\s*999px\b/],
		ignoreMatch: isRoundedRadiusAllowed,
	},
	{
		id: 'no-non-confirmation-centered-overlay',
		message:
			'Use non-centered drawers for non-confirmation overlays; only confirm can stay centered.',
		appliesTo: (relativePath) => relativePath.startsWith('src/routes/'),
		patterns: [
			/(?:top-1\/2.*left-1\/2|left-1\/2.*top-1\/2)/,
			/\b(?:centered|center)\b[^\n]{0,140}\b(?:dialog|modal)\b/i,
			/\btransform\s*:\s*translate\(-50%,\s*-50%\)/,
		],
	},
	{
		id: 'no-dialog-popup-primitives',
		message:
			'Use the local confirm dialog path; keep DialogPopup direct usage for future non-confirmation overlays.',
		appliesTo: (relativePath) => relativePath.startsWith('src/'),
		patterns: [/DialogPopup\b/, /DialogPrimitive\.Popup/],
		source: 'source',
		mode: 'source',
		ignoreFile: isConfirmDialogFile,
	},
	{
		id: 'no-raw-internal-anchor',
		mode: 'source',
		message: 'Use TanStack Link for internal route navigation.',
		appliesTo: (relativePath) => relativePath.startsWith('src/routes/authed/'),
		patterns: [
			/<a\b(?:(?!<a\b)[\s\S])*?href=["']\/(staff|tenant)\b(?:(?!<a\b)[\s\S])*?>/g,
		],
	},
];

const collectFiles = async (dir) => {
	const entries = await readdir(dir, { withFileTypes: true });
	const files = [];

	for (const entry of entries) {
		const absolutePath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectFiles(absolutePath)));
			continue;
		}

		if (TEXT_EXTENSIONS.has(path.extname(entry.name))) {
			files.push(absolutePath);
		}
	}

	return files;
};

export const scanFront2DesignSystem = async ({
	baseDir = rootDir,
	sourceDir = srcDir,
} = {}) => {
	const files = await collectFiles(sourceDir);
	const violations = [];

	for (const absolutePath of files) {
		const relativePath = path
			.relative(baseDir, absolutePath)
			.split(path.sep)
			.join('/');
		const source = await readFile(absolutePath, 'utf8');
		const lines = source.split('\n');

		for (const rule of rules) {
			if (!rule.appliesTo(relativePath) || rule.allow?.(relativePath)) {
				continue;
			}

			if (rule.ignoreFile?.(relativePath)) {
				continue;
			}

			if (rule.mode === 'source') {
				for (const pattern of rule.patterns) {
					const globalPattern = new RegExp(
						pattern.source,
						pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`,
					);
					const matches = source.matchAll(globalPattern);
					for (const match of matches) {
						const line = source.slice(0, match.index).split('\n').length;
						recordViolation(violations, {
							ruleId: rule.id,
							message: rule.message,
							file: relativePath,
							line,
							source: match[0].trim(),
						});
					}
				}
			} else {
				for (let index = 0; index < lines.length; index += 1) {
					const line = lines[index];
					for (const pattern of rule.patterns) {
						if (!pattern.test(line)) {
							continue;
						}

						if (rule.ignoreMatch?.(relativePath, line, index, lines)) {
							continue;
						}

						recordViolation(violations, {
							ruleId: rule.id,
							message: rule.message,
							file: relativePath,
							line: index + 1,
							source: line.trim(),
						});
					}
				}
			}
		}
	}

	return violations;
};

if (
	process.argv[1] &&
	pathToFileURL(process.argv[1]).href === import.meta.url
) {
	const violations = await scanFront2DesignSystem();

	if (violations.length > 0) {
		console.error('front-2 design-system guard failed:');
		for (const violation of violations) {
			console.error(
				`${violation.file}:${violation.line} ${violation.ruleId} - ${violation.message}\n  ${violation.source}`,
			);
		}
		process.exit(1);
	}
}
