/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { JobsStatCards } from './_jobs-stat-cards';

const t = (key: string, options?: Record<string, unknown>): string =>
	options ? `${key}:${Object.values(options).join(',')}` : key;

afterEach(() => {
	cleanup();
});

describe('JobsStatCards', () => {
	test('shows the API whole-collection counts', () => {
		render(
			<JobsStatCards
				t={t}
				overview={{
					counts: { queue: 3, deadLetters: 2, systemJobs: 2 },
					queueCounts: {
						total: 3,
						pending: 2,
						processing: 1,
						retrying: 2,
					},
					deadLetterCounts: {
						total: 2,
						open: 2,
						triaged: 0,
						requeued: 0,
						recent: 2,
					},
					systemJobCounts: { total: 2, enabled: 1, disabled: 1 },
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

	test('shows « — » only when the API has not provided counts', () => {
		render(
			<JobsStatCards
				t={t}
				overview={{
					counts: { queue: null, deadLetters: null, systemJobs: null },
					queueCounts: null,
					deadLetterCounts: null,
					systemJobCounts: null,
				}}
			/>,
		);

		expect(screen.getAllByText('—')).toHaveLength(6);
	});
});
