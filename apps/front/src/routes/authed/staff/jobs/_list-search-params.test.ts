import { describe, expect, test } from 'vitest';

import {
	buildStaffJobsCursorResetKey,
	parseStaffJobsListSearchParams,
	serializeStaffJobsListSearchParams,
} from './_list-search-params';

describe('staff jobs URL filters', () => {
	test('parses multi-value filters in vocabulary order and rejects junk', () => {
		const parsed = parseStaffJobsListSearchParams({
			status: 'processing, pending, nope',
			family: 'maintenance,publishing',
			state: 'triaged,open',
			retry: 'first,retry',
			is_enabled: 'false,true,maybe',
		});

		expect(parsed.status).toBe('pending,processing');
		expect(parsed.family).toBe('publishing,maintenance');
		expect(parsed.state).toBe('open,triaged');
		expect(parsed.retry).toBe('retry,first');
		expect(parsed.isEnabled).toBe('true,false');
	});

	test('serializes filters back to the snake_case wire shape', () => {
		const parsed = parseStaffJobsListSearchParams({
			q: '  SMTP  ',
			status: 'pending',
			family: 'email',
			state: 'open',
			retry: 'retry',
			is_enabled: 'true',
			external_state_status: '6',
		});
		const wire = serializeStaffJobsListSearchParams(parsed);

		expect(wire).toEqual({
			q: 'SMTP',
			status: 'pending',
			external_state_status: '6',
			is_enabled: 'true',
			job_type: undefined,
			tenant_id: undefined,
			family: 'email',
			state: 'open',
			retry: 'retry',
			cursor: undefined,
			size: undefined,
			sort_id: undefined,
			sort_order: undefined,
		});
	});

	test('the cursor reset key changes when any filter changes', () => {
		const base = parseStaffJobsListSearchParams({ status: 'pending' });
		const changed = parseStaffJobsListSearchParams({ status: 'processing' });

		expect(buildStaffJobsCursorResetKey(base)).not.toBe(
			buildStaffJobsCursorResetKey(changed),
		);
	});
});
