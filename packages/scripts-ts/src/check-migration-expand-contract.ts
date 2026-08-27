import { execFile } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Explicit escape hatch comment required to downgrade an otherwise blocking
// finding:
//   // expand-contract-ok: <reason>
const escapeHatchRegexLine =
	/^\s*\/\/\s*expand-contract-ok:\s*(?<reason>[^\r\n]*)$/;
const escapeHatchRegexInline =
	/\/\/\s*expand-contract-ok:\s*(?<reason>[^\r\n]*)$/;

const migrationGlobs = ['apps/api/Migrations'];

// @ts-expect-error rung-0: add proper type in later rung
const isMigrationSource = (filePath) =>
	/\.cs$/i.test(filePath) && /\.Designer\.cs$/i.test(filePath) === false;

// @ts-expect-error rung-0: add proper type in later rung
const normalizeMigrationPath = (rootDir, filePath) =>
	path.resolve(rootDir, filePath.replace(/^"|"$/g, ''));

const collectDiffPaths = async ({
	// @ts-expect-error rung-0: add proper type in later rung
	rootDir,
	// @ts-expect-error rung-0: add proper type in later rung
	args,
	includePathspec = true,
	runCommand = execFileAsync,
}) => {
	const command = includePathspec ? [...args, '--', ...migrationGlobs] : args;
	const { stdout } = await runCommand('git', command, {
		cwd: rootDir,
		encoding: 'utf8',
	});

	return stdout
		.split('\n')
		.map((value) => value.trim())
		.filter((value) => value.length > 0);
};

// @ts-expect-error rung-0: add proper type in later rung
const normalizePath = (value) => value.trim().replace(/\\+/g, '/');

// @ts-expect-error rung-0: add proper type in later rung
const listMigrationFiles = async ({ rootDir, runCommand = execFileAsync }) => {
	const changed = [
		...(await collectDiffPaths({
			rootDir,
			args: ['diff', '--name-only', 'origin/develop'],
			runCommand,
		})),
		...(await collectDiffPaths({
			rootDir,
			args: [
				'ls-files',
				'--others',
				'--exclude-standard',
				'--',
				...migrationGlobs,
			],
			includePathspec: false,
			runCommand,
		})),
	];

	const candidatePaths = [...new Set(changed)]
		.filter((value) => isMigrationSource(value))
		.map((value) => normalizeMigrationPath(rootDir, value))
		.sort();

	const existenceChecks = await Promise.all(
		candidatePaths.map(async (value) => {
			try {
				await access(value);
				return true;
			} catch {
				return false;
			}
		}),
	);

	// @ts-expect-error rung-0: TS6133
	return candidatePaths.filter((value, index) => existenceChecks[index]);
};

// @ts-expect-error rung-0: add proper type in later rung
const getUpMethodBody = (source) => {
	const marker =
		'protected override void Up(MigrationBuilder migrationBuilder)';
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

const parseMarkerInfo = (
	// @ts-expect-error rung-0: add proper type in later rung
	lineText,
	// @ts-expect-error rung-0: add proper type in later rung
	markerLineNumber,
	// @ts-expect-error rung-0: add proper type in later rung
	filePath,
	allowInline = false,
) => {
	const trimmedLineText = lineText.trimEnd();
	const lineMatch = (
		allowInline ? escapeHatchRegexInline : escapeHatchRegexLine
	).exec(trimmedLineText);
	if (lineMatch === null) {
		return { isMarked: false };
	}

	const reason = lineMatch.groups?.reason?.trim() ?? '';
	if (reason.length === 0) {
		return {
			isMarked: false,
			missingReasonLine: markerLineNumber,
			missingReasonMessage: `expand-contract-ok marker found with no reason on ${filePath}:${markerLineNumber} — add a reason to acknowledge this contract phase`,
		};
	}

	return { isMarked: true, markerReason: reason };
};

// @ts-expect-error rung-0: add proper type in later rung
const getMarkerForCall = (lines, lineIndex, filePath, baseLineNumber) => {
	const sameLineMatch = parseMarkerInfo(
		lines[lineIndex] ?? '',
		baseLineNumber,
		filePath,
		true,
	);
	if (sameLineMatch.isMarked || sameLineMatch.missingReasonLine) {
		return sameLineMatch;
	}

	if (lineIndex === 0) {
		return { isMarked: false };
	}

	const previousLineNumber = baseLineNumber - 1;
	return parseMarkerInfo(
		lines[lineIndex - 1] ?? '',
		previousLineNumber,
		filePath,
	);
};

// @ts-expect-error rung-0: add proper type in later rung
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

// @ts-expect-error rung-0: add proper type in later rung
const getBooleanArg = (callText, argName) => {
	const match = new RegExp(`\\b${argName}\\s*:\\s*(true|false)\\b`, 'iu').exec(
		callText,
	);

	if (match === null) {
		return null;
	}
	return match[1].toLowerCase() === 'true';
};

// @ts-expect-error rung-0: add proper type in later rung
const getStringArg = (callText, argName) => {
	const match = new RegExp(`\\b${argName}\\s*:\\s*"([^"]+)"`, 'i').exec(
		callText,
	);
	if (match === null) {
		return null;
	}
	return match[1];
};

// @ts-expect-error rung-0: add proper type in later rung
const getRawArg = (callText, argName) => {
	const match = new RegExp(
		`\\b${argName}\\s*:\\s*(?<value>[^,\\)]+)`,
		'i',
	).exec(callText);
	if (match === null) {
		return null;
	}
	return match.groups?.value?.trim() ?? null;
};

// @ts-expect-error rung-0: add proper type in later rung
const getOldClrType = (callText) => {
	const match = /\boldClrType\s*:\s*typeof\(\s*([^)]+?)\s*\)/i.exec(callText);
	if (match === null) {
		return null;
	}
	return match[1].trim();
};

