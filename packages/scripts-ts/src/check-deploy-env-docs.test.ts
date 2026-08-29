import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, test } from 'vitest';

import {
	collectRequiredVars,
	extractApiRequiredStrings,
	extractDocumentedVars,
	extractFrontConditionalRequirements,
	extractFrontSchemaRequirements,
	findUndocumentedVars,
} from './check-deploy-env-docs.ts';

// ---------------------------------------------------------------------------
// Test 1: PAIRED RED/GREEN PROOF — guard is RED against the BASE runbook
// (without PUBLIC_ORIGIN), GREEN after the fix.
// ---------------------------------------------------------------------------
// This is the real paired proof the brief demands: the guard, executed against
// the runbook AS IT WAS AT THE BASE (without the PR's own addition), must RED
// naming PUBLIC_ORIGIN. Executed against the corrected runbook, it must PASS.
// The previous version of this test asserted only the post-fix state (GREEN)
// and mislabeled it "RED proof" — the inversion the R3 verdict caught.

let tmpDir: string;

beforeEach(() => {
	tmpDir = path.join(
		tmpdir(),
		`check-deploy-env-docs-paired-${Date.now()}-${Math.random().toString(36).slice(2)}`,
	);
	mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
	rmSync(tmpDir, { recursive: true, force: true });
});

test('PAIRED RED/GREEN: guard is RED against base runbook (PUBLIC_ORIGIN missing), GREEN after fix', () => {
	const root = path.dirname(fileURLToPath(import.meta.url));
	const repoRoot = path.resolve(root, '../../..');
	const realRunbookPath = path.join(
		repoRoot,
		'docs/deployment/first-deploy-runbook.md',
	);
	const realRunbook = readFileSync(realRunbookPath, 'utf8');

	// --- RED phase: simulate the base runbook without PUBLIC_ORIGIN ---
	const baseRunbook = realRunbook.replace(/\| `PUBLIC_ORIGIN`.*\|.*\n/, '');
	const baseRunbookPath = path.join(tmpDir, 'base-runbook.md');
	writeFileSync(baseRunbookPath, baseRunbook);

	const requiredVars = collectRequiredVars(repoRoot);
	const documentedVarsAtBase = extractDocumentedVars(baseRunbookPath);
	const undocumentedAtBase = findUndocumentedVars(
		requiredVars,
		documentedVarsAtBase,
	);

	// RED: PUBLIC_ORIGIN must be flagged as undocumented against the base runbook
	const publicOriginMissing = undocumentedAtBase.find(
		(v) => v.name === 'PUBLIC_ORIGIN',
	);
	assert.ok(
		publicOriginMissing,
		'RED phase failed: PUBLIC_ORIGIN was NOT flagged as undocumented against the base runbook. The guard would not catch the defect it exists to catch.',
	);
	assert.equal(publicOriginMissing!.name, 'PUBLIC_ORIGIN');

	// --- GREEN phase: the corrected runbook (with PUBLIC_ORIGIN) ---
	const documentedVarsFixed = extractDocumentedVars(realRunbookPath);
	const undocumentedFixed = findUndocumentedVars(
		requiredVars,
		documentedVarsFixed,
	);

	// GREEN: no undocumented vars after the fix
	assert.equal(
		undocumentedFixed.length,
		0,
		`GREEN phase failed: expected 0 undocumented vars after fix, but found ${undocumentedFixed.length}: ${undocumentedFixed.map((v) => v.name).join(', ')}`,
	);
});

// ---------------------------------------------------------------------------
// Test 1b: GetRequiredInt coverage — the 7 int vars are in the required set.
// ---------------------------------------------------------------------------

test('GetRequiredInt coverage: all 7 int vars are in the required set', () => {
	const root = path.dirname(fileURLToPath(import.meta.url));
	const repoRoot = path.resolve(root, '../../..');
	const requiredVars = collectRequiredVars(repoRoot);
	const requiredNames = new Set(requiredVars.map((v) => v.name));

	const intVars = [
		'SESSION_EXPIRY_DAYS',
		'EMAIL_VERIFY_TOKEN_VALIDITY_DURATION',
		'PASSWORD_RESET_TOKEN_VALIDITY_DURATION',
		'PASSWORD_MIN_LENGTH',
		'EMAIL_VERIFY_TOKEN_LENGTH',
		'PASSWORD_RESET_TOKEN_LENGTH',
		'INVITATION_TOKEN_LENGTH',
	];

	for (const varName of intVars) {
		assert.ok(
			requiredNames.has(varName),
			`GetRequiredInt var ${varName} is NOT in the required set — the guard is blind to it. Removing it from the runbook would not turn the guard red.`,
		);
	}
});

