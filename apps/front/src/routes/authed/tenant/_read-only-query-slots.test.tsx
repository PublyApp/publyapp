/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { TenantReadOnlyCardError } from './_read-only-query-slots';

vi.mock('react-i18next', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

describe('TenantReadOnlyCardError', () => {
	test('invokes a direct retry callback without fabricating a query result', () => {
		const onRetry = vi.fn();

		render(
			<TenantReadOnlyCardError
				onRetry={onRetry}
				titleKey="common:title"
				descriptionKey="common:description"
			/>,
		);

		fireEvent.click(screen.getByRole('button', { name: 'common:retry' }));

		expect(onRetry).toHaveBeenCalledOnce();
	});
});