// @ts-expect-error rung-0: add proper type in later rung
const getGenericType = (callText, operation) => {
	const match = new RegExp(
		`migrationBuilder\\.${operation}<\\s*([^>\\s]+)\\s*>`,
		'i',
	).exec(callText);
	if (match === null) {
		return null;
	}
	return match[1];
};

// @ts-expect-error rung-0: add proper type in later rung
const addFinding = (state, finding) => {
	const detail =
		state.markerReason === null || state.markerReason === undefined
			? { ...finding, level: 'error' }
			: { ...finding, level: 'warning', markerReason: state.markerReason };

	if (detail.level === 'warning') {
		state.warnings.push(detail);
		return;
	}

	state.errors.push(detail);
};

// @ts-expect-error rung-0: add proper type in later rung
const checkAddColumn = (state, callText, filePath, lineNumber) => {
	const isNullableFalse = getBooleanArg(callText, 'nullable') === false;
	const defaultValue = getRawArg(callText, 'defaultValue');
	const defaultValueSql = getRawArg(callText, 'defaultValueSql');
	const hasDefaultValue =
		(defaultValue !== null && /^null$/i.test(defaultValue) === false) ||
		(defaultValueSql !== null && /^null$/i.test(defaultValueSql) === false);

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

// @ts-expect-error rung-0: add proper type in later rung
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

const RAW_SQL_BREAKING_PATTERNS = [
	{
		name: 'DROP COLUMN',
		regex: /\bdrop\s+column\b/i,
		explanation:
			'This migration executes raw SQL that drops a column, which is a breaking contract for rolling deploys.',
		remedy:
			'Replace with an expand/contract migration (add shadow column first, backfill, then drop old column).',
	},
	{
		name: 'DROP TABLE',
		regex: /\bdrop\s+table\b/i,
		explanation:
			'This migration executes raw SQL that drops a table, which is a breaking contract for rolling deploys.',
		remedy:
			'Keep the old table in place for in-flight app versions and remove it only after all apps have migrated.',
	},
	{
		// Covers both "SET NOT NULL" and "... NOT NULL" forms in ALTER COLUMN statements.
		name: 'ALTER COLUMN ... SET NOT NULL',
		regex:
			/\balter\s+table\b(?:(?!\bdrop\b|\brename\b)[\s\S]){0,120}?\balter\s+column\b[\s\S]{0,120}\bset\s+not\s+null\b/i,
		explanation:
			'This migration executes raw SQL that tightens nullability via ALTER COLUMN ... SET NOT NULL.',
		remedy:
			'Move to a nullable transition and enforce non-nullability only after all app versions are writing it.',
	},
	{
		name: 'ALTER COLUMN ... NOT NULL',
		regex:
			/\balter\s+table\b(?:(?!\bdrop\b|\brename\b)[\s\S]){0,120}?\balter\s+column\b(?:(?!\bdrop\b|\brename\b)[\s\S]){0,120}\bnot\s+null\b/i,
		explanation:
			'This migration executes raw SQL that tightens nullability with ALTER COLUMN ... NOT NULL.',
		remedy:
			'Move to a nullable transition and enforce non-nullability only after all app versions are writing it.',
	},
	{
		name: 'RENAME COLUMN',
		regex: /\brename\s+column\b/i,
		explanation:
			'This migration executes raw SQL that renames a column, which is a breaking contract for rolling deploys.',
		remedy:
			'Use add+copy/backfill+drop in separate migrations so old app versions still see existing names.',
	},
	{
		name: 'RENAME TO',
		regex: /\brename\s+to\b/i,
		explanation:
			'This migration executes raw SQL that renames an object, which is a breaking contract for rolling deploys.',
		remedy:
			'Rename through a compatibility window using temporary aliases/views and remove the old object in a follow-up migration.',
	},
	{
		name: 'DROP CONSTRAINT',
		regex: /\bdrop\s+constraint\b/i,
		explanation:
			'This migration executes raw SQL that drops a constraint, which is a breaking contract for rolling deploys.',
		remedy:
			'Keep constraints in place during rollout and remove them only after all app versions are compatible.',
	},
	{
		name: 'DROP DEFAULT',
		regex: /\bdrop\s+default\b/i,
		explanation:
			'This migration executes raw SQL that drops a default, which is a breaking contract for rolling deploys.',
		remedy:
			'Phase out defaults with explicit writes and contract-safe migration steps before removing defaults.',
	},
];

// @ts-expect-error rung-0: add proper type in later rung
const parseSqlStringLiterals = (callText) => {
	const literals = [];
	const verbatimStringRegex = /@"((?:[^"]|"")*?)"/gs;
	const normalStringRegex = /"((?:\\.|[^"\\])*)"/g;

	for (const match of callText.matchAll(verbatimStringRegex)) {
		const value = match[1].replace(/""/g, '"');
		literals.push(value);
	}

	if (literals.length > 0) {
		return literals;
	}

	for (const match of callText.matchAll(normalStringRegex)) {
		literals.push(match[1]);
	}

	return literals;
};

