#!/usr/bin/env node
/**
 * Tag all e2e spec files with @domain and @ticket tags.
 *
 * For files WITH a top-level test.describe: adds { tag: [...] } option.
 * For files WITHOUT a top-level test.describe: adds a top-level describe wrapper.
 *
 * Run from repo root:
 *   node apps/front/e2e/__tests__/tag-specs.mjs
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const E2E_DIR = path.resolve(import.meta.dirname, '..');

// spec → { domain: string[], ticket: string[], title: string }
const TAG_MAP = {
	'auth-error.spec.ts': {
		domain: ['@auth', '@security'],
		ticket: ['@713'],
		title: 'auth error handling',
	},
	'auth-redirect-guard.spec.ts': {
		domain: ['@auth'],
		ticket: ['@untracked'],
		title: 'auth redirect guard',
	},
	'auth-screens.spec.ts': {
		domain: ['@auth'],
		ticket: ['@806'],
		title: 'auth screens',
	},
	'breadcrumb-entity-name-truncation.spec.ts': {
		domain: ['@shell'],
		ticket: ['@973'],
		title: 'breadcrumb entity-name truncation geometry',
	},
	'cold-boot-stability.spec.ts': {
		domain: ['@auth'],
		ticket: ['@untracked'],
		title: 'cold-boot stability',
	},
	'csp.spec.ts': {
		domain: ['@public'],
		ticket: ['@713'],
		title: 'CSP headers',
	},
	'design-chrome-fixes.spec.ts': {
		domain: ['@design'],
		ticket: ['@806'],
		title: 'design chrome fixes',
	},
	'design-handoff-foundation.spec.ts': {
		domain: ['@design'],
		ticket: ['@806'],
		title: 'design handoff foundation',
	},
	'design-handoff-staff-profiles.spec.ts': {
		domain: ['@design', '@staff-profiles'],
		ticket: ['@806'],
		title: 'design handoff staff profiles',
	},
	'drawer-description-contrast.spec.ts': {
		domain: ['@design'],
		ticket: ['@1043'],
		title: 'drawer description contrast',
	},
	'drawer-form-scroll-geometry.spec.ts': {
		domain: ['@design'],
		ticket: ['@990'],
		title: 'drawer form scroll geometry',
	},
	'field-validation.spec.ts': {
		domain: ['@design'],
		ticket: ['@721'],
		title: 'field validation',
	},
	'form-action-bar-clearance.spec.ts': {
		domain: ['@design'],
		ticket: ['@806'],
		title: 'form action bar clearance',
	},
	'gray-ui-screenshot-capture.spec.ts': {
		domain: ['@design', '@shell'],
		ticket: ['@untracked'],
		title: 'gray UI screenshot capture',
	},
	'i18n-namespaces.spec.ts': {
		domain: ['@i18n'],
		ticket: ['@909'],
		title: 'i18n namespaces',
	},
	'i18n.spec.ts': {
		domain: ['@i18n'],
		ticket: ['@713'],
		title: 'i18n',
	},
	'locale-switch.spec.ts': {
		domain: ['@i18n'],
		ticket: ['@806'],
		title: 'locale switch',
	},
	'log-leak.spec.ts': {
		domain: ['@security'],
		ticket: ['@733'],
		title: 'log leak prevention',
	},
	'logout.spec.ts': {
		domain: ['@auth'],
		ticket: ['@806'],
		title: 'logout',
	},
	'parity-happy-path.spec.ts': {
		domain: ['@staff-dashboard'],
		ticket: ['@723'],
		title: 'staff-users parity happy path',
	},
	'profile-icon-picker-pin-contrast.spec.ts': {
		domain: ['@design', '@staff-profiles'],
		ticket: ['@992'],
		title: 'profile icon-picker pencil-pin contrast',
	},
	'profile-icon-picker-pin-geometry.spec.ts': {
		domain: ['@design', '@staff-profiles'],
		ticket: ['@992'],
		title: 'profile icon-picker pencil-pin geometry',
	},
	'request-counter.spec.ts': {
		domain: ['@security'],
		ticket: ['@806'],
		title: 'request counter',
	},
	'row-actions-centering.spec.ts': {
		domain: ['@shell'],
		ticket: ['@806'],
		title: 'row action centering',
	},
	'search-input-native-cancel-suppression.spec.ts': {
		domain: ['@shell'],
		ticket: ['@975'],
		title: 'SearchInput clear control',
	},
	'seo.spec.ts': {
		domain: ['@public'],
		ticket: ['@713'],
		title: 'SEO metadata',
	},
	'shell.spec.ts': {
		domain: ['@shell'],
		ticket: ['@713'],
		title: 'shell',
	},
	'smoke.spec.ts': {
		domain: ['@public'],
		ticket: ['@733'],
		title: 'smoke',
	},
	'ssr-auth-shell.spec.ts': {
		domain: ['@security'],
		ticket: ['@997'],
		title: 'SSR auth shell',
	},
	'staff-invitations.spec.ts': {
		domain: ['@staff-invitations'],
		ticket: ['@742'],
		title: 'staff invitations',
	},
	'staff-profiles.spec.ts': {
		domain: ['@staff-profiles'],
		ticket: ['@744'],
		title: 'staff profiles',
	},
	'staff-tenant-create.spec.ts': {
		domain: ['@staff-tenants'],
		ticket: ['@806'],
		title: 'staff create-tenant',
	},
	'staff-tenant-details.spec.ts': {
		domain: ['@staff-tenants'],
		ticket: ['@806'],
		title: 'staff tenant details',
	},
	'staff-tenant-edit.spec.ts': {
		domain: ['@staff-tenants'],
		ticket: ['@806'],
		title: 'staff tenant edit',
	},
	'staff-tenants.spec.ts': {
		domain: ['@staff-tenants'],
		ticket: ['@806'],
		title: 'staff tenants',
	},
	'staff-user-details.spec.ts': {
		domain: ['@staff-users'],
		ticket: ['@806'],
		title: 'staff user details',
	},
	'table-scroll-ownership.spec.ts': {
		domain: ['@shell'],
		ticket: ['@806'],
		title: 'table scroll ownership',
	},
	'table.spec.ts': {
		domain: ['@shell', '@staff-users'],
		ticket: ['@720'],
		title: 'table',
	},
	'tab-refocus-stability.spec.ts': {
		domain: ['@auth'],
		ticket: ['@806'],
		title: 'tab-refocus stability',
	},
	'tab-sync.spec.ts': {
		domain: ['@auth'],
		ticket: ['@806'],
		title: 'tab sync',
	},
	'tenant-portal-picker.spec.ts': {
		domain: ['@staff-tenants'],
		ticket: ['@806'],
		title: 'tenant portal picker',
	},
	'toast-contrast.spec.ts': {
		domain: ['@design'],
		ticket: ['@1078'],
		title: 'toast contrast',
	},
};

function buildTagArray(info) {
	const tags = [...info.domain, ...info.ticket];
	return `{ tag: [${tags.map((t) => `'${t}'`).join(', ')}] }`;
}

/**
 * Check if a line at a given brace depth is a top-level test.describe call.
 */
