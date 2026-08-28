/**
 * Issue #1562, item 1 — the card-grid footer must count the CARDS on screen,
 * not the page size.
 *
 * Why a wiring test and not a footer test. `data-table-range-label.test.tsx`
 * already pins the footer's own behaviour on a partial last page. What was
 * broken here was the CALL SITE: `_profiles-list-body.tsx` omitted
 * `pageRowCount`, so the footer fell back to `?? size` and the label read
 * "1–10" above three cards. A footer test could never have caught that.
 *
 * The prop is now required, so the original omission no longer compiles — that
 * type change is the primary net (see the PR for the paired tsc proof). This
 * spec is the second net, and it pins something the type cannot: that the value
 * handed over is the RENDERED ROW COUNT and not some other number that also
 * type-checks (`size`, a total, a constant).
 *
 * Adversarial mutation, the one #1562 named rather than the easy one: keep the
 * prop and pass `controller.size` instead of `rows.length`. It compiles, the
 * type stays satisfied, and this spec goes red.
 *
 * Assertions run against the REAL shipped bundles through the production init
 * helper, never a synthetic `t()` — same rule as the sibling range test.
 */
/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { i18n as I18nInstance } from 'i18next';
import { createElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, expect, test, vi } from 'vitest';
import type { UseRowSelectionResult } from '~/components/table/use-row-selection';
import type { UseTableControllerResult } from '~/components/table/use-table-controller';
import resourceEN from '~/i18n/locales/en/common.json';
import resourceFR from '~/i18n/locales/fr/common.json';
import { createI18nFromResources } from '~/lib/i18n.shared';
import type { StaffTenantProfileRow } from '~/lib/query/staff-tenant-profiles';

// The cards themselves pull in `<Link>`, which needs a router context this
// spec has no business standing up: what is under test is the FOOTER wiring,
// not card rendering. `ProfilesListBody`, `DataTableCursorFooter` and the real
// locale bundles all stay real — only the unrelated child is stubbed.
vi.mock('./_profile-card', () => ({
	ProfileCard: ({ profile }: { profile: { id: string; name: string } }) =>
		createElement('div', { 'data-testid': `card-${profile.id}` }, profile.name),
	ProfileCardGridSkeleton: () => createElement('div'),
}));

import { ProfilesListBody } from './_profiles-list-body';

afterEach(cleanup);

const PAGE_SIZE = 10;
const RENDERED_CARDS = 3;

/** A partial last page: three cards under a page size of ten. */
const rows: StaffTenantProfileRow[] = Array.from(
	{ length: RENDERED_CARDS },
	(_, index) => ({
		id: `profile-${index + 1}`,
		name: `Profile ${index + 1}`,
		description: null,
		isDefault: false,
		userAccountCount: 0,
		permissionsCount: 0,
	}),
);

const controller: UseTableControllerResult = {
	sort: { id: 'name', order: 'asc' },
	onSortChange: () => {},
	size: PAGE_SIZE,
	onSizeChange: () => {},
	search: {
		draft: '',
		committed: undefined,
		onDraftChange: () => {},
		resetDraftToCommitted: () => {},
	},
	cursor: {
		pageIndex: 0,
		hasPreviousPage: false,
		onNextPage: () => {},
		onPreviousPage: () => {},
	},
	apiVariables: {
		sortId: 'name',
		sortOrder: 'asc',
		cursor: undefined,
		size: PAGE_SIZE,
	},
};

const selection: UseRowSelectionResult = {
	rowSelection: {},
	selectedKeys: new Set<string>(),
	selectedCount: 0,
	isSelectionMode: false,
	onSelectionChange: () => {},
	clearSelection: () => {},
};

const renderCardGrid = (i18n: I18nInstance): void => {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	render(
		createElement(
			QueryClientProvider,
			{ client: queryClient },
			createElement(
				I18nextProvider,
				{ i18n },
				createElement(ProfilesListBody, {
					testId: 'tenant-profiles',
					tenantId: 'tenant-1',
					view: 'cards',
					columns: [],
					rows,
					controller,
					selection,
					bodyState: 'rows',
					queryState: {
						hasActiveSearch: false,
						isPending: false,
						isError: false,
						isFetching: false,
					},
					nextCursor: null,
					onRetry: () => {},
					onEditRequest: () => {},
					onDeleteRequest: () => {},
					onToggleCardSelection: () => {},
					toolbarEnd: null,
				}),
			),
		),
	);
};

test('card grid: the range upper bound is the rendered card count, not the page size', () => {
	const i18n = createI18nFromResources('en', ['common'], {
		en: { common: resourceEN },
	});
	renderCardGrid(i18n);

	// Three cards on screen under a page size of ten: the honest bound is 3.
	// Before #1562 the footer defaulted to `?? size` and this read "1–10".
	expect(screen.getByText(`1–${RENDERED_CARDS}`)).toBeTruthy();
	expect(screen.queryByText(`1–${PAGE_SIZE}`)).toBeNull();
});

test('card grid: the honest bound holds in French too', () => {
	const i18n = createI18nFromResources('fr', ['common'], {
		fr: { common: resourceFR },
	});
	renderCardGrid(i18n);

	expect(screen.getByText(`1–${RENDERED_CARDS}`)).toBeTruthy();
	expect(screen.queryByText(`1–${PAGE_SIZE}`)).toBeNull();
});
