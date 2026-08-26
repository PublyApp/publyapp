/**
 * Dual-path guard (#1533, R2): a `packages/shared-ts` module must be
 * reachable from `apps/front` through exactly ONE import specifier.
 *
 * Background. PR #1587 moved several `apps/front/src/lib/*` modules into
 * `packages/shared-ts/src/lib/*`. The correct move is a pure rename: every
 * front producer and test points at `@org/shared-ts/lib/<module>` and the old
 * `~/lib/<module>` file is deleted. The original R1 fix instead LEFT a
 * re-export shim at `apps/front/src/lib/should-logout-for-failure.ts`
 * (`export * from '@org/shared-ts/lib/should-logout-for-failure'`) and
 * REROUTED ALL 60 production imports to go through the shim. That produced the
 * exact kind of bug the issue set out to remove: one module reachable by two
 * import paths (`~/lib/...` and `@org/shared-ts/lib/...`). Tests mocked the
 * `~/lib/...` path while other code imported the shared-ts path, so a change
 * behind one path went unseen behind the other — ten test files went blind.
 *
 * This guard fails closed: if ANY `apps/front/src/**` file re-exports (or
 * otherwise re-exposes) a `@org/shared-ts/lib/**` module under a second,
 * front-local specifier, the guard exits non-zero naming the offender. The
 * contract it enforces is mechanical and path-only: a front-side file must not
 * re-export a shared-ts module, because that is the single construct that
 * creates a *second* resolvable path to the same module within front.
 *
 * What is deliberately NOT flagged (legitimate):
 *  - front code IMPORTING `@org/shared-ts/lib/...` directly (the wanted path);
 *  - front re-exporting from a front-local module (`export * from './x'`);
 *  - shared-ts re-exporting shared-ts (`packages/shared-ts/**` is out of scope;
 *    only `apps/front/src` is scanned).
 *
 * Run: `node scripts/guards/check-shared-ts-import-paths.mts`
 * Paired proof lives in `check-shared-ts-import-paths.test.mts`: it asserts the
 * guard is RED when a shim re-export is present and GREEN once it is removed.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontSrc = path.resolve(scriptDir, '../../src');

export const REEXPORT_SHARED_TS =
	/export\s+(?:\*|[\w{},\s]+)\s+from\s+['"]@org\/shared-ts\/(?:lib|utils|validations|types)(?:\/[\w-]+)*['"]/;

interface Finding {
	file: string;
	line: number;
	text: string;
}

const walk = (dir: string): string[] => {
	const out: string[] = [];
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return out;
	}
	for (const entry of entries) {
		if (entry === 'node_modules' || entry === '.cache') {
			continue;
		}
		const full = path.join(dir, entry);
		const st = statSync(full);
		if (st.isDirectory()) {
			out.push(...walk(full));
		} else if (/\.(ts|tsx|mts)$/.test(entry)) {
			out.push(full);
		}
	}
	return out;
};

export const scanFrontSrcForSharedTsReExports = (root = frontSrc): Finding[] => {
	const base = path.resolve(root);
	const findings: Finding[] = [];
	for (const file of walk(base)) {
		const lines = readFileSync(file, 'utf8').split('\n');
		lines.forEach((text, idx) => {
			if (REEXPORT_SHARED_TS.test(text)) {
				findings.push({
					file: path.relative(base, file),
					line: idx + 1,
					text: text.trim(),
				});
			}
		});
	}
	return findings;
};

const main = (): void => {
	const findings = scanFrontSrcForSharedTsReExports();
	if (findings.length) {
		console.error(
			'Dual-path violation: a shared-ts module is re-exported from apps/front/src, ' +
				'creating a second import path (#1533).',
		);
		for (const f of findings) {
			console.error(`  ${f.file}:${f.line}  ${f.text}`);
		}
		process.exit(1);
	}
	console.log('No shared-ts module is re-exported from apps/front/src [OK]');
};

// Only run when invoked directly (node scripts/guards/x.mts), not when imported
// by the test file.
const invokedDirectly =
	process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
	main();
}
