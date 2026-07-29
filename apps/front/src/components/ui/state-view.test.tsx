/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { StateView } from './state-view';

afterEach(cleanup);

describe('StateView', () => {
	test('honours testId on the page scale, not just inline', () => {
		render(
			<StateView
				icon={<span />}
				scale="page"
				title="Not found"
				testId="page-state"
			/>,
		);

		expect(screen.getByTestId('page-state')).toBeTruthy();
	});

	test('honours testId on the inline scale', () => {
		render(
			<StateView
				icon={<span />}
				scale="inline"
				title="No results"
				testId="inline-state"
			/>,
		);

		expect(screen.getByTestId('inline-state')).toBeTruthy();
	});
});
