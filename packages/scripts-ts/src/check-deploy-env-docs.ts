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
//   - API: apps/api/Lib/AppEnvironment.cs (GetRequiredString, GetRequiredInt, and
//     GetOptionalAppRole calls in Initialize()).
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
//
// The API extractor enumerates every form of "required at startup" it knows:
//   Form 1 — GetRequiredString(nameof(X)) / GetRequiredString("X")
//   Form 2 — GetRequiredInt(nameof(X)) / GetRequiredInt("X")
//   Form 3 — GetOptionalAppRole(CONSTANT, default)  [REQUIRED in production]
// Any `Get*` call in Initialize() that is NOT one of these forms FAILS LOUD naming
// the call and its line. A list we cannot close must signal itself, not announce
// itself complete.

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

	// Resolve `const string NAME = "VALUE"` declarations (e.g. AppRoleVariableName
	// = "APP_ROLE") so GetOptionalAppRole(AppRoleVariableName, ...) resolves to
	// the actual env var name. Scans the WHOLE file, not just Initialize().
	const constantPattern =
		/(?:internal\s+)?const\s+string\s+([A-Z][A-Za-z0-9_]*)\s*=\s*"([A-Z][A-Z0-9_]*)"/g;
	const constants = new Map<string, string>();
	let constantMatch: RegExpExecArray | null;
	while ((constantMatch = constantPattern.exec(source)) !== null) {
		constants.set(constantMatch[1], constantMatch[2]);
	}

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

	// Tracks the character range [start, end) of every config-getter call the
	// guard RECOGNIZES, so the fail-closed pass below can detect any `Get*` call
	// it does NOT know how to classify. A guard that silently skips what it
	// can't read is worse than no guard — it installs a false negative.
	const recognizedCalls: Array<{ start: number; end: number }> = [];

	// --- Form 1: GetRequiredString -------------------------------------------
	// Throws InvalidOperationException when the env var is missing/blank.
	// nameof(X) resolves to "X"; literal form uses the literal directly.
	const requiredStringPattern =
		/GetRequiredString\(\s*(?:nameof\s*\(\s*([A-Z][A-Z0-9_]*)\s*\)|"([A-Z][A-Z0-9_]*)")\s*\)/g;
	let match: RegExpExecArray | null;
	while ((match = requiredStringPattern.exec(initBody)) !== null) {
		recognizedCalls.push({
			start: match.index,
			end: match.index + match[0].length,
		});
		const nameofName = match[1];
		const literalName = match[2];
		if (nameofName) {
			results.add(nameofName);
		} else if (literalName) {
			results.add(literalName);
		}
	}

	// --- Form 2: GetRequiredInt ----------------------------------------------
	// Throws InvalidOperationException when missing/blank/unparseable.
	const requiredIntPattern =
		/GetRequiredInt\(\s*(?:nameof\s*\(\s*([A-Z][A-Z0-9_]*)\s*\)|"([A-Z][A-Z0-9_]*)")\s*\)/g;
	let intMatch: RegExpExecArray | null;
	while ((intMatch = requiredIntPattern.exec(initBody)) !== null) {
		recognizedCalls.push({
			start: intMatch.index,
			end: intMatch.index + intMatch[0].length,
		});
		const nameofName = intMatch[1];
		const literalName = intMatch[2];
		if (nameofName) {
			results.add(nameofName);
		} else if (literalName) {
			results.add(literalName);
		}
	}

	// --- Form 3: GetOptionalAppRole ------------------------------------------
	// The ONLY GetOptional* method that is REQUIRED in production. It takes the
	// env var name as a constant (AppRoleVariableName) and a dev/test-only default
	// (AppRole.All). Outside Development/Testing a missing/blank APP_ROLE throws
	// the SAME InvalidOperationException path GetRequiredString uses.
	const optionalAppRolePattern =
		/GetOptionalAppRole\s*\(\s*([A-Z][A-Za-z0-9_]*)\s*,\s*[^)]+\)/g;
	let roleMatch: RegExpExecArray | null;
	while ((roleMatch = optionalAppRolePattern.exec(initBody)) !== null) {
		recognizedCalls.push({
			start: roleMatch.index,
			end: roleMatch.index + roleMatch[0].length,
		});
		const firstArg = roleMatch[1];
		const resolved = constants.get(firstArg);
		if (resolved) {
			results.add(resolved);
		} else {
			throw new Error(
				`API AppEnvironment.cs parse failure: GetOptionalAppRole(${firstArg}, ...) at index ${roleMatch.index} in Initialize() — the constant "${firstArg}" could not be resolved to an env var name. Either the constant declaration is missing or its name changed.`,
			);
		}
	}

	// --- Known optional forms (have defaults, NOT required) ------------------
	// Recognized only so the fail-closed pass below does not flag them.
	const optionalPattern = /GetOptional(?:Bool|String|Int|Long|CsvList)\s*\(/g;
	let optMatch: RegExpExecArray | null;
	while ((optMatch = optionalPattern.exec(initBody)) !== null) {
		recognizedCalls.push({
			start: optMatch.index,
			end: optMatch.index + optMatch[0].length,
		});
	}

	// --- Fail-closed: any unrecognized config-getter call FAILS LOUD ---------
	// Every `GetRequired*` / `GetOptional*` call in Initialize() must be classified
	// above. If a new form appears (e.g. GetRequiredFoo, or an indirect form like
	// `var key = "X"; GetRequiredString(key)`), the guard FAILS naming the call
	// and its line rather than silently dropping it.
	const anyGetterPattern = /Get(?:Required[A-Za-z]*|Optional[A-Za-z]*)\s*\(/g;
	let anyMatch: RegExpExecArray | null;
	while ((anyMatch = anyGetterPattern.exec(initBody)) !== null) {
		const isRecognized = recognizedCalls.some(
			(c) => anyMatch!.index >= c.start && anyMatch!.index < c.end,
		);
		if (!isRecognized) {
			const callEnd = initBody.indexOf(')', anyMatch.index);
			const callText =
				callEnd > -1
					? initBody.slice(anyMatch.index, callEnd + 1)
					: initBody.slice(anyMatch.index, anyMatch.index + 40);
			const initBodyStart = initMatch.index + initMatch[0].indexOf('\n') + 1;
			const lineNumber = source
				.slice(0, initBodyStart + anyMatch.index)
				.split('\n').length;
			throw new Error(
				`API AppEnvironment.cs parse failure: unclassified config getter call "${callText}" at line ${lineNumber} in Initialize(). This guard does not know whether this call is required or optional at startup. Add it to the known patterns in the guard — do not silence this error.`,
			);
		}
	}

	if (results.size === 0) {
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
			reason:
				'GetRequiredString/GetRequiredInt/GetOptionalAppRole in Initialize()',
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
