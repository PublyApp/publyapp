/**
 * @vitest-environment jsdom
 */
import { IconBuilding } from '@tabler/icons-react';
import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			let text = key;
			for (const [name, value] of Object.entries(options ?? {})) {
				text = text.replaceAll(`{{${name}}}`, String(value));
			}
			return text;
		},
	}),
}));

import { ListPage } from './list-page';
import type { ListColumn, ListFilter } from './list-types';

afterEach(() => {
	cleanup();
	document.getElementById('app-shell-page-panel')?.remove();
});

type Row = { id: string; name: string; members: number; status: string };

const rows: Row[] = [
	{ id: 'a', name: 'Acme', members: 12, status: 'active' },
	{ id: 'b', name: 'Globex', members: 3, status: 'pending' },
	{ id: 'c', name: 'Initech', members: 0, status: 'active' },
];

const columns: ListColumn<Row>[] = [
	{
		id: 'name',
		header: 'Organisation',
		icon: IconBuilding,
		width: 240,
		value: (row) => row.name,
		cell: (row) => <span>{row.name}</span>,
	},
	{
		id: 'members',
		header: 'Membres',
		icon: IconBuilding,
		width: 120,
		value: (row) => row.members,
		cell: (row) => <span>{row.members}</span>,
	},
];

const filters: ListFilter<Row>[] = [
	{
		key: 'status',
		label: 'Statuts',
		icon: IconBuilding,
		panel: true,
		choices: [
			{ value: 'active', label: 'Active' },
			{ value: 'pending', label: 'En attente' },
		],
		valueOf: (row) => row.status,
	},
];

const renderPage = (
	active: Record<string, string[]> = {},
	options: {
		countsKnown?: boolean;
		countRows?: Row[];
		totalsKnown?: boolean;
		inset?: boolean;
		q?: string;
		data?: Row[];
		isError?: boolean;
		error?: unknown;
		errorContent?: ReactNode;
		headerActions?: boolean;
	} = {},
) =>
	render(
		<>
			<div id="app-shell-page-panel" />
			<ListPage<Row>
				ariaLabel="Organisations"
				title="Organisations"
				searchPlaceholder="Rechercher"
				rows={options.data ?? rows}
				columns={columns}
				defaultColumns={['name', 'members']}
				lockedColumn="name"
				sorting={[]}
				onSortingChange={vi.fn()}
				q={options.q ?? ''}
				onSearch={vi.fn()}
				filters={filters}
				filtersValue={active}
				onFiltersChange={vi.fn()}
				countsKnown={options.countsKnown ?? true}
				countRows={options.countRows}
				totalsKnown={options.totalsKnown}
				inset={options.inset ? {} : undefined}
				totals={(visible) =>
					new Map([
						['name', `${visible.length} organisations`],
						['members', '15 membres'],
					])
				}
				onOpen={vi.fn()}
				openLabel={(row) => `Ouvrir ${row.name}`}
				mobileCard={(row) => ({ code: row.status, title: row.name })}
				cards={<div data-testid="stats" />}
				onExport={options.headerActions ? vi.fn() : undefined}
				newAction={
					options.headerActions
						? {
								label: 'Create profile',
								icon: IconBuilding,
								onSelect: vi.fn(),
							}
						: undefined
				}
				queryState={{
					isPending: false,
					isError: options.isError ?? false,
					error: options.error,
					onRetry: vi.fn(),
				}}
				errorContent={options.errorContent}
			/>
		</>,
	);

