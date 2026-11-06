import { expect, test } from 'vitest';

import { findProtectedTarget } from './git-pre-push.ts';

const line = (remoteRef: string) => `refs/heads/x abc123 ${remoteRef} def456\n`;

test('blocks main and develop, including deletions', () => {
	expect(findProtectedTarget(line('refs/heads/main'))).toBe('refs/heads/main');
	expect(
		findProtectedTarget(line('refs/heads/feat/a') + line('refs/heads/develop')),
	).toBe('refs/heads/develop');
	expect(findProtectedTarget('(delete) 000 refs/heads/main 111\n')).toBe(
		'refs/heads/main',
	);
});

test('lets other branches through, no partial matches', () => {
	expect(findProtectedTarget(line('refs/heads/maintain'))).toBeUndefined();
	expect(findProtectedTarget('')).toBeUndefined();
});
