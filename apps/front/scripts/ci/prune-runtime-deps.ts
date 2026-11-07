/**
 * Shrinks the deployed front `node_modules` to what the server actually loads.
 *
 * `pnpm deploy --prod` installs the production *install* closure, which is not
 * the production *runtime* closure: `@tanstack/react-start` is bundled into
 * `dist/server` but still drags `vite` → `rolldown`/`esbuild`/`lightningcss`
 * into the tree, `typescript` comes in as an optional peer of `i18next`, and
 * `posthog-js` is a browser-only dependency of `@org/shared-ts`. Together that
 * is ~186 MB of a 276 MB tree that no request ever imports.
 *
 * The closure is computed from the real entry points — `server.ts`,
 * `trust-proxy.ts` and every JS chunk under `dist/server` (lazy route chunks
 * included) — so a package is kept only when the bundle imports it, or when a
 * kept package depends on it. Anything unresolvable is kept, never pruned.
 *
 * Also drops `*.map` from `dist`: Vite emits ~3 MB of source maps here, and
 * the runtime never reads them.
 *
 * Usage: `node scripts/ci/prune-runtime-deps.ts [appDir]` (default: cwd).
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const appDir = path.resolve(process.argv[2] ?? process.cwd());
const modulesDir = path.join(appDir, 'node_modules');
const storeDir = path.join(modulesDir, '.pnpm');

/** Bare specifier → package name (`@scope/name`, `name`). */
const packageNameOf = (specifier: string): string | null => {
	const name = specifier.startsWith('@')
		? specifier.split('/').slice(0, 2).join('/')
		: specifier.split('/')[0];
	return /^@?[a-z0-9._-]+(\/[a-z0-9._-]+)?$/i.test(name) ? name : null;
};

const realpath = (target: string): string | null => {
	try {
		return fs.realpathSync(target);
	} catch {
		return null;
	}
};

/** Node-like lookup: `<dir>/node_modules/<dep>`, walking up to the root. */
const resolveFrom = (fromDir: string, dependency: string): string | null => {
	let dir = fromDir;
	for (;;) {
		const candidate = realpath(path.join(dir, 'node_modules', dependency));
		if (candidate) {
			return candidate;
		}
		const parent = path.dirname(dir);
		if (parent === dir) {
			return null;
		}
		dir = parent;
	}
};

const collectFiles = (dir: string, found: string[] = []): string[] => {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			collectFiles(full, found);
		} else if (/\.(js|mjs|cjs|ts)$/.test(entry.name)) {
			found.push(full);
		}
	}
	return found;
};

const entryPoints = [
	path.join(appDir, 'server.ts'),
	path.join(appDir, 'trust-proxy.ts'),
	...collectFiles(path.join(appDir, 'dist', 'server')),
];

