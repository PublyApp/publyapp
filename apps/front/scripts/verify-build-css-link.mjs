/**
 * Build-time guard: asserts the production build emitted at least one CSS asset under
 * dist/client. The runtime check that the served SSR document actually links that CSS is
 * done by the e2e/CI smoke step (curl + stylesheet grep), since the document is rendered at
 * request time, not emitted as a static file.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
	ARTIFACT_SEARCH_CANCEL_CANONICAL,
	assertCanonicalSearchCancelCss,
	assertShippedSourceSearchCancelCss,
} from './search-cancel-css-policy.mjs';

const clientDir = new URL('../dist/client/', import.meta.url);
const frontRoot = new URL('../', import.meta.url);

const collectPaths = (rootDir, isMatch) => {
	const stack = [rootDir];
	const found = [];

	while (stack.length) {
		const currentDir = stack.pop();
		for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
			const fullPath = new URL(entry.name, currentDir);

			if (entry.isDirectory()) {
				stack.push(new URL(entry.name + '/', currentDir));
			} else if (entry.isFile() && isMatch(entry, fullPath)) {
				found.push(fullPath);
			}
		}
	}

	return found;
};

const clientCssPaths = collectPaths(clientDir, (entry) =>
	entry.name.endsWith('.css'),
);
const clientCssFiles = clientCssPaths.map((cssPath) =>
	cssPath.pathname.replace(clientDir.pathname, ''),
);

if (clientCssFiles.length === 0) {
	console.error('Expected at least one CSS asset in dist/client, found none.');
	process.exit(1);
}

const sourceStylesheetCount = assertShippedSourceSearchCancelCss(
	fileURLToPath(frontRoot),
);
assertCanonicalSearchCancelCss(
	clientCssPaths.map((cssPath) => ({
		source: readFileSync(cssPath, 'utf8'),
		sourceName: `dist/client/${cssPath.pathname.replace(clientDir.pathname, '')}`,
	})),
	ARTIFACT_SEARCH_CANCEL_CANONICAL,
);

console.log(`front production CSS assets: ${clientCssFiles.join(', ')}`);
console.log('front production build contains emitted CSS assets.');
console.log(
	`front search-cancel CSS policy: 1 canonical source rule across ` +
		`${sourceStylesheetCount} shipped CSS source file(s); ` +
		`1 canonical emitted rule across ${clientCssFiles.length} CSS asset(s).`,
);