function isTopLevelDescribeLine(line, depth) {
	if (depth > 0) return false;
	return /^\s*test\.describe(?:\.serial)?\s*\(/.test(line);
}

/**
 * For files WITH test.describe: add { tag: [...] } to every top-level describe.
 */
function tagExistingDescribes(content, info) {
	const tagArray = buildTagArray(info);
	const lines = content.split('\n');
	let depth = 0;
	const result = [];

	for (const line of lines) {
		// Count braces in this line to track depth
		let lineDepth = depth;
		for (const ch of line) {
			if (ch === '{') lineDepth++;
			else if (ch === '}') lineDepth--;
		}

		if (isTopLevelDescribeLine(line, depth)) {
			// Replace: test.describe('title',  → test.describe('title', ['@x', '@y'],
			const m = line.match(
				/^(\s*)(test\.describe(?:\.serial)?)\s*\(\s*(["'`])(.+?)\3\s*,/,
			);
			if (m) {
				// Preserve everything after the matched portion (e.g. () => {)
				const rest = line.slice(m[0].length);
				result.push(`${m[1]}${m[2]}('${m[4]}', ${tagArray},${rest}`);
			} else {
				result.push(line);
			}
		} else {
			result.push(line);
		}

		depth = lineDepth;
	}

	return result.join('\n');
}

/**
 * For files WITHOUT test.describe: find the first test() or test.describe() call
 * and wrap all tests in a test.describe with tags.
 *
 * Strategy: keep everything up to (but not including) the first test() call as-is,
 * then wrap the rest in test.describe('title', tags, () => { ... });
 */
function wrapInDescribe(content, info) {
	const tagArray = buildTagArray(info);
	const lines = content.split('\n');

	// Find the first line that starts a test() or test.describe() call
	let firstTestIdx = -1;
	for (let i = 0; i < lines.length; i++) {
		if (/^\s*test\(/.test(lines[i]) || /^\s*test\.describe/.test(lines[i])) {
			firstTestIdx = i;
			break;
		}
	}

	if (firstTestIdx === -1) {
		return content; // no tests found, don't modify
	}

	// Everything before the first test is the preamble (imports, consts, test.use, etc.)
	const preamble = lines.slice(0, firstTestIdx).join('\n');
	const tests = lines.slice(firstTestIdx).join('\n');

	return `${preamble}\ntest.describe('${info.title}', ${tagArray}, () => {\n${tests}\n});\n`;
}

// Main
const specFiles = fs
	.readdirSync(E2E_DIR)
	.filter((f) => f.endsWith('.spec.ts'))
	.sort();

let tagged = 0;
let skipped = 0;

for (const file of specFiles) {
	const info = TAG_MAP[file];
	if (!info) {
		console.log(`SKIP ${file}: not in TAG_MAP`);
		skipped++;
		continue;
	}

	const filePath = path.join(E2E_DIR, file);
	const content = fs.readFileSync(filePath, 'utf8');

	// Check if file has any test.describe( call (not test.describe.configure)
	const hasDescribe = /^\s*test\.describe(?:\.serial)?\s*\(/m.test(content);

	let updated;
	if (hasDescribe) {
		updated = tagExistingDescribes(content, info);
	} else {
		// Skip wrapping — handled manually
		console.log(`SKIP ${file}: needs manual wrapping`);
		skipped++;
		continue;
	}

	if (updated !== content) {
		fs.writeFileSync(filePath, updated, 'utf8');
		console.log(
			`${hasDescribe ? 'TAGGED' : 'WRAPPED'} ${file}: ${info.domain.join(' ')} ${info.ticket.join(' ')}`,
		);
		tagged++;
	} else {
		console.log(`SKIP ${file}: no changes`);
		skipped++;
	}
}

console.log(`\nDone: ${tagged} tagged, ${skipped} skipped`);
