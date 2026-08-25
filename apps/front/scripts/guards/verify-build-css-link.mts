/**
 * Build-time guard: asserts the production build emitted at least one CSS asset under
 * dist/client. The runtime check that the served SSR document actually links that CSS is
 * done by the e2e/CI smoke step (curl + stylesheet grep), since the document is rendered at
 * request time, not emitted as a static file.
 *
 * It also runs both search-cancel emitted-artifact authorities over the real build output —
 * the canonical-CSS assertion over every emitted `.css`, and the zero-tolerance assertion
 * over every emitted `.js`/`.mjs`/`.cjs`/`.html` in dist/client AND dist/server — plus the
 * secondary source scan, which names a file and a line the bundle scan cannot.
 */
import {
	readFileSync,
	readdirSync,
	type Dirent,
} from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
	ARTIFACT_SEARCH_CANCEL_CANONICAL,
	EMITTED_BUNDLE_FILE_EXTENSIONS,
	SHIPPED_SOURCE_ROOTS,
	assertCanonicalSearchCancelCss,
	assertEmittedBundlesFreeOfSearchCancel,
	assertShippedSourceSearchCancelCss,
} from './search-cancel-css-policy.mts';

const distDir = new URL('../../dist/', import.meta.url);
const clientDir = new URL('client/', distDir);
const serverDir = new URL('server/', distDir);
const workspaceRoot = new URL('../../../..', import.meta.url);

const collectPaths = (
	rootDir: URL,
	isMatch: (entry: Dirent, fullPath: URL) => boolean,
): URL[] => {
	const stack: URL[] = [rootDir];
	const found: URL[] = [];

	while (stack.length) {
		const currentDir = stack.pop();
		if (currentDir === undefined) {
			break;
		}
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

// AUTHORITY 1 — the emitted CSS bundle carries exactly the canonical rule.
assertCanonicalSearchCancelCss(
	clientCssPaths.map((cssPath) => ({
		source: readFileSync(cssPath, 'utf8'),
		sourceName: `dist/client/${cssPath.pathname.replace(clientDir.pathname, '')}`,
	})),
	ARTIFACT_SEARCH_CANCEL_CANONICAL,
);

// AUTHORITY 2 — the token appears nowhere in emitted JavaScript or HTML.
//
// dist/server is included deliberately: it is the SSR bundle the production
// `node server.mjs` process executes, so a runtime `<style>` injection compiled
// into it ships to every visitor exactly like the client bundle does.
const isEmittedBundle = (entry: Dirent) =>
	EMITTED_BUNDLE_FILE_EXTENSIONS.some((extension) =>
		entry.name.endsWith(extension),
	);
const emittedBundleRoots: [label: string, directory: URL][] = [
	['dist/client', clientDir],
	['dist/server', serverDir],
];
const emittedBundles = emittedBundleRoots.flatMap(([label, directory]) =>
	collectPaths(directory, isEmittedBundle).map((bundlePath) => ({
		source: readFileSync(bundlePath, 'utf8'),
		sourceName: `${label}/${bundlePath.pathname.replace(directory.pathname, '')}`,
	})),
);
const { scannedFileCount } =
	assertEmittedBundlesFreeOfSearchCancel(emittedBundles);

// SECONDARY NET — the source scan, which reports a file and a line.
const { inventoriedMentionCount, inventorySize, sourceFileCount } =
	assertShippedSourceSearchCancelCss(fileURLToPath(workspaceRoot));

console.log(`front production CSS assets: ${clientCssFiles.join(', ')}`);
console.log('front production build contains emitted CSS assets.');
console.log(
	`front search-cancel CSS policy: 1 canonical emitted rule across ` +
		`${clientCssFiles.length} CSS asset(s) (authority 1); ` +
		`0 occurrences across ${scannedFileCount} emitted JS/HTML file(s) in ` +
		`dist/client and dist/server (authority 2); ` +
		`1 canonical source rule across ${sourceFileCount} scanned source file(s) ` +
		`in ${SHIPPED_SOURCE_ROOTS.length} root(s) ` +
		`(${SHIPPED_SOURCE_ROOTS.join(', ')}); ` +
		`${inventoriedMentionCount} inventoried mention(s) across ` +
		`${inventorySize} inventoried file(s).`,
);
