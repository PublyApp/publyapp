/**
 * @vitest-environment jsdom
 */
import { cleanup, render, within } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { ListFilterPanel, type ListPanelEntry } from './filter-panel';

afterEach(() => {
	cleanup();
	document.getElementById('filter-panel-test-target')?.remove();
});

const entry = (key: string, count: number | null): ListPanelEntry => ({
	key,
	label: key,
	icon: <span />,
	count,
	active: false,
	onClick: () => undefined,
});

describe('ListFilterPanel counters', () => {
	// The owner decision of 04/11: a known zero is a figure, not a missing
	// value. Only an unknown count (the API offers no facet) is « — ».
	test('renders a known 0 as "0" and an unknown count as « — »', () => {
		render(
			<>
				<div id="filter-panel-test-target" />
				<ListFilterPanel
					targetId="filter-panel-test-target"
					groups={[
						{
							key: 'status',
							title: 'Status',
							entries: [entry('zero', 0), entry('unknown', null)],
						},
					]}
				/>
			</>,
		);

		const panel = document.getElementById('filter-panel-test-target');
		if (!panel) {
			throw new Error('panel target missing');
		}
		expect(within(panel).getByText('0')).toBeTruthy();
		expect(within(panel).getByText('—')).toBeTruthy();
	});
});