// @ts-expect-error rung-0: add proper type in later rung
const checkSqlOperation = (state, callText, filePath, lineNumber) => {
	for (const literal of parseSqlStringLiterals(callText)) {
		const sql = literal.toLowerCase();
		for (const pattern of RAW_SQL_BREAKING_PATTERNS) {
			if (pattern.regex.test(sql)) {
				addFinding(state, {
					file: filePath,
					line: lineNumber,
					operation: 'Sql',
					explanation: pattern.explanation,
					remedy: pattern.remedy,
				});
				return;
			}
		}
	}
};

const checkOperationCall = (
	// @ts-expect-error rung-0: add proper type in later rung
	state,
	// @ts-expect-error rung-0: add proper type in later rung
	callText,
	// @ts-expect-error rung-0: add proper type in later rung
	filePath,
	// @ts-expect-error rung-0: add proper type in later rung
	lineNumber,
	// @ts-expect-error rung-0: add proper type in later rung
	operationName,
) => {
	switch (operationName) {
		case 'DropColumn':
		case 'DropTable':
		case 'RenameColumn':
		case 'RenameTable': {
			const action =
				operationName === 'DropColumn' || operationName === 'DropTable'
					? 'dropping'
					: 'renaming';
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
		case 'Sql':
		case 'SqlAsync':
			checkSqlOperation(state, callText, filePath, lineNumber);
			return;
		default:
			return;
	}
};

export const findMigrationExpandContractIssues = async ({
	rootDir = process.cwd(),
	// @ts-expect-error rung-0: TS2339
	migrationFilePaths,
	// @ts-expect-error rung-0: TS2339
	runCommand,
} = {}) => {
	const filesToCheck =
		migrationFilePaths ?? (await listMigrationFiles({ rootDir, runCommand }));

	// @ts-expect-error rung-0: TS7034
	const issues = [];
	// @ts-expect-error rung-0: TS7034
	const warnings = [];

	// @ts-expect-error rung-0: TS7005
	const state = { errors: issues, warnings, markerReason: null };

	for (const file of filesToCheck) {
		const filePath = normalizePath(file);
		const source = await readFile(filePath, 'utf8');

		const up = getUpMethodBody(source);
		if (up === null) {
			continue;
		}

		const { body, startLine } = up;
		const lines = body.split('\n');
		const operationRegex =
			/migrationBuilder\.(DropColumn|DropTable|RenameColumn|RenameTable|AddColumn|AlterColumn|Sql|SqlAsync)(?:<[^>]*>)?\s*\(/g;

		for (const match of body.matchAll(operationRegex)) {
			const operationName = match[1];
			const callStart = match.index ?? 0;
			const callEnd = findCallEnd(body, callStart);
			if (callEnd === -1) {
				continue;
			}

			const callText = body.slice(callStart, callEnd + 1);
			const lineIndex = body.slice(0, callStart).split('\n').length - 1;
			const lineNumber = startLine + lineIndex;
			const marker = getMarkerForCall(lines, lineIndex, filePath, lineNumber);
			// @ts-expect-error rung-0: TS2322
			state.markerReason = marker.isMarked ? marker.markerReason : null;
			if (marker.missingReasonLine) {
				state.warnings.push({
					file: filePath,
					line: marker.missingReasonLine,
					operation: 'expand-contract-ok',
					explanation: marker.missingReasonMessage,
					remedy:
						'Add a non-empty reason to this marker and rerun the migration guard.',
					level: 'warning',
					markerReason: 'expand-contract-ok marker present',
				});
			}
			checkOperationCall(state, callText, filePath, lineNumber, operationName);
		}
	}

	// @ts-expect-error rung-0: TS7005
	return [...issues, ...warnings].map((entry) => ({
		...entry,
	}));
};

export { listMigrationFiles, collectDiffPaths };

// @ts-expect-error rung-0: add proper type in later rung
export const hasBlockingExpandContractIssues = async (options) =>
	(await findMigrationExpandContractIssues(options)).filter(
		(issue) => issue.level === 'error',
	).length > 0;

if (
	process.argv[1] &&
	path.basename(process.argv[1]) === 'check-migration-expand-contract.mjs'
) {
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

	console.log(
		'Migration expand/contract guard: no blocking changes in changed migrations.',
	);
}