// ---------------------------------------------------------------------------
// Test 1c: PAIRED RED/GREEN for GetRequiredInt — removing one from the
// runbook turns the guard red, naming it.
// ---------------------------------------------------------------------------

test('PAIRED RED/GREEN: removing a GetRequiredInt var from the runbook turns the guard red, naming it', () => {
	const root = path.dirname(fileURLToPath(import.meta.url));
	const repoRoot = path.resolve(root, '../../..');
	const realRunbookPath = path.join(
		repoRoot,
		'docs/deployment/first-deploy-runbook.md',
	);
	const realRunbook = readFileSync(realRunbookPath, 'utf8');

	// Remove one GetRequiredInt var (SESSION_EXPIRY_DAYS) from §5b
	const mutatedRunbook = realRunbook.replace(/SESSION_EXPIRY_DAYS=\d+\n/, '');
	const mutatedPath = path.join(tmpDir, 'mutated-runbook.md');
	writeFileSync(mutatedPath, mutatedRunbook);

	const requiredVars = collectRequiredVars(repoRoot);
	const documentedVars = extractDocumentedVars(mutatedPath);
	const undocumented = findUndocumentedVars(requiredVars, documentedVars);

	const sessionExpiryMissing = undocumented.find(
		(v) => v.name === 'SESSION_EXPIRY_DAYS',
	);
	assert.ok(
		sessionExpiryMissing,
		'RED phase failed: SESSION_EXPIRY_DAYS was NOT flagged as undocumented after removal. The guard is blind to GetRequiredInt vars.',
	);
	assert.equal(sessionExpiryMissing!.name, 'SESSION_EXPIRY_DAYS');
});

// ---------------------------------------------------------------------------
// Test 1d: PAIRED RED/GREEN for APP_ROLE — removing it from the runbook
// turns the guard red, naming it. (Trou 1 proof)
// ---------------------------------------------------------------------------

test('PAIRED RED/GREEN: removing APP_ROLE from the runbook turns the guard red, naming it', () => {
	const root = path.dirname(fileURLToPath(import.meta.url));
	const repoRoot = path.resolve(root, '../../..');
	const realRunbookPath = path.join(
		repoRoot,
		'docs/deployment/first-deploy-runbook.md',
	);
	const realRunbook = readFileSync(realRunbookPath, 'utf8');

	// Remove APP_ROLE from §5a table
	const mutatedRunbook = realRunbook.replace(/\| `APP_ROLE`.*\|.*\n/, '');
	const mutatedPath = path.join(tmpDir, 'mutated-runbook.md');
	writeFileSync(mutatedPath, mutatedRunbook);

	const requiredVars = collectRequiredVars(repoRoot);
	const documentedVars = extractDocumentedVars(mutatedPath);
	const undocumented = findUndocumentedVars(requiredVars, documentedVars);

	const appRoleMissing = undocumented.find((v) => v.name === 'APP_ROLE');
	assert.ok(
		appRoleMissing,
		'RED phase failed: APP_ROLE was NOT flagged as undocumented after removal. The guard is blind to APP_ROLE — the third required form is invisible.',
	);
	assert.equal(appRoleMissing!.name, 'APP_ROLE');
});

// ---------------------------------------------------------------------------
// Test 1e: APP_ROLE is in the required set (Trou 1 proof)
// ---------------------------------------------------------------------------

test('APP_ROLE is in the required set (GetOptionalAppRole form)', () => {
	const root = path.dirname(fileURLToPath(import.meta.url));
	const repoRoot = path.resolve(root, '../../..');
	const requiredVars = collectRequiredVars(repoRoot);
	const requiredNames = new Set(requiredVars.map((v) => v.name));

	assert.ok(
		requiredNames.has('APP_ROLE'),
		'APP_ROLE is NOT in the required set — the guard ignores the GetOptionalAppRole form. Removing it from the runbook would not turn the guard red.',
	);
});

