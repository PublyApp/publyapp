/**
 * Build-time guard: asserts the production build emitted at least one CSS asset under
 * dist/client. The runtime check that the served SSR document actually links that CSS is
 * done by the e2e/CI smoke step (curl + stylesheet grep), since the document is rendered at
 * request time, not emitted as a static file.
 */
import { readdirSync } from 'node:fs';

const clientDir = new URL('../dist/client/', import.meta.url);

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

const clientCssFiles = collectPaths(clientDir, (entry) =>
	entry.name.endsWith('.css'),
).map((path) => path.pathname.replace(clientDir.pathname, ''));

if (clientCssFiles.length === 0) {
	console.error('Expected at least one CSS asset in dist/client, found none.');
	process.exit(1);
}

console.log(`front production CSS assets: ${clientCssFiles.join(', ')}`);
console.log('front production build contains emitted CSS assets.');
