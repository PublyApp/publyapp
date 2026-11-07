import { describe, expect, it } from 'vitest';

import { resolveDiffBase } from './ci-react-doctor-base.ts';

const zeroSha = '0'.repeat(40);

describe('ci-react-doctor-base', () => {
	it('maps each supported event to its base commit', () => {
		expect(
			resolveDiffBase({
				CI_EVENT_NAME: 'pull_request',
				CI_PR_BASE_SHA: 'pr-base',
			}),
		).toBe('pr-base');
		expect(
			resolveDiffBase({
				CI_EVENT_NAME: 'merge_group',
				CI_MERGE_GROUP_BASE_SHA: 'queue-base',
			}),
		).toBe('queue-base');
		expect(
			resolveDiffBase({ CI_EVENT_NAME: 'push', CI_PUSH_BEFORE: 'before' }),
		).toBe('before');
	});

	it('falls back to HEAD~1 only for a push with no usable before-SHA', () => {
		expect(resolveDiffBase({ CI_EVENT_NAME: 'push' })).toBe('HEAD~1');
		expect(resolveDiffBase({ CI_EVENT_NAME: 'push', CI_PUSH_BEFORE: '' })).toBe(
			'HEAD~1',
		);
		expect(
			resolveDiffBase({ CI_EVENT_NAME: 'push', CI_PUSH_BEFORE: zeroSha }),
		).toBe('HEAD~1');
	});

	it('refuses an event it does not know instead of guessing a base', () => {
		expect(resolveDiffBase({ CI_EVENT_NAME: 'schedule' })).toBeNull();
		expect(resolveDiffBase({})).toBeNull();
	});
});