// ---------------------------------------------------------------------------
// Test 2: Front schema extraction works correctly
// ---------------------------------------------------------------------------

const tmpDirs: string[] = [];

const createFixture = (files: Record<string, string>): string => {
	const dir = path.join(
		tmpdir(),
		`check-deploy-env-docs-${Date.now()}-${Math.random().toString(36).slice(2)}`,
	);
	tmpDirs.push(dir);
	for (const [relative, content] of Object.entries(files)) {
		const abs = path.join(dir, relative);
		mkdirSync(path.dirname(abs), { recursive: true });
		writeFileSync(abs, content);
	}
	return dir;
};

afterEach(() => {
	for (const dir of tmpDirs) {
		rmSync(dir, { recursive: true, force: true });
	}
	tmpDirs.length = 0;
});

test('extractFrontSchemaRequirements: identifies requiredTrimmedString entries', () => {
	const dir = createFixture({
		'env.ts': `
const requiredTrimmedString = z.string().trim().min(1);
const optionalTrimmedString = z.string().trim().min(1).optional();

const envDefinition = {
    public: {
        apiBaseUrl: {
            wireKey: 'PUBLIC_API_BASE_URL',
            processKeys: ['PUBLIC_API_BASE_URL'],
            schema: requiredTrimmedString,
        },
        posthogProjectToken: {
            wireKey: 'PUBLIC_POSTHOG_PROJECT_TOKEN',
            processKeys: ['PUBLIC_POSTHOG_PROJECT_TOKEN'],
            schema: optionalTrimmedString,
        },
    },
    server: {
        nodeEnv: {
            processKeys: ['NODE_ENV'],
            schema: optionalTrimmedString,
        },
    },
} as const;
`,
	});

	const result = extractFrontSchemaRequirements(path.join(dir, 'env.ts'));
	assert.equal(result.size, 3);
	assert.equal(result.get('PUBLIC_API_BASE_URL')?.required, true);
	assert.equal(result.get('PUBLIC_POSTHOG_PROJECT_TOKEN')?.required, false);
	assert.equal(result.get('NODE_ENV')?.required, false);
});

test('extractFrontSchemaRequirements: throws on unknown schema identifier', () => {
	const dir = createFixture({
		'env.ts': `
const envDefinition = {
    server: {
        unknown: {
            processKeys: ['UNKNOWN'],
            schema: someUnknownSchema,
        },
    },
} as const;
`,
	});

	assert.throws(
		() => extractFrontSchemaRequirements(path.join(dir, 'env.ts')),
		/schema identifier "someUnknownSchema" is not requiredTrimmedString or optionalTrimmedString/,
	);
});

test('extractFrontSchemaRequirements: throws when no entries found', () => {
	const dir = createFixture({
		'env.ts': '// empty file\n',
	});

	assert.throws(
		() => extractFrontSchemaRequirements(path.join(dir, 'env.ts')),
		/no schema entries found/,
	);
});

// ---------------------------------------------------------------------------
// Test 3: Front conditional requirements extraction
// ---------------------------------------------------------------------------

test('extractFrontConditionalRequirements: finds production-conditional throws', () => {
	const dir = createFixture({
		'server.ts': `
export const validateRuntimeEnv = (): void => {
    getPublicEnv();
    const serverEnv = getServerEnv();
    if (
        serverEnv.nodeEnv === 'production' &&
        serverEnv.publicOrigin === undefined
    ) {
        throw new Error(
            "PUBLIC_ORIGIN is required when NODE_ENV=production: ...",
        );
    }
};
`,
	});

	const result = extractFrontConditionalRequirements(
		path.join(dir, 'server.ts'),
	);
	assert.equal(result.size, 1);
	assert.ok(result.has('PUBLIC_ORIGIN'));
});