const specifierPattern =
	/(?:from\s*|import\s*\(\s*|require\s*\(\s*|^\s*import\s*)["']([^"']+)["']/gm;
const roots = new Set<string>();
for (const file of entryPoints) {
	if (!fs.existsSync(file)) {
		continue;
	}
	for (const match of fs
		.readFileSync(file, 'utf8')
		.matchAll(specifierPattern)) {
		const specifier = match[1];
		if (/^[./#]/.test(specifier) || specifier.startsWith('node:')) {
			continue;
		}
		const name = packageNameOf(specifier);
		if (name) {
			roots.add(name);
		}
	}
}

const storeEntries = fs
	.readdirSync(storeDir)
	.filter((entry) => entry !== 'lock.yaml');

/** `.pnpm/<entry>/node_modules/<pkg>` → `<entry>`. */
const storeEntryOf = (dir: string): string | null => {
	const marker = `${path.sep}.pnpm${path.sep}`;
	const index = dir.indexOf(marker);
	if (index === -1) {
		return null;
	}
	return dir
		.slice(index + marker.length)
		.split(`${path.sep}node_modules${path.sep}`)[0];
};

const kept = new Set<string>();
const visit = (dir: string): void => {
	const entry = storeEntryOf(dir);
	if (!entry || kept.has(entry)) {
		return;
	}
	kept.add(entry);
	let manifest: {
		dependencies?: Record<string, string>;
		optionalDependencies?: Record<string, string>;
		peerDependencies?: Record<string, string>;
		peerDependenciesMeta?: Record<string, { optional?: boolean }>;
	};
	try {
		manifest = JSON.parse(
			fs.readFileSync(path.join(dir, 'package.json'), 'utf8'),
		);
	} catch {
		return;
	}
	const peerMeta = manifest.peerDependenciesMeta ?? {};
	const dependencies = {
		...manifest.dependencies,
		...manifest.optionalDependencies,
		...Object.fromEntries(
			Object.entries(manifest.peerDependencies ?? {}).filter(
				([name]) => !peerMeta[name]?.optional,
			),
		),
	};
	for (const dependency of Object.keys(dependencies)) {
		const resolved = resolveFrom(dir, dependency);
		if (resolved) {
			visit(resolved);
		}
	}
};

const unresolved = new Set<string>();
for (const name of roots) {
	const direct = realpath(path.join(modulesDir, name));
	if (direct) {
		visit(direct);
		continue;
	}
	// A root the top-level resolver cannot see may still be linked inside a
	// workspace package's virtual store (e.g. winston under @org/shared-ts).
	let found = false;
	for (const entry of storeEntries) {
		const linked = realpath(path.join(storeDir, entry, 'node_modules', name));
		if (linked) {
			visit(linked);
			found = true;
		}
	}
	if (!found) {
		unresolved.add(name);
	}
}

const sizeOf = (dir: string): number => {
	let total = 0;
	const stack = [dir];
	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) {
			continue;
		}
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(current, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			const full = path.join(current, entry.name);
			if (entry.isDirectory()) {
				stack.push(full);
			} else if (entry.isFile()) {
				try {
					total += fs.statSync(full).size;
				} catch {
					// A racing unlink is not a reason to abort the prune.
				}
			}
		}
	}
	return total;
};

let keptBytes = 0;
let removedBytes = 0;
let removedCount = 0;
for (const entry of storeEntries) {
	const dir = realpath(path.join(storeDir, entry));
	if (!dir) {
		continue;
	}
	const size = sizeOf(dir);
	if (kept.has(entry)) {
		keptBytes += size;
		continue;
	}
	removedBytes += size;
	removedCount += 1;
	fs.rmSync(path.join(storeDir, entry), { recursive: true, force: true });
}

const dropDanglingLinks = (dir: string): void => {
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isSymbolicLink() && !fs.existsSync(full)) {
			fs.unlinkSync(full);
		}
	}
};

for (const entry of fs.readdirSync(modulesDir)) {
	const full = path.join(modulesDir, entry);
	if (entry.startsWith('@')) {
		dropDanglingLinks(full);
	} else if (entry.startsWith('.')) {
		dropDanglingLinks(full);
	} else if (fs.lstatSync(full).isSymbolicLink() && !fs.existsSync(full)) {
		fs.unlinkSync(full);
	}
}
const hoistedDir = path.join(storeDir, 'node_modules');
if (fs.existsSync(hoistedDir)) {
	dropDanglingLinks(hoistedDir);
	for (const entry of fs.readdirSync(hoistedDir)) {
		if (entry.startsWith('@')) {
			dropDanglingLinks(path.join(hoistedDir, entry));
		}
	}
}

let mapBytes = 0;
const stripSourceMaps = (dir: string): void => {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			stripSourceMaps(full);
		} else if (entry.name.endsWith('.map')) {
			mapBytes += fs.statSync(full).size;
			fs.unlinkSync(full);
		}
	}
};
const distDir = path.join(appDir, 'dist');
if (fs.existsSync(distDir)) {
	stripSourceMaps(distDir);
}

const megabytes = (bytes: number): string => (bytes / 1024 / 1024).toFixed(1);
console.log(
	`[prune] roots=${roots.size} kept=${kept.size} removed=${removedCount} ` +
		`keptSize=${megabytes(keptBytes)}MB removedSize=${megabytes(removedBytes)}MB ` +
		`sourceMaps=${megabytes(mapBytes)}MB`,
);
if (unresolved.size > 0) {
	console.log(
		`[prune] unresolved roots left untouched: ${[...unresolved].join(' ')}`,
	);
}
