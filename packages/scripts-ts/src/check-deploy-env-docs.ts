import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

// #1798: fails when a production-required env var is undocumented in the deploy runbook.
//
// WHAT THIS GUARD ACTUALLY PROVES
// -------------------------------
// It proves ONE property, mechanically: every environment variable that the front or
// API REQUIRES AT STARTUP (unconditionally, or conditionally in production) is
// documented somewhere in docs/deployment/first-deploy-runbook.md.
//
// The requirement is extracted from the ACTUAL SOURCE CODE, not a hand-maintained
// list:
//   - Front: apps/front/src/lib/env.ts (requiredTrimmedString schema entries) and
//     apps/front/src/server.ts (validateRuntimeEnv's production conditional).
//   - API: apps/api/Lib/AppEnvironment.cs (GetRequiredString calls in Initialize()).
// The documented vars are extracted from the ACTUAL runbook (§5a table + §5b block).
//
// WHAT IT DOES NOT PROVE
// ----------------------
// It does NOT prove that the documented description or example value is correct —
// that is a human judgment. It proves only presence: the var name appears.
//
// FAIL-CLOSED DESIGN
// ------------------
// If a source file cannot be parsed (unexpected structure), the guard FAILS LOUDLY
// naming the file and the parse error rather than concluding "nothing to report".
// A guard that silently passes on an unreadable source is worse than no guard —
// it installs a false negative that reassures.

const rootDir = path.resolve(
	fileURLToPath(new URL('../../..', import.meta.url)),
);

// ---------------------------------------------------------------------------
// Front-side extraction
// ---------------------------------------------------------------------------

export interface FrontEnvEntry {
	processKeys: string[];
	required: boolean;
}

export const extractFrontSchemaRequirements = (
	envTsPath: string,
): Map<string, FrontEnvEntry> => {
	const source = readFileSync(envTsPath, 'utf8');
	const results = new Map<string, FrontEnvEntry>();

	const entryPattern =
		/(\w+):\s*\{[^}]*processKeys:\s*\[([^\]]*)\][^}]*schema:\s*(\w+)/gs;

	let match: RegExpExecArray | null;
	let entryCount = 0;
	while ((match = entryPattern.exec(source)) !== null) {
		entryCount++;
		const entryName = match[1];
		const processKeysRaw = match[2];
		const schemaIdentifier = match[3];

		if (
			schemaIdentifier !== 'requiredTrimmedString' &&
			schemaIdentifier !== 'optionalTrimmedString'
		) {
			throw new Error(
				`Front env.ts parse failure at entry "${entryName}": schema identifier "${schemaIdentifier}" is not requiredTrimmedString or optionalTrimmedString. The env.ts structure has changed and this guard no longer understands it — update the guard, do not silence it.`,
			);
		}

		const processKeys: string[] = [];
		const keyPattern = /'([A-Z][A-Z0-9_]*)'/g;
		let keyMatch: RegExpExecArray | null;
		while ((keyMatch = keyPattern.exec(processKeysRaw)) !== null) {
			processKeys.push(keyMatch[1]);
		}

		if (processKeys.length === 0) {
			throw new Error(
				`Front env.ts parse failure at entry "${entryName}": no processKeys found. The env.ts structure has changed.`,
			);
		}

		const required = schemaIdentifier === 'requiredTrimmedString';
		for (const key of processKeys) {
			if (!results.has(key)) {
				results.set(key, { processKeys, required });
			}
		}
	}

	if (entryCount === 0) {
		throw new Error(
			`Front env.ts parse failure: no schema entries found in ${envTsPath}. The file structure has changed and this guard no longer understands it.`,
		);
	}

	return results;
};