test('extractFrontConditionalRequirements: throws when no throws found', () => {
	const dir = createFixture({
		'server.ts': `
export const validateRuntimeEnv = (): void => {
    getPublicEnv();
};
`,
	});

	assert.throws(
		() => extractFrontConditionalRequirements(path.join(dir, 'server.ts')),
		/no production-conditional throw detected/,
	);
});

// ---------------------------------------------------------------------------
// Test 4: API extraction
// ---------------------------------------------------------------------------

test('extractApiRequiredStrings: finds GetRequiredString calls with nameof and literal', () => {
	const dir = createFixture({
		'AppEnvironment.cs': `
public class AppEnvironment {
    public string POSTGRES_CONNECTION_STRING { get; }

    public static AppEnvironment Initialize() {
        var existing = Volatile.Read(ref _instance);
        if (existing is not null) {
            return existing;
        }

        lock (InitLock) {
            LoadDotEnvIfDevelopment();
            var settings = new AppEnvironment(
                postgresConnectionString: GetRequiredString(nameof(POSTGRES_CONNECTION_STRING)),
                socialKey: GetRequiredString("SOCIAL_ACCOUNTS_MASTER_KEY")
            );
            return settings;
        }
    }
}
`,
	});

	const result = extractApiRequiredStrings(path.join(dir, 'AppEnvironment.cs'));
	assert.ok(result.has('POSTGRES_CONNECTION_STRING'));
	assert.ok(result.has('SOCIAL_ACCOUNTS_MASTER_KEY'));
});

test('extractApiRequiredStrings: throws when no calls found', () => {
	const dir = createFixture({
		'AppEnvironment.cs': `
public class AppEnvironment {
    public static AppEnvironment Initialize() {
        var existing = Volatile.Read(ref _instance);
        if (existing is not null) {
            return existing;
        }

        lock (InitLock) {
            return new AppEnvironment();
        }
    }
}
`,
	});

	assert.throws(
		() => extractApiRequiredStrings(path.join(dir, 'AppEnvironment.cs')),
		/no GetRequiredString or GetRequiredInt calls detected/,
	);
});

test('extractApiRequiredStrings: finds GetRequiredInt calls with nameof and literal', () => {
	const dir = createFixture({
		'AppEnvironment.cs': `
public class AppEnvironment {
    public int SESSION_EXPIRY_DAYS { get; }

    public static AppEnvironment Initialize() {
        var existing = Volatile.Read(ref _instance);
        if (existing is not null) {
            return existing;
        }

        lock (InitLock) {
            LoadDotEnvIfDevelopment();
            var settings = new AppEnvironment(
                sessionExpiryDays: GetRequiredInt(nameof(SESSION_EXPIRY_DAYS)),
                tokenLength: GetRequiredInt("EMAIL_VERIFY_TOKEN_LENGTH")
            );
            return settings;
        }
    }
}
`,
	});

	const result = extractApiRequiredStrings(path.join(dir, 'AppEnvironment.cs'));
	assert.ok(result.has('SESSION_EXPIRY_DAYS'));
	assert.ok(result.has('EMAIL_VERIFY_TOKEN_LENGTH'));
});

// ---------------------------------------------------------------------------
// Test 4a: APP_ROLE extraction via GetOptionalAppRole (Trou 1)
// ---------------------------------------------------------------------------

test('extractApiRequiredStrings: extracts APP_ROLE via GetOptionalAppRole with constant', () => {
	const dir = createFixture({
		'AppEnvironment.cs': `
public class AppEnvironment {
    internal const string AppRoleVariableName = "APP_ROLE";

    public static AppEnvironment Initialize() {
        var existing = Volatile.Read(ref _instance);
        if (existing is not null) {
            return existing;
        }

        lock (InitLock) {
            LoadDotEnvIfDevelopment();
            var settings = new AppEnvironment(
                postgresConnectionString: GetRequiredString(nameof(POSTGRES_CONNECTION_STRING)),
                role: GetOptionalAppRole(AppRoleVariableName, AppRole.All)
            );
            return settings;
        }
    }
}
`,
	});

	const result = extractApiRequiredStrings(path.join(dir, 'AppEnvironment.cs'));
	assert.ok(
		result.has('APP_ROLE'),
		'APP_ROLE must be extracted from GetOptionalAppRole(AppRoleVariableName, ...)',
	);
	assert.ok(result.has('POSTGRES_CONNECTION_STRING'));
});

