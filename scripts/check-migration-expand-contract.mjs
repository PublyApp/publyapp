import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const execFileAsync = promisify(execFile);

// Explicit escape hatch comment required to downgrade an otherwise blocking
// finding:
//   // expand-contract-ok: <reason>
const escapeHatchRegex = /\/\/\s*expand-contract-ok:\s*(?<reason>.+)$/im;

const migrationGlobs = ['apps/api/Migrations'];

const isMigrationSource = (filePath) =>
	/\.cs$/i.test(filePath) && /\.Designer\.cs$/i.test(filePath) === false;

const normalizeMigrationPath = (rootDir, filePath) =>
	path.resolve(rootDir, filePath.replace(/^\"|\"$/g, ''));

const collectDiffPaths = async ({ rootDir, args, includePathspec = true }) => {
	const command = includePathspec ? [...args, '--', ...migrationGlobs] : args;
	const { stdout } = await execFileAsync('git', command, {
		cwd: rootDir,
		encoding: 'utf8',
	});

	return stdout
		.split('\n')
		.map((value) => value.trim())
		.filter((value) => value.length > 0);
};

const normalizePath = (value) => value.trim().replace(/\\+/g, '/');

const listMigrationFiles = async ({ rootDir }) => {
	const changed = [
		...(await collectDiffPaths({
			rootDir,
			args: ['diff', '--name-only', 'origin/develop'],
		})),
		...(await collectDiffPaths({
			rootDir,
			args: ['ls-files', '--others', '--exclude-standard', '--', ...migrationGlobs],
			includePathspec: false,
		})),
	];

	return [...new Set(changed)]
		.filter((value) => isMigrationSource(value))
		.map((value) => normalizeMigrationPath(rootDir, value))
		.sort();
};

const getUpMethodBody = (source) => {
	const marker = 'protected override void Up(MigrationBuilder migrationBuilder)';
	const start = source.indexOf(marker);
	if (start === -1) {
		return null;
	}

	const open = source.indexOf('{', start);
	if (open === -1) {
		return null;
	}

	let depth = 0;
	for (let i = open; i < source.length; i += 1) {
		if (source[i] === '{') {
			depth += 1;
		} else if (source[i] === '}') {
			depth -= 1;
			if (depth === 0) {
				return {
					body: source.slice(open + 1, i),
					startLine: source.slice(0, open + 1).split('\n').length,
				};
			}
		}
	}

	return null;
};

const findCallEnd = (text, startIndex) => {
	const open = text.indexOf('(', startIndex);
	if (open === -1) {
		return -1;
	}

	let depth = 0;
	for (let i = open; i < text.length; i += 1) {
		const char = text[i];
		if (char === '(') {
			depth += 1;
		} else if (char === ')') {
			depth -= 1;
			if (depth === 0) {
				const after = text.indexOf(';', i);
				return after;
			}
		}
	}

	return -1;
};

const getBooleanArg = (callText, argName) => {
	const match = new RegExp(
		`\\b${argName}\\s*:\\s*(true|false)\\b`,
		'iu',
	).exec(callText);

	return match === null ? null : match[1].toLowerCase() === 'true';
};

const getStringArg = (callText, argName) => {
	const match = new RegExp(`\\b${argName}\\s*:\\s*"([^"]+)"`, 'i').exec(callText);
	return match === null ? null : match[1];
};

const getOldClrType = (callText) => {
	const match = /\boldClrType\s*:\s*typeof\(\s*([^)]+?)\s*\)/i.exec(callText);
	return match === null ? null : match[1].trim();
};

const getGenericType = (callText, operation) => {
	const match = new RegExp(
		`migrationBuilder\\.${operation}<\\s*([^>\\s]+)\\s*>`,
		'i',
	).exec(callText);
	return match === null ? null : match[1];
};

const addFinding = (state, finding) => {
	const detail = state.isMarked
		? { ...finding, level: 'warning', markerReason: state.markerReason }
		: { ...finding, level: 'error' };

	if (state.isMarked) {
		state.warnings.push(detail);
		return;
	}

	state.errors.push(detail);
};

const checkAddColumn = (state, callText, filePath, lineNumber) => {
	const isNullableFalse = getBooleanArg(callText, 'nullable') === false;
	const hasDefaultValue = /\bdefaultValue(?:Sql)?\s*:/.test(callText);

	if (isNullableFalse && !hasDefaultValue) {
		addFinding(state, {
			file: filePath,
			line: lineNumber,
			operation: 'AddColumn',
			explanation:
				'Adding a non-nullable column without a default is a breaking contract for rolling deploys.',
			remedy:
				'Split to an expand/contract phase: add nullable first (with optional backfill), then make it non-nullable once all app versions are writing it.',
		});
	}
};

const checkAlterColumn = (state, callText, filePath, lineNumber) => {
	const newNullable = getBooleanArg(callText, 'nullable');
	const oldNullable = getBooleanArg(callText, 'oldNullable');
	const newType = getStringArg(callText, 'type');
	const oldType = getStringArg(callText, 'oldType');
	const newClrType = getGenericType(callText, 'AlterColumn');
	const oldClrType = getOldClrType(callText);

	const hasTypeChange = newType && oldType && newType.trim() !== oldType.trim();
	const hasClrTypeChange =
		newClrType &&
		oldClrType &&
		newClrType.replace(/\s/g, '') !== oldClrType.replace(/\s/g, '');

	const tightensNullable = newNullable === false && oldNullable === true;

	if (hasTypeChange || hasClrTypeChange) {
		addFinding(state, {
			file: filePath,
			line: lineNumber,
			operation: 'AlterColumn',
			explanation:
				'Altering a column type in place is a schema-contract break during rolling deploys.',
			remedy:
				'Use a dual-write or shadow-column strategy so old app binaries can continue reading/writing during rollout.',
		});
		return;
	}

	if (tightensNullable) {
		addFinding(state, {
			file: filePath,
			line: lineNumber,
			operation: 'AlterColumn',
			explanation:
				'Altering nullability true→false tightens contract and can break old app writes.',
			remedy:
				'Add a new nullable column + backfill + readers/writers migration path before removing/strengthening the old column.',
		});
	}
};

const checkOperationCall = (state, callText, filePath, lineNumber, operationName) => {
	switch (operationName) {
		case 'DropColumn':
		case 'DropTable':
		case 'RenameColumn':
		case 'RenameTable': {
			const action =
				operationName === 'DropColumn' ? 'dropping' : operationName === 'DropTable' ? 'dropping' : 'renaming';
			const remedy =
				operationName === 'RenameColumn' || operationName === 'RenameTable'
					? 'Use add+copy/backfill+drop in separate migrations so old app versions still see existing names.'
					: 'Keep old objects in place while the deployment window absorbs both app versions, then remove in a later migration.';
			addFinding(state, {
				file: filePath,
				line: lineNumber,
				operation: operationName,
				explanation: `This migration is ${action} a database object, which is a breaking contract change for expand/contract rollouts.`,
				remedy,
			});
			return;
		}
		case 'AddColumn':
			checkAddColumn(state, callText, filePath, lineNumber);
			return;
		case 'AlterColumn':
			checkAlterColumn(state, callText, filePath, lineNumber);
			return;
		default:
			return;
	}
};

export const findMigrationExpandContractIssues = async ({
	rootDir = process.cwd(),
	migrationFilePaths,
} = {}) => {
	const filesToCheck = migrationFilePaths ??
		(await listMigrationFiles({ rootDir: rootDir }));

	const issues = [];
	const warnings = [];

	const state = { errors: issues, warnings, isMarked: false };

	for (const file of filesToCheck) {
		const filePath = normalizePath(file);
		const source = await readFile(filePath, 'utf8');
		const marker = escapeHatchRegex.exec(source);
		state.isMarked = marker !== null;
		state.markerReason = marker?.groups?.reason?.trim() ?? '';

		const up = getUpMethodBody(source);
		if (up === null) {
			continue;
		}

		state.isMarked = marker !== null;
		const { body, startLine } = up;
		const operationRegex =
			/migrationBuilder\.(DropColumn|DropTable|RenameColumn|RenameTable|AddColumn|AlterColumn)(?:<[^>]*>)?\s*\(/g;

		for (const match of body.matchAll(operationRegex)) {
			const operationName = match[1];
			const callStart = match.index ?? 0;
			const callEnd = findCallEnd(body, callStart);
			if (callEnd === -1) {
				continue;
			}

			const callText = body.slice(callStart, callEnd + 1);
			const lineNumber = startLine + body.slice(0, callStart).split('\n').length - 1;
			checkOperationCall(state, callText, filePath, lineNumber, operationName);
		}
	}

	return [...issues, ...warnings].map((entry) => ({
		...entry,
	}));
};

export const hasBlockingExpandContractIssues = async (options) =>
	(await findMigrationExpandContractIssues(options)).filter(
		(issue) => issue.level === 'error',
	).length > 0;

if (process.argv[1] && path.basename(process.argv[1]) === 'check-migration-expand-contract.mjs') {
	const findings = await findMigrationExpandContractIssues({
		rootDir: process.cwd(),
	});
	const errors = findings.filter((finding) => finding.level === 'error');
	const warnings = findings.filter((finding) => finding.level === 'warning');

	for (const finding of warnings) {
		console.log(
			`WARN: ${finding.file}:${finding.line} ${finding.operation} ${finding.explanation}\n  Remedy: ${finding.remedy}\n  Marker: ${finding.markerReason || 'expand-contract-ok marker present'}`,
		);
	}

	for (const finding of errors) {
		console.log(
			`FAIL: ${finding.file}:${finding.line} ${finding.operation} ${finding.explanation}\n  Remedy: ${finding.remedy}`,
		);
	}

	if (errors.length > 0) {
		console.error('Migration expand/contract guard failed.');
		process.exit(1);
	}

	console.log('Migration expand/contract guard: no blocking changes in changed migrations.');
}
