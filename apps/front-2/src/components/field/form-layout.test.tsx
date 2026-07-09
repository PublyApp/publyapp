/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { FormActionBar, FormPageLayout } from './form-layout';

afterEach(cleanup);

describe('FormPageLayout', () => {
	test('centers content at the 860px handoff width by default', () => {
		render(
			<FormPageLayout>
				<p>Form content</p>
			</FormPageLayout>,
		);

		const layout = document.querySelector('[data-slot="form-page"]');
		expect(layout).not.toBeNull();
		expect(layout?.getAttribute('data-width')).toBe('860');
		expect(layout?.className).toContain('publy-form-page');
		expect(screen.getByText('Form content')).toBeTruthy();
	});

	test('supports the narrow 760px account variant', () => {
		render(
			<FormPageLayout width={760}>
				<p>Profile form</p>
			</FormPageLayout>,
		);

		expect(
			document
				.querySelector('[data-slot="form-page"]')
				?.getAttribute('data-width'),
		).toBe('760');
	});
});

describe('FormActionBar', () => {
	test('renders a sticky action bar with status and trailing actions', () => {
		render(
			<FormActionBar status="Unsaved changes">
				<button type="button">Cancel</button>
				<button type="submit">Save changes</button>
			</FormActionBar>,
		);

		const bar = document.querySelector('[data-slot="form-action-bar"]');
		expect(bar).not.toBeNull();
		expect(bar?.className).toContain('publy-form-action-bar');
		expect(screen.getByText('Unsaved changes')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
	});

	test('omits the status slot when no status is provided', () => {
		render(
			<FormActionBar>
				<button type="submit">Create tenant</button>
			</FormActionBar>,
		);

		expect(
			document.querySelector('[data-slot="form-action-bar-status"]'),
		).toBeNull();
	});
});
