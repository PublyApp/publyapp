/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

const limits = (maxImages: number, types: string[]) => ({
	textLimits: [{ unit: 'graphemes', max: 100 * maxImages }],
	maxImages,
	maxImageBytes: maxImages * 1000,
	acceptedImageContentTypes: types,
});

const TARGETS = [
	{
		id: 'a',
		label: 'Wide',
		provider: 'x',
		limits: limits(4, ['image/png', 'image/jpeg']),
	},
	{
		id: 'b',
		label: 'Narrow',
		provider: 'x',
		limits: limits(2, ['image/png']),
	},
];

vi.mock('~/lib/query/tenant-publish-targets', () => ({
	useTenantPublishTargetsQuery: () => ({ data: 'wire' }),
	toTenantPublishTargets: () => TARGETS,
}));

vi.mock('~/lib/query/tenants-for-picker', () => ({
	useResolvedWorkspaceTenantId: () => 'tenant',
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { usePublishSelection } from './_use-publish-selection';

describe('usePublishSelection', () => {
	test('selects every target and shares the strictest image limits', () => {
		const { result } = renderHook(() => usePublishSelection(null));

		expect(result.current.selectedIds).toEqual(['a', 'b']);
		expect(result.current.imageLimits).toEqual({
			maxImages: 2,
			maxImageBytes: 2000,
			acceptedImageContentTypes: ['image/png'],
		});
	});

	test('counters and image caps follow the unchecked targets', () => {
		const { result } = renderHook(() => usePublishSelection(null));

		act(() => result.current.toggle('b', false));

		expect(result.current.destinations.map((d) => d.label)).toEqual(['Wide']);
		expect(result.current.imageLimits?.maxImages).toBe(4);

		act(() => result.current.toggle('a', false));

		expect(result.current.destinations).toEqual([]);
		expect(result.current.imageLimits).toBeNull();
	});
});
