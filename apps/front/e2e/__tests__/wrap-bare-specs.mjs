#!/usr/bin/env node
/**
 * Wrap bare-test e2e spec files in a test.describe with tags.
 * Only processes files that have NO test.describe( call.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const E2E_DIR = path.resolve(import.meta.dirname, '..');

const WRAP_MAP = {
	'auth-error.spec.ts': {
		title: 'auth error handling',
		tags: ['@auth', '@security', '@713'],
	},
	'auth-redirect-guard.spec.ts': {
		title: 'auth redirect guard',
		tags: ['@auth', '@untracked'],
	},
	'auth-screens.spec.ts': { title: 'auth screens', tags: ['@auth', '@806'] },
	'csp.spec.ts': { title: 'CSP headers', tags: ['@public', '@713'] },
	'design-handoff-foundation.spec.ts': {
		title: 'design handoff foundation',
		tags: ['@design', '@806'],
	},
	'design-handoff-staff-profiles.spec.ts': {
		title: 'design handoff staff profiles',
		tags: ['@design', '@staff-profiles', '@806'],
	},
	'field-validation.spec.ts': {
		title: 'field validation',
		tags: ['@design', '@721'],
	},
	'i18n-namespaces.spec.ts': {
		title: 'i18n namespaces',
		tags: ['@i18n', '@909'],
	},
	'i18n.spec.ts': { title: 'i18n', tags: ['@i18n', '@713'] },
	'locale-switch.spec.ts': { title: 'locale switch', tags: ['@i18n', '@806'] },
	'log-leak.spec.ts': {
		title: 'log leak prevention',
		tags: ['@security', '@733'],
	},
	'logout.spec.ts': { title: 'logout', tags: ['@auth', '@806'] },
	'seo.spec.ts': { title: 'SEO metadata', tags: ['@public', '@713'] },
	'shell.spec.ts': { title: 'shell', tags: ['@shell', '@713'] },
	'smoke.spec.ts': { title: 'smoke', tags: ['@public', '@733'] },
	'ssr-auth-shell.spec.ts': {
		title: 'SSR auth shell',
		tags: ['@security', '@997'],
	},
	'tenant-portal-picker.spec.ts': {
		title: 'tenant portal picker',
		tags: ['@staff-tenants', '@806'],
	},
};

function buildTagObj(tags) {
	return `{ tag: [${tags.map((t) => `'${t}'`).join(', ')}] }`;
}

let count = 0;
for (const [file, info] of Object.entries(WRAP_MAP)) {
	const fp = path.join(E2E_DIR, file);
	const src = fs.readFileSync(fp, 'utf8');

	// Skip if already has test.describe(
	if (/^\s*test\.describe(?:\.serial)?\s*\(/m.test(src)) {
		console.log(`SKIP ${file}: already has describe`);
		continue;
	}

	const tagObj = buildTagObj(info.tags);
	const describeLine = `test.describe('${info.title}', ${tagObj}, () => {`;
	const closeLine = '});';

	// Find the first top-level test() line (not inside a for-loop or function)
	const lines = src.split('\n');
	let firstTestIdx = -1;
	let depth = 0;
	for (let i = 0; i < lines.length; i++) {
		for (const ch of lines[i]) {
			if (ch === '{') depth++;
			else if (ch === '}') depth--;
		}
		if (depth <= 1 && /^\s*test\(/.test(lines[i])) {
			firstTestIdx = i;
			break;
		}
	}

	if (firstTestIdx === -1) {
		console.log(`SKIP ${file}: no test() found`);
		continue;
	}

	// Build output: preamble (imports, consts, test.use, etc.) + describe wrapper + tests + close
	const preamble = lines.slice(0, firstTestIdx).join('\n');
	const tests = lines.slice(firstTestIdx).join('\n');

	const out =
		preamble + '\n' + describeLine + '\n' + tests + '\n' + closeLine + '\n';
	fs.writeFileSync(fp, out, 'utf8');
	console.log(`WRAPPED ${file}: ${info.tags.join(' ')}`);
	count++;
}

console.log(`\nWrapped ${count} files`);
