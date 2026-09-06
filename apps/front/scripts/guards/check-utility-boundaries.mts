import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { ts } from 'ts-morph';

export type UtilityBoundaryFinding = {
	file: string;
	line: number;
	kind: 'date-time' | 'clipboard';
	message: string;
};

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultSourceDir = path.resolve(scriptDir, '../../src');
const canonicalFiles = new Set(['utils/format-time.ts', 'utils/clipboard.ts']);

const isTestFile = (file: string): boolean =>
	/\.(?:test|spec|test-helper)\.[cm]?[jt]sx?$/.test(file);

const walk = (directory: string): string[] => {
	const files: string[] = [];
	for (const entry of readdirSync(directory)) {
		const fullPath = path.join(directory, entry);
		if (statSync(fullPath).isDirectory()) {
			files.push(...walk(fullPath));
		} else if (/\.[cm]?[jt]sx?$/.test(entry)) {
			files.push(fullPath);
		}
	}
	return files;
};

const findingFor = (
	file: string,
	sourceDir: string,
	sourceFile: ts.SourceFile,
	node: ts.Node,
	kind: UtilityBoundaryFinding['kind'],
): UtilityBoundaryFinding => ({
	file: path.relative(sourceDir, file),
	line:
		sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line +
		1,
	kind,
	message:
		kind === 'date-time'
			? 'Use apps/front/src/utils/format-time.ts for date/time formatting.'
			: 'Use apps/front/src/utils/clipboard.ts for clipboard writes.',
});

export const scanUtilityBoundaries = (
	sourceDir: string = defaultSourceDir,
): UtilityBoundaryFinding[] => {
	const findings: UtilityBoundaryFinding[] = [];

	for (const file of walk(sourceDir)) {
		const relativePath = path
			.relative(sourceDir, file)
			.split(path.sep)
			.join('/');
		if (isTestFile(file) || canonicalFiles.has(relativePath)) {
			continue;
		}

		const sourceFile = ts.createSourceFile(
			file,
			readFileSync(file, 'utf8'),
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TSX,
		);

		const visit = (node: ts.Node): void => {
			if (
				ts.isNewExpression(node) &&
				node.expression?.getText() === 'Intl.DateTimeFormat'
			) {
				findings.push(
					findingFor(file, sourceDir, sourceFile, node, 'date-time'),
				);
			}
			if (
				ts.isCallExpression(node) &&
				node.expression.getText() === 'navigator.clipboard.writeText'
			) {
				findings.push(
					findingFor(file, sourceDir, sourceFile, node, 'clipboard'),
				);
			}
			node.forEachChild(visit);
		};

		sourceFile.forEachChild(visit);
	}

	return findings.sort(
		(left, right) =>
			left.file.localeCompare(right.file) || left.line - right.line,
	);
};

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	const findings = scanUtilityBoundaries();
	if (findings.length > 0) {
		for (const finding of findings) {
			console.error(
				`${finding.file}:${finding.line}: ${finding.kind}: ${finding.message}`,
			);
		}
		process.exitCode = 1;
	} else {
		console.log('Utility boundary check passed.');
	}
}
