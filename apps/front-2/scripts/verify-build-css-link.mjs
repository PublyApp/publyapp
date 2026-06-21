import { readdirSync } from 'node:fs';

const clientDir = new URL('../dist/client/', import.meta.url);
const clientPath = new URL('../dist/client/', import.meta.url).pathname;

const collectCss = (directory) => {
	const stack = [new URL(directory, clientDir)];
	const found = [];

	while (stack.length) {
		const currentDir = stack.pop();
		for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
			const fullPath = new URL(entry.name, currentDir).pathname;
			if (entry.isDirectory()) {
				stack.push(new URL(entry.name + '/', currentDir));
			} else if (entry.isFile() && entry.name.endsWith('.css')) {
				found.push(fullPath.replace(clientPath, ''));
			}
		}
	}
	return found;
};

const cssFiles = collectCss('./');

if (cssFiles.length === 0) {
	console.error('Expected at least one CSS file in dist/client, found none.');
	process.exit(1);
}
console.log(`front-2 production CSS assets: ${cssFiles.join(', ')}`);
console.log(
	'front-2 production build contains at least one emitted CSS asset.',
);
