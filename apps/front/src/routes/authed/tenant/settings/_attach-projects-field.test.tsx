/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	useTenantProjectsQuery: vi.fn(),
}));

vi.mock('~/lib/query/tenant-projects', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('~/lib/query/tenant-projects')>();
	return {
		...actual,
		useTenantProjectsQuery: mocks.useTenantProjectsQuery,
	};
});

vi.mock('react-i18next', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

import { AttachProjectsField } from './_attach-projects-field';

// A failed *refetch* keeps the last good data (TanStack v5 flips
// `status: 'error'` without clearing `data`); the widget must keep showing
// the project options instead of rendering an empty checklist.
const staleErrorQuery = {
	data: { items: [{ id: 'p1', name: 'Acme' }], nextCursor: null },
	error: { status: 503, title: 'Service Unavailable', detail: 'x' },
	isPending: false,
	isLoading: false,
	isFetching: false,
	isError: true,
};

const TestForm = () => {
	const methods = useForm({ defaultValues: { projectIds: [] } });

	return (
		<FormProvider {...methods}>
			<AttachProjectsField name="projectIds" tenantId="tenant-1" />
		</FormProvider>
	);
};

beforeEach(() => {
	mocks.useTenantProjectsQuery.mockReset();
});

afterEach(() => {
	cleanup();
});

describe('AttachProjectsField', () => {
	test('keeps the project options when a background refetch fails', () => {
		mocks.useTenantProjectsQuery.mockReturnValue(staleErrorQuery);

		render(<TestForm />);

		expect(screen.getByText('Acme')).toBeTruthy();
	});
});
