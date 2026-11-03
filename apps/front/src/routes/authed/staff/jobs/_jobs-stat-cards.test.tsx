/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import type {
	StaffDeadLetterRow,
	StaffJobQueueRow,
	StaffSystemJobDefinitionRow,
} from '~/lib/query/staff-jobs';

import { JobsStatCards } from './_jobs-stat-cards';

const t = (key: string, options?: Record<string, unknown>): string =>
	options ? `${key}:${Object.values(options).join(',')}` : key;

const queueRow = (
	id: string,
	status: string,
	attempts: number,
): StaffJobQueueRow => ({
	id,
	jobType: 'email.verify.v1',
	status,
	priority: 0,
	attempts,
	maxAttempts: 5,
	nextAttemptAt: null,
	lockedBy: null,
	lockedUntil: null,
	lastError: null,
	tenantId: null,
	createdAt: null,
	updatedAt: null,
});

const deadRow = (id: string, failedAt: Date): StaffDeadLetterRow => ({
	id,
	originalJobId: null,
	jobType: 'email.verify.v1',
	attempts: 5,
	lastError: null,
	externalStateStatus: null,
	triagedAt: null,
	failedAt,
	requeuedAsJobId: null,
	requeuedAt: null,
	tenantId: null,
});

const systemRow = (
	id: string,
	isEnabled: boolean,
): StaffSystemJobDefinitionRow => ({
	id,
	jobKey: 'session-cleanup',
	cronExpression: '0 0 3 * * ?',
	isEnabled,
	lastEnqueuedAt: null,
	updatedAt: null,
});

afterEach(() => {
	cleanup();
});

describe('JobsStatCards', () => {
	test('shows whole-collection figures when every list is complete', () => {
		render(
			<JobsStatCards
				t={t}
				overview={{
					queue: [
						queueRow('q1', 'processing', 2),
						queueRow('q2', 'pending', 1),
						queueRow('q3', 'pending', 0),
					],
					deadLetters: [deadRow('d1', new Date()), deadRow('d2', new Date())],
					systemJobs: [systemRow('s1', true), systemRow('s2', false)],
					counts: { queue: 3, deadLetters: 2, systemJobs: 2 },
				}}
			/>,
		);

		expect(screen.getByTestId('jobs-stat-queue').textContent).toContain('3');
		expect(screen.getByTestId('jobs-stat-queue').textContent).toContain(
			'jobs-stat-processing:1',
		);
		expect(screen.getByTestId('jobs-stat-queue').textContent).toContain(
			'jobs-stat-retrying:2',
		);
		expect(screen.getByTestId('jobs-stat-dead').textContent).toContain('2');
		expect(screen.getByTestId('jobs-stat-dead').textContent).toContain(
			'jobs-stat-dead-window:2',
		);
		expect(screen.getByTestId('jobs-stat-system').textContent).toContain('1');
		expect(screen.getByTestId('jobs-stat-system').textContent).toContain('/ 2');
	});

	test('shows « — » instead of a page-local sum when a list is incomplete', () => {
		render(
			<JobsStatCards
				t={t}
				overview={{
					queue: null,
					deadLetters: null,
					systemJobs: null,
					counts: { queue: null, deadLetters: null, systemJobs: null },
				}}
			/>,
		);

		expect(screen.getAllByText('—')).toHaveLength(6);
	});
});
