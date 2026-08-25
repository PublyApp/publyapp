import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

// #1337: the duplicated `createServerFn` stub in this folder originally
// routed payloads through a single, non-chained `as never` assertion — a
// shape that slips past anti-slop rungs 4+5. The stub now mirrors the
// production builder's generics: each `createServerFn()` call gets its own
// chain closure and the validated-output type flows through them, so no
// cast is needed at all. This guard keeps every escape hatch (`as never`,
// `as unknown`, `as any`) out of both files that share the stub. The
// repo-wide ban is the enforced rule `publy/no-never-any-casts`,
// measured in docs/guides/lint-rules.md.
const SERVER_FN_STUB_FILES = [
	'auth-actions.test.ts',
	'invitation-actions.test.ts',
] as const;

describe('createServerFn test stubs stay free of escape-hatch casts', () => {
	for (const fileName of SERVER_FN_STUB_FILES) {
		test(`${fileName} routes payloads through the stub without an escape-hatch cast`, async () => {
			const filePath = path.resolve(
				fileURLToPath(new URL('.', import.meta.url)),
				fileName,
			);
			const source = await readFile(filePath, 'utf8');
			const offendingLines = source
				.split('\n')
				.map((line, index) => ({ line, number: index + 1 }))
				.filter(({ line }) => /\bas\s+(never|any|unknown)\b/.test(line))
				.map(({ number, line }) => `${number}: ${line.trim()}`);

			expect(offendingLines).toEqual([]);
		});
	}
});