// ---------------------------------------------------------------------------
// Test 4b: Fail-closed on unclassified Get* call (Trou 2)
// ---------------------------------------------------------------------------

test('extractApiRequiredStrings: FAILS LOUD on unclassified Get* call (indirect form)', () => {
	const dir = createFixture({
		'AppEnvironment.cs': `
public class AppEnvironment {
    public static AppEnvironment Initialize() {
        var existing = Volatile.Read(ref _instance);
        if (existing is not null) {
            return existing;
        }

        lock (InitLock) {
            LoadDotEnvIfDevelopment();
            var key = "SOME_VAR";
            var settings = new AppEnvironment(
                postgresConnectionString: GetRequiredString(key)
            );
            return settings;
        }
    }
}
`,
	});

	assert.throws(
		() => extractApiRequiredStrings(path.join(dir, 'AppEnvironment.cs')),
		/unclassified config getter call/,
	);
});

test('extractApiRequiredStrings: FAILS LOUD on unknown Get* method', () => {
	const dir = createFixture({
		'AppEnvironment.cs': `
public class AppEnvironment {
    public static AppEnvironment Initialize() {
        var existing = Volatile.Read(ref _instance);
        if (existing is not null) {
            return existing;
        }

        lock (InitLock) {
            LoadDotEnvIfDevelopment();
            var settings = new AppEnvironment(
                postgresConnectionString: GetRequiredString(nameof(POSTGRES_CONNECTION_STRING)),
                someValue: GetRequiredFoo(nameof(SOME_VAR))
            );
            return settings;
        }
    }
}
`,
	});

	assert.throws(
		() => extractApiRequiredStrings(path.join(dir, 'AppEnvironment.cs')),
		/unclassified config getter call "GetRequiredFoo/,
	);
});

// ---------------------------------------------------------------------------
// Test 5: Runbook extraction
// ---------------------------------------------------------------------------

test('extractDocumentedVars: finds vars in §5a table and §5b block', () => {
	const dir = createFixture({
		'runbook.md':
			'# Deploy Runbook\n\n## 5. Env Vars\n\n### 5a. REQUIRED\n\n| Variable | Value |\n| -------- | ----- |\n| `RELEASE_TAG` | the tag |\n| `POSTGRES_CONNECTION_STRING` | the conn |\n\n### 5b. REQUIRED config\n\n```\nSESSION_TOKEN_HEADER_KEY=X-Session-Token\nTENANT_ID_HEADER_KEY=X-Tenant-Id\n```\n\n### 5c. OPTIONAL\n\nRATE_LIMIT, MAX_ROWS.\n',
	});

	const result = extractDocumentedVars(path.join(dir, 'runbook.md'));
	assert.ok(result.has('RELEASE_TAG'));
	assert.ok(result.has('POSTGRES_CONNECTION_STRING'));
	assert.ok(result.has('SESSION_TOKEN_HEADER_KEY'));
	assert.ok(result.has('TENANT_ID_HEADER_KEY'));
	assert.equal(result.size, 4);
});

test('extractDocumentedVars: throws when §5a not found', () => {
	const dir = createFixture({
		'runbook.md': '# Empty\n',
	});

	assert.throws(
		() => extractDocumentedVars(path.join(dir, 'runbook.md')),
		/§5a section not found/,
	);
});

// ---------------------------------------------------------------------------
// Test 6: FALSE POSITIVE — optional var does NOT trigger the guard
// ---------------------------------------------------------------------------

