import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
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
// Test 1: Guard is RED today — PUBLIC_ORIGIN missing from runbook
// ---------------------------------------------------------------------------

test('RED proof: PUBLIC_ORIGIN is undocumented in the real runbook', () => {
	const root = path.dirname(fileURLToPath(import.meta.url));
	const repoRoot = path.resolve(root, '../../..');
	const runbookPath = path.join(
		repoRoot,
		'docs/deployment/first-deploy-runbook.md',
	);

	const requiredVars = collectRequiredVars(repoRoot);
	const documentedVars = extractDocumentedVars(runbookPath);
	const undocumented = findUndocumentedVars(requiredVars, documentedVars);

	// After fix: this test should now PASS (no undocumented vars).
	// Before fix: PUBLIC_ORIGIN would be in undocumented.
	console.log('Undocumented vars (should be empty after fix):', undocumented);
	assert.equal(
		undocumented.length,
		0,
		`Expected 0 undocumented vars after fix, but found ${undocumented.length}: ${undocumented.map((v) => v.name).join(', ')}`,
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
		/no GetRequiredString calls detected/,
	);
});

// ---------------------------------------------------------------------------
// Test 5: Runbook extraction
// ---------------------------------------------------------------------------

test('extractDocumentedVars: finds vars in §5a table and §5b block', () => {
	const dir = createFixture({
		'runbook.md':
			'# Deploy Runbook\n\n## 5. Env Vars\n\n### 5a. REQUIRED\n\n| Variable | Value |\n| -------- | ----- |\n| \`RELEASE_TAG\` | the tag |\n| \`POSTGRES_CONNECTION_STRING\` | the conn |\n\n### 5b. REQUIRED config\n\n\`\`\`\nSESSION_TOKEN_HEADER_KEY=X-Session-Token\nTENANT_ID_HEADER_KEY=X-Tenant-Id\n\`\`\`\n\n### 5c. OPTIONAL\n\nRATE_LIMIT, MAX_ROWS.\n',
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
			'# Deploy Runbook\n\n### 5a. REQUIRED\n\n| Variable | Value |\n| -------- | ----- |\n| \`REQUIRED_VAR\` | required |\n\n### 5b. REQUIRED config\n\n\`\`\`\nANOTHER_REQUIRED=1\n\`\`\`\n\n### 5c. OPTIONAL\n\n\`OPTIONAL_RATE_LIMIT\` (30), \`OPTIONAL_MAX_ROWS\` (5).\n',
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
			reason: 'GetRequiredString',
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