export const extractFrontConditionalRequirements = (
	serverTsPath: string,
): Set<string> => {
	const source = readFileSync(serverTsPath, 'utf8');

	const funcMatch =
		/export\s+const\s+validateRuntimeEnv\s*=\s*\(\):\s*void\s*=>\s*\{([\s\S]*?)\};/.exec(
			source,
		);

	if (!funcMatch) {
		throw new Error(
			`Front server.ts parse failure: validateRuntimeEnv function not found in ${serverTsPath}. The file structure has changed.`,
		);
	}

	const funcBody = funcMatch[1];
	const results = new Set<string>();

	const throwPattern =
		/throw\s+new\s+Error\(\s*["']([A-Z][A-Z0-9_]*)\s+is\s+required\s+when\s+NODE_ENV=production[^"']*["']/g;

	let match: RegExpExecArray | null;
	let throwCount = 0;
	while ((match = throwPattern.exec(funcBody)) !== null) {
		throwCount++;
		results.add(match[1]);
	}

	if (throwCount === 0) {
		throw new Error(
			`Front server.ts parse failure: validateRuntimeEnv found but no production-conditional throw detected in ${serverTsPath}. The function structure has changed.`,
		);
	}

	return results;
};

// ---------------------------------------------------------------------------
// API-side extraction
// ---------------------------------------------------------------------------

export const extractApiRequiredStrings = (
	appEnvironmentPath: string,
): Set<string> => {
	const source = readFileSync(appEnvironmentPath, 'utf8');

	// Match the method signature's leading whitespace with a backreference so the
	// closing brace must be at the EXACT same indentation level — works whether the
	// file uses tabs (real AppEnvironment.cs) or spaces (test fixtures).
	const initMatch =
		/^([ \t]*)public\s+static\s+AppEnvironment\s+Initialize\(\s*\)\s*\{([\s\S]*?)\n\1\}/m.exec(
			source,
		);

	if (!initMatch) {
		throw new Error(
			`API AppEnvironment.cs parse failure: Initialize() method not found in ${appEnvironmentPath}. The file structure has changed.`,
		);
	}

	const initBody = initMatch[2];
	const results = new Set<string>();

	// In AppEnvironment.cs, GetRequiredString(nameof(X)) / GetRequiredInt(nameof(X))
	// use C#'s nameof operator which resolves to the literal string "X" — the name
	// of the property/constant. There are no intermediate const string declarations
	// to resolve; the env var name IS the symbol name. So
	// nameof(POSTGRES_CONNECTION_STRING) = "POSTGRES_CONNECTION_STRING".
	// Literal form: GetRequiredString("SOME_NAME") / GetRequiredInt("SOME_NAME")
	// uses the literal directly.
	// #1798 round 4: GetRequiredInt declares 8 additional required vars
	// (SESSION_EXPIRY_DAYS, EMAIL_VERIFY_TOKEN_VALIDITY_DURATION,
	// PASSWORD_RESET_TOKEN_VALIDITY_DURATION, PASSWORD_MIN_LENGTH,
	// EMAIL_VERIFY_TOKEN_LENGTH, PASSWORD_RESET_TOKEN_LENGTH,
	// INVITATION_TOKEN_LENGTH) that crash-loop startup identically to
	// GetRequiredString vars. Both must be covered.
	const requiredStringPattern =
		/GetRequiredString\(\s*(?:nameof\s*\(\s*([A-Z][A-Z0-9_]*)\s*\)|"([A-Z][A-Z0-9_]*)")\s*\)/g;
	let match: RegExpExecArray | null;
	let callCount = 0;
	while ((match = requiredStringPattern.exec(initBody)) !== null) {
		callCount++;
		const nameofName = match[1];
		const literalName = match[2];
		if (nameofName) {
			// nameof(X) resolves to the literal string "X"
			results.add(nameofName);
		} else if (literalName) {
			results.add(literalName);
		}
	}

	const requiredIntPattern =
		/GetRequiredInt\(\s*(?:nameof\s*\(\s*([A-Z][A-Z0-9_]*)\s*\)|"([A-Z][A-Z0-9_]*)")\s*\)/g;
	let intMatch: RegExpExecArray | null;
	while ((intMatch = requiredIntPattern.exec(initBody)) !== null) {
		callCount++;
		const nameofName = intMatch[1];
		const literalName = intMatch[2];
		if (nameofName) {
			results.add(nameofName);
		} else if (literalName) {
			results.add(literalName);
		}
	}

	if (callCount === 0) {
		throw new Error(
			`API AppEnvironment.cs parse failure: Initialize() found but no GetRequiredString or GetRequiredInt calls detected in ${appEnvironmentPath}. The method structure has changed.`,
		);
	}

	return results;
};

// ---------------------------------------------------------------------------
// Runbook extraction
// ---------------------------------------------------------------------------

export const extractDocumentedVars = (runbookPath: string): Set<string> => {
	const source = readFileSync(runbookPath, 'utf8');
	const results = new Set<string>();

	const section5aMatch = /###\s+5a\.[\s\S]*?\n([\s\S]*?)###\s+5b\./.exec(
		source,
	);
	if (!section5aMatch) {
		throw new Error(
			`Runbook parse failure: §5a section not found in ${runbookPath}. The document structure has changed.`,
		);
	}
	const section5a = section5aMatch[1];

	const tableRowPattern = /\|\s*`([A-Z][A-Z0-9_]*)`\s*\|/g;
	let match: RegExpExecArray | null;
	let rowCount = 0;
	while ((match = tableRowPattern.exec(section5a)) !== null) {
		rowCount++;
		results.add(match[1]);
	}

	if (rowCount === 0) {
		throw new Error(
			`Runbook parse failure: §5a table found but no variable rows detected in ${runbookPath}. The table structure has changed.`,
		);
	}

	const section5bMatch =
		/###\s+5b\.[\s\S]*?\n([\s\S]*?)(?:\n###\s+|\n---)/.exec(source);
	if (!section5bMatch) {
		throw new Error(
			`Runbook parse failure: §5b section not found in ${runbookPath}. The document structure has changed.`,
		);
	}
	const section5b = section5bMatch[1];

	const configLinePattern = /^([A-Z][A-Z0-9_]*)\s*=/gm;
	let configMatch: RegExpExecArray | null;
	while ((configMatch = configLinePattern.exec(section5b)) !== null) {
		results.add(configMatch[1]);
	}

	return results;
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export const REQUIRED_VAR_SOURCES = [
	'front schema (env.ts)',
	'front runtime (server.ts)',
	'API startup (AppEnvironment.cs)',
] as const;

export type RequiredVarSource = (typeof REQUIRED_VAR_SOURCES)[number];

export interface RequiredVar {
	name: string;
	source: RequiredVarSource;
	reason: string;
}

export const collectRequiredVars = (root: string): RequiredVar[] => {
	const envTsPath = path.join(root, 'apps/front/src/lib/env.ts');
	const serverTsPath = path.join(root, 'apps/front/src/server.ts');
	const appEnvironmentPath = path.join(root, 'apps/api/Lib/AppEnvironment.cs');

	const frontSchema = extractFrontSchemaRequirements(envTsPath);
	const frontConditional = extractFrontConditionalRequirements(serverTsPath);
	const apiRequired = extractApiRequiredStrings(appEnvironmentPath);

	const requiredVars: RequiredVar[] = [];

	for (const [key, entry] of frontSchema) {
		if (entry.required) {
			requiredVars.push({
				name: key,
				source: 'front schema (env.ts)',
				reason: 'requiredTrimmedString',
			});
		}
	}

	for (const varName of frontConditional) {
		requiredVars.push({
			name: varName,
			source: 'front runtime (server.ts)',
			reason: 'validateRuntimeEnv production conditional',
		});
	}

	for (const varName of apiRequired) {
		requiredVars.push({
			name: varName,
			source: 'API startup (AppEnvironment.cs)',
			reason: 'GetRequiredString/GetRequiredInt in Initialize()',
		});
	}

	return requiredVars;
};

export const findUndocumentedVars = (
	requiredVars: RequiredVar[],
	documentedVars: Set<string>,
): RequiredVar[] => {
	return requiredVars.filter((v) => !documentedVars.has(v.name));
};

const main = (): void => {
	const runbookPath = path.join(
		rootDir,
		'docs/deployment/first-deploy-runbook.md',
	);

	const requiredVars = collectRequiredVars(rootDir);
	const documentedVars = extractDocumentedVars(runbookPath);
	const undocumented = findUndocumentedVars(requiredVars, documentedVars);

	if (undocumented.length > 0) {
		console.error(
			`#1798 deploy env doc guard: ${undocumented.length} production-required env var(s) undocumented in ${runbookPath}:\n`,
		);
		for (const v of undocumented) {
			console.error(`  - ${v.name} [${v.source}, ${v.reason}]`);
		}
		console.error(
			`\nAdd each to §5a (or §5b if it matches a config-with-default pattern) of the runbook with: what it is, the exact consequence of its absence (container crash-loop at startup), and an example value.`,
		);
		process.exit(1);
	}

	const uniqueRequired = new Set(requiredVars.map((v) => v.name));
	console.log(
		`#1798 deploy env doc guard: OK — all ${uniqueRequired.size} production-required env vars are documented in the runbook.`,
	);
};

if (
	process.argv[1] !== undefined &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	main();
}