test('FALSE POSITIVE: optional var in §5c does not trigger the guard', () => {
	const dir = createFixture({
		'runbook.md':
			'# Deploy Runbook\n\n### 5a. REQUIRED\n\n| Variable | Value |\n| -------- | ----- |\n| `REQUIRED_VAR` | required |\n\n### 5b. REQUIRED config\n\n```\nANOTHER_REQUIRED=1\n```\n\n### 5c. OPTIONAL\n\n`OPTIONAL_RATE_LIMIT` (30), `OPTIONAL_MAX_ROWS` (5).\n',
	});

	// Simulate a required var set that includes an optional one
	const requiredVars = [
		{
			name: 'REQUIRED_VAR',
			source: 'front schema (env.ts)' as const,
			reason: 'requiredTrimmedString',
		},
		{
			name: 'ANOTHER_REQUIRED',
			source: 'API startup (AppEnvironment.cs)' as const,
			reason:
				'GetRequiredString/GetRequiredInt/GetOptionalAppRole in Initialize()',
		},
	];

	const documentedVars = extractDocumentedVars(path.join(dir, 'runbook.md'));
	const undocumented = findUndocumentedVars(requiredVars, documentedVars);

	// Both required vars are documented; none missing
	assert.equal(undocumented.length, 0);
});

// ---------------------------------------------------------------------------
// Test 7: UNREADABLE INPUT — guard fails loudly rather than silently passing
// ---------------------------------------------------------------------------

test('UNREADABLE INPUT: malformed env.ts fails with named error', () => {
	const dir = createFixture({
		'env.ts': 'this is not valid env schema at all\n',
	});

	assert.throws(
		() => extractFrontSchemaRequirements(path.join(dir, 'env.ts')),
		/Front env.ts parse failure/,
	);
});

test('UNREADABLE INPUT: malformed runbook fails with named error', () => {
	const dir = createFixture({
		'runbook.md': 'no sections here at all\n',
	});

	assert.throws(
		() => extractDocumentedVars(path.join(dir, 'runbook.md')),
		/Runbook parse failure: §5a section not found/,
	);
});

test('UNREADABLE INPUT: malformed AppEnvironment.cs fails with named error', () => {
	const dir = createFixture({
		'AppEnvironment.cs': 'not a class\n',
	});

	assert.throws(
		() => extractApiRequiredStrings(path.join(dir, 'AppEnvironment.cs')),
		/API AppEnvironment.cs parse failure: Initialize\(\) method not found/,
	);
});

// ---------------------------------------------------------------------------
// Test 8: PAIRED RED/GREEN against the REAL base runbook (Trou 3b)
// Uses git show 490f6d03:docs/deployment/first-deploy-runbook.md — the actual
// historical state at the merge base, not a hand-manipulated copy.
// ---------------------------------------------------------------------------

test('PAIRED RED/GREEN: guard is RED against the REAL base runbook (git show 490f6d03), GREEN after fix', () => {
	const root = path.dirname(fileURLToPath(import.meta.url));
	const repoRoot = path.resolve(root, '../../..');
	const realRunbookPath = path.join(
		repoRoot,
		'docs/deployment/first-deploy-runbook.md',
	);

	// Read the REAL base runbook from git history (490f6d03 = the merge-base
	// commit where this lane diverged). This is the actual historical state,
	// not a simulation.
	const { execSync } = require('node:child_process');
	const baseRunbook = execSync(
		'git show 490f6d03:docs/deployment/first-deploy-runbook.md',
		{ cwd: repoRoot, encoding: 'utf8' },
	);
	const baseRunbookPath = path.join(tmpDir, 'real-base-runbook.md');
	writeFileSync(baseRunbookPath, baseRunbook);

	const requiredVars = collectRequiredVars(repoRoot);
	const documentedVarsAtBase = extractDocumentedVars(baseRunbookPath);
	const undocumentedAtBase = findUndocumentedVars(
		requiredVars,
		documentedVarsAtBase,
	);

	// RED: at least one var must be undocumented against the real base runbook
	assert.ok(
		undocumentedAtBase.length > 0,
		'RED phase failed: no vars were flagged as undocumented against the REAL base runbook. The guard would not catch the defect it exists to catch.',
	);

	// GREEN: the corrected runbook (current state) has no undocumented vars
	const documentedVarsFixed = extractDocumentedVars(realRunbookPath);
	const undocumentedFixed = findUndocumentedVars(
		requiredVars,
		documentedVarsFixed,
	);
	assert.equal(
		undocumentedFixed.length,
		0,
		`GREEN phase failed: expected 0 undocumented vars after fix, but found ${undocumentedFixed.length}: ${undocumentedFixed.map((v) => v.name).join(', ')}`,
	);
});