describe('ListPage', () => {
	test('filters the rows from the active filters and shows a chip', () => {
		renderPage({ status: ['active'] });

		expect(screen.getAllByText('Acme').length).toBeGreaterThan(0);
		expect(screen.getAllByText('Initech').length).toBeGreaterThan(0);
		expect(screen.queryByText('Globex')).toBeNull();
		expect(screen.getAllByText('list-filter-chip').length).toBe(1);
	});

	test('the side panel counts the rows per filter value', () => {
		renderPage();
		const panel = document.getElementById('app-shell-page-panel');
		if (!panel) {
			throw new Error('panel missing');
		}
		expect(within(panel).getByText('Statuts')).toBeTruthy();
		expect(within(panel).getByText('2')).toBeTruthy();
		expect(within(panel).getByText('1')).toBeTruthy();
	});

	test('the columns picker opens on the default set', () => {
		renderPage();
		fireEvent.click(screen.getByRole('button', { name: /list-columns/ }));
		expect(screen.getByText('list-columns-shown')).toBeTruthy();
		expect(screen.getByRole('checkbox', { name: 'Organisation' })).toBeTruthy();
	});

	test('totals are computed from the filtered rows', () => {
		renderPage({ status: ['active'] });
		const summary = screen.getByRole('table', { name: 'list-summary' });
		expect(within(summary).getByText('2 organisations')).toBeTruthy();
	});

	// The API narrows the page server-side; the counters come from the whole
	// collection (the team overview query) while the table shows the filtered
	// rows. Before the fix every counter and every total went « — » on a filter.
	test('a server-side filter keeps the whole-collection counters', () => {
		renderPage(
			{ status: ['active'] },
			{
				data: rows.filter((row) => row.status === 'active'),
				countRows: rows,
			},
		);
		const panel = document.getElementById('app-shell-page-panel');
		if (!panel) {
			throw new Error('panel missing');
		}
		expect(within(panel).getByText('Active')).toBeTruthy();
		expect(within(panel).getByText('En attente')).toBeTruthy();
		// 2 active + 1 pending over the whole collection, not 2 + 0 over the page.
		expect(within(panel).getAllByText('2')).toHaveLength(1);
		expect(within(panel).getAllByText('1')).toHaveLength(1);
		const summary = screen.getByRole('table', { name: 'list-summary' });
		expect(within(summary).getByText('2 organisations')).toBeTruthy();
	});

	// A filter does not make the totals unknown: the displayed page is the whole
	// filtered collection, so it sums it (the prototype's rule). Only an
	// incomplete page (cursor) dashes them.
	test('totals stay exact on a filter even when the counters are unknown', () => {
		renderPage(
			{ status: ['active'] },
			{
				data: rows.filter((row) => row.status === 'active'),
				countsKnown: false,
				totalsKnown: true,
			},
		);
		const summary = screen.getByRole('table', { name: 'list-summary' });
		expect(within(summary).getByText('2 organisations')).toBeTruthy();
		expect(within(summary).getByText('15 membres')).toBeTruthy();
	});

	test('the totals footer shows « — » when the collection is not fully known', () => {
		renderPage({}, { countsKnown: false });
		const summary = screen.getByRole('table', { name: 'list-summary' });
		expect(within(summary).queryByText('3 organisations')).toBeNull();
		expect(within(summary).queryByText('15 membres')).toBeNull();
		expect(within(summary).getAllByText('—')).toHaveLength(2);
	});

	test('the inset count pill shows the row count when the collection is known', () => {
		renderPage({}, { inset: true });
		const heading = screen.getByRole('heading', { name: /Organisations/ });
		expect(within(heading).getByText('3')).toBeTruthy();
	});

	test('the inset count pill shows « — » when the collection is not fully known', () => {
		renderPage({}, { countsKnown: false, inset: true });
		const heading = screen.getByRole('heading', { name: /Organisations/ });
		expect(within(heading).queryByText('3')).toBeNull();
		expect(within(heading).getByText('—')).toBeTruthy();
	});

	test('the statistics fold toggles', () => {
		renderPage();
		const toggle = screen.getByRole('button', { name: 'list-stats-collapse' });
		expect(toggle.getAttribute('aria-expanded')).toBe('true');
		fireEvent.click(toggle);
		expect(
			screen
				.getByRole('button', { name: 'list-stats-expand' })
				.getAttribute('aria-expanded'),
		).toBe('false');
	});

	// #2280: the list fills the height left by the page so the table scrolls
	// inside it and the pager stays reachable. `.publy-page-fill` is the
	// established bounded-height chain (flex h-full min-h-0 flex-col gap-4).
	test('the list page fills the remaining viewport height', () => {
		const { container } = renderPage();
		const root = container.querySelector('[data-list-page]');
		expect(root?.className).toContain('publy-page-fill');
	});

	// #2280: a search with no match is not a filter miss.
	test('a search with no match says so', () => {
		renderPage({}, { q: 'zzz', data: [] });
		expect(screen.getAllByText('list-no-match-title').length).toBeGreaterThan(
			0,
		);
		expect(screen.queryByText('list-empty')).toBeNull();
	});

	test('a filter with no match keeps the consumer filters text', () => {
		renderPage(
			{ status: ['pending'] },
			{ data: [{ id: 'a', name: 'Acme', members: 1, status: 'active' }] },
		);
		expect(screen.getAllByText('list-empty').length).toBeGreaterThan(0);
		expect(screen.queryByText('list-no-match-title')).toBeNull();
	});

	test('consumer error content replaces the generic error description', () => {
		renderPage(
			{},
			{
				isError: true,
				errorContent: <p>403 specific explanation</p>,
			},
		);

		expect(screen.getByText('403 specific explanation')).toBeTruthy();
		expect(screen.queryByText('list-error-default-description')).toBeNull();
		expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
	});

	// #2291 / review-tokens non-blocking note 5: the 403-no-retry and
	// 500-retry branches were wired but had no unit cover.
	test('a 403 renders the access-denied copy without a retry action', () => {
		renderPage(
			{},
			{
				isError: true,
				error: { status: 403, detail: 'Permission revoked.' },
			},
		);

		// Owner decision #2291: a 403 paints the translated copy, never the API's
		// English `detail`.
		expect(screen.getByText('no-access-title')).toBeTruthy();
		expect(screen.getByText('forbidden-description')).toBeTruthy();
		expect(screen.queryByText('Permission revoked.')).toBeNull();
		expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
	});

	test('hides the desktop header actions below md and keeps the stats toggle', () => {
		renderPage({}, { headerActions: true });

		const exportButton = screen.getByRole('button', { name: /list-export/ });
		expect(exportButton.className).toContain('max-md:hidden');
		const create = screen.getByRole('button', { name: 'Create profile' });
		expect(create.closest('span')?.className).toContain('max-md:hidden');
		// The statistics chevron is not an action: it stays in the header.
		expect(
			screen.getByRole('button', { name: /list-stats/ }).className,
		).not.toContain('max-md:hidden');
	});

	test('a 403 hides the page create/export chrome', () => {
		renderPage(
			{},
			{
				isError: true,
				headerActions: true,
				error: { status: 403, detail: 'Permission revoked.' },
			},
		);

		expect(screen.queryByRole('button', { name: 'Create profile' })).toBeNull();
		expect(screen.queryByRole('button', { name: /list-export/ })).toBeNull();
		// Exactly one action remains in the error body: the primary « Retour à
		// l'accueil »; a 403 offers no retry.
		const errorSurface = screen.getByTestId('list-error');
		expect(within(errorSurface).getAllByRole('link')).toHaveLength(1);
		expect(within(errorSurface).queryByRole('button')).toBeNull();
	});

	test('a 500 renders the unable-to-load copy with a retry action', () => {
		renderPage(
			{},
			{
				isError: true,
				error: { status: 500, detail: 'Trace id: abc' },
			},
		);

		expect(screen.getByText('error-500-title')).toBeTruthy();
		expect(screen.queryByText(/Trace id: abc/)).toBeNull();
		expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
	});
});
