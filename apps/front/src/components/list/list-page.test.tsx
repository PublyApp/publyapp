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

import type { QueryDisplayQuery } from '~/components/query-display';

import { ListPage } from './list-page';
import type { ListColumn, ListFilter } from './list-types';

afterEach(() => {
	cleanup();
	document.getElementById('app-shell-page-panel')?.remove();
});

type Row = { id: string; name: string; members: number; status: string };

/** The `query` prop: `ListPage` only reads its state flags and `refetch`. */
const fakeQuery = (
	overrides: Partial<QueryDisplayQuery> = {},
): QueryDisplayQuery => ({
	isPending: false,
	isLoading: false,
	isFetching: false,
	isError: false,
	error: null,
	data: undefined,
	refetch: vi.fn(),
	...overrides,
});

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
		isPending?: boolean;
		isError?: boolean;
		error?: unknown;
		errorContent?: ReactNode;
		headerActions?: boolean;
		filters?: ListFilter<Row>[];
	} = {},
) =>
	render(
		<>
			<div id="app-shell-page-panel" />
			<ListPage<Row>
				testId="list"
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
				filters={options.filters ?? filters}
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
								label: 'Create role',
								icon: IconBuilding,
								onSelect: vi.fn(),
							}
						: undefined
				}
				query={fakeQuery({
					isPending: options.isPending ?? false,
					isError: options.isError ?? false,
					// The tests hand plain problem payloads, not Error instances.
					error: (options.error ?? null) as Error | null,
				})}
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

	// A filter the API applies (by a value the rows do not carry, e.g. a role id)
	// must never be re-applied in memory: the page is already the filtered slice.
	test('a serverSide filter keeps every row the API returned', () => {
		const roleFilter: ListFilter<Row> = {
			key: 'role',
			label: 'Rôle',
			icon: IconBuilding,
			choices: [{ value: 'role-id-1', label: 'Writer' }],
			// The rows hold no role id: an in-memory match would drop them all.
			valueOf: () => [],
			serverSide: true,
		};
		renderPage({ role: ['role-id-1'] }, { filters: [roleFilter] });

		expect(screen.getAllByText('Acme').length).toBeGreaterThan(0);
		expect(screen.getAllByText('Globex').length).toBeGreaterThan(0);
		expect(screen.getAllByText('Initech').length).toBeGreaterThan(0);
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
		const create = screen.getByRole('button', { name: 'Create role' });
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

		expect(screen.queryByRole('button', { name: 'Create role' })).toBeNull();
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

// #2341: the four states are rendered through `QueryDisplay` now; the pending
// state is asserted structurally — header, row count and per-row cells — rather
// than by snapshot: the table skeleton's pill shapes carry circular radii the
// design-system source scanner forbids in source.
describe('ListPage state DOM', () => {
	test('pending', () => {
		renderPage({}, { isPending: true });

		const loading = screen.getByTestId('list-loading');
		expect(loading.querySelector('.publy-table-skeleton-header')).toBeTruthy();
		expect(loading.getAttribute('data-row-height')).toBe('48');
		expect(loading.querySelectorAll('.publy-table-skeleton-row')).toHaveLength(
			7,
		);
		// Each skeleton row mirrors a loaded row: a tile and four bars.
		for (const row of loading.querySelectorAll('.publy-table-skeleton-row')) {
			expect(row.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(5);
		}
	});

	test('error', () => {
		renderPage({}, { isError: true, error: { status: 500 } });

		expect(screen.getByTestId('list-error')).toMatchInlineSnapshot(`
			<div
			  aria-live="assertive"
			  class="publy-state-surface mx-auto w-full max-w-sm"
			  data-presentation="status"
			  data-testid="list-error"
			  data-tone="danger"
			  role="alert"
			>
			  <div
			    aria-hidden="true"
			    class="publy-state-icon-cluster"
			    data-presentation="status"
			    data-scale="inline"
			    data-tone="danger"
			  >
			    <svg
			      aria-hidden="true"
			      class="absolute inset-0 size-36"
			      viewBox="0 0 144 144"
			    >
			      <circle
			        class="publy-status-ring"
			        cx="72"
			        cy="72"
			        r="71.5"
			      />
			      <circle
			        class="publy-status-ring publy-status-ring--inner"
			        cx="72"
			        cy="72"
			        r="55.5"
			      />
			    </svg>
			    <div
			      class="publy-state-icon"
			      data-presentation="status"
			      data-tone="danger"
			    >
			      <svg
			        aria-hidden="true"
			        class="tabler-icon tabler-icon-server-off"
			        fill="none"
			        height="24"
			        stroke="currentColor"
			        stroke-linecap="round"
			        stroke-linejoin="round"
			        stroke-width="2"
			        viewBox="0 0 24 24"
			        width="24"
			        xmlns="http://www.w3.org/2000/svg"
			      >
			        <path
			          d="M12 12h-6a3 3 0 0 1 -3 -3v-2c0 -1.083 .574 -2.033 1.435 -2.56m3.565 -.44h10a3 3 0 0 1 3 3v2a3 3 0 0 1 -3 3h-2"
			        />
			        <path
			          d="M16 12h2a3 3 0 0 1 3 3v2m-1.448 2.568a2.986 2.986 0 0 1 -1.552 .432h-12a3 3 0 0 1 -3 -3v-2a3 3 0 0 1 3 -3h6"
			        />
			        <path
			          d="M7 8v.01"
			        />
			        <path
			          d="M7 16v.01"
			        />
			        <path
			          d="M3 3l18 18"
			        />
			      </svg>
			    </div>
			  </div>
			  <div>
			    <div
			      class="font-semibold text-balance mt-4 text-xl focus:outline-none"
			    >
			      error-500-title
			    </div>
			    <p
			      class="mt-2 max-w-[380px] text-sm leading-normal text-pretty text-muted-foreground"
			    >
			      error-500-description
			    </p>
			  </div>
			  <div
			    class="mt-6 flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:justify-center"
			  >
			    <button
			      class="group/button inline-flex shrink-0 cursor-pointer items-center justify-center border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 aria-invalid:focus-visible:border-ring aria-invalid:focus-visible:ring-ring dark:aria-invalid:focus-visible:ring-ring [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 btn-primary-chrome bg-primary text-primary-foreground hover:bg-primary/80 gap-1.5 rounded-[var(--publy-radius-control)] has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 h-11 px-4"
			      data-slot="button"
			      tabindex="0"
			      type="button"
			    >
			      <svg
			        class="tabler-icon tabler-icon-refresh"
			        data-icon="inline-start"
			        fill="none"
			        height="24"
			        stroke="currentColor"
			        stroke-linecap="round"
			        stroke-linejoin="round"
			        stroke-width="2"
			        viewBox="0 0 24 24"
			        width="24"
			        xmlns="http://www.w3.org/2000/svg"
			      >
			        <path
			          d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4"
			        />
			        <path
			          d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"
			        />
			      </svg>
			      common:retry
			    </button>
			    <a
			      aria-label="common:go-to-home"
			      class="group/button inline-flex shrink-0 cursor-pointer items-center justify-center border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 aria-invalid:focus-visible:border-ring aria-invalid:focus-visible:ring-ring dark:aria-invalid:focus-visible:ring-ring [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 bg-background shadow-[var(--effect-raised-control)] hover:bg-[color-mix(in_oklch,var(--background),var(--foreground)_5%)] hover:text-foreground gap-1.5 rounded-[var(--publy-radius-control)] has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 h-11 px-4"
			      data-slot="button"
			      href="/"
			      tabindex="0"
			      type="button"
			    >
			      <svg
			        class="tabler-icon tabler-icon-arrow-left"
			        data-icon="inline-start"
			        fill="none"
			        height="24"
			        stroke="currentColor"
			        stroke-linecap="round"
			        stroke-linejoin="round"
			        stroke-width="2"
			        viewBox="0 0 24 24"
			        width="24"
			        xmlns="http://www.w3.org/2000/svg"
			      >
			        <path
			          d="M5 12l14 0"
			        />
			        <path
			          d="M5 12l6 6"
			        />
			        <path
			          d="M5 12l6 -6"
			        />
			      </svg>
			      common:go-to-home
			    </a>
			  </div>
			</div>
		`);
	});

	test('empty', () => {
		renderPage({}, { data: [] });

		expect(screen.getByTestId('list-empty')).toMatchInlineSnapshot(`
			<div
			  class="publy-state-surface mx-auto w-full max-w-sm"
			  data-presentation="empty"
			  data-testid="list-empty"
			  data-tone="neutral"
			  role="status"
			>
			  <div
			    aria-hidden="true"
			    class="publy-state-icon-cluster"
			    data-presentation="empty"
			    data-scale="inline"
			    data-tone="neutral"
			  >
			    <svg
			      aria-hidden="true"
			      class="absolute inset-0 size-[120px]"
			      viewBox="0 0 120 120"
			    >
			      <circle
			        class="publy-empty-ring"
			        cx="60"
			        cy="60"
			        r="59.5"
			      />
			      <circle
			        class="publy-empty-ring publy-empty-ring--inner"
			        cx="60"
			        cy="60"
			        r="45.5"
			      />
			    </svg>
			    <div
			      class="publy-state-icon"
			      data-presentation="empty"
			      data-tone="neutral"
			    >
			      <svg
			        aria-hidden="true"
			        class="tabler-icon tabler-icon-inbox"
			        fill="none"
			        height="24"
			        stroke="currentColor"
			        stroke-linecap="round"
			        stroke-linejoin="round"
			        stroke-width="2"
			        viewBox="0 0 24 24"
			        width="24"
			        xmlns="http://www.w3.org/2000/svg"
			      >
			        <path
			          d="M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12"
			        />
			        <path
			          d="M4 13h3l3 3h4l3 -3h3"
			        />
			      </svg>
			    </div>
			  </div>
			  <div>
			    <div
			      class="font-semibold text-balance mt-3 text-lg"
			    >
			      list-empty-title
			    </div>
			    <p
			      class="mt-2 max-w-[380px] text-sm leading-normal text-pretty text-muted-foreground"
			    >
			      list-empty
			    </p>
			  </div>
			</div>
		`);
	});

	test('data', () => {
		renderPage();

		expect(screen.getByTestId('list-rows')).toMatchInlineSnapshot(`
			<div
			  class="min-h-0 flex-1 overflow-auto [container-type:inline-size]"
			  data-testid="list-rows"
			>
			  <table
			    class="w-full table-fixed border-separate border-spacing-0 text-sm [&:has(tr[data-spacer])]:h-full"
			    style="min-width: 360px;"
			  >
			    <colgroup>
			      <col
			        style="width: 240px;"
			      />
			      <col
			        style="width: 120px;"
			      />
			    </colgroup>
			    <tbody>
			      <tr
			        class="group/row h-12 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring/50"
			        data-slot="table-row"
			        tabindex="0"
			      >
			        <td
			          class="truncate border-r border-b bg-background px-2 last:border-r-0 group-hover/row:bg-card group-focus-visible/row:bg-card sticky left-0 z-(--publy-z-sticky-cell)"
			          data-slot="table-cell"
			        >
			          <div
			            class="flex min-w-0 items-center justify-between gap-1"
			          >
			            <div
			              class="flex min-w-0 items-center gap-2"
			            >
			              <span
			                class="min-w-0 truncate whitespace-nowrap"
			              >
			                <span>
			                  Acme
			                </span>
			              </span>
			            </div>
			            <button
			              aria-label="Ouvrir Acme"
			              class="group/button inline-flex cursor-pointer items-center justify-center border border-transparent bg-clip-padding font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 aria-invalid:focus-visible:border-ring aria-invalid:focus-visible:ring-ring dark:aria-invalid:focus-visible:ring-ring [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 bg-background shadow-[var(--effect-raised-control)] hover:bg-[color-mix(in_oklch,var(--background),var(--foreground)_5%)] has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 h-7 shrink-0 gap-1 rounded-[var(--publy-radius-control)] px-2.5 text-xs text-muted-foreground opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 hover:text-foreground [&_svg]:size-3.5"
			              data-slot="button"
			              tabindex="0"
			              type="button"
			            >
			              <svg
			                aria-hidden="true"
			                class="tabler-icon tabler-icon-external-link size-3.5"
			                fill="none"
			                height="24"
			                stroke="currentColor"
			                stroke-linecap="round"
			                stroke-linejoin="round"
			                stroke-width="2"
			                viewBox="0 0 24 24"
			                width="24"
			                xmlns="http://www.w3.org/2000/svg"
			              >
			                <path
			                  d="M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6"
			                />
			                <path
			                  d="M11 13l9 -9"
			                />
			                <path
			                  d="M15 4h5v5"
			                />
			              </svg>
			              list-open
			            </button>
			          </div>
			        </td>
			        <td
			          class="truncate border-r border-b bg-background px-2 last:border-r-0 group-hover/row:bg-card group-focus-visible/row:bg-card"
			          data-slot="table-cell"
			        >
			          <span>
			            12
			          </span>
			        </td>
			      </tr>
			      <tr
			        class="group/row h-12 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring/50"
			        data-slot="table-row"
			        tabindex="0"
			      >
			        <td
			          class="truncate border-r border-b bg-background px-2 last:border-r-0 group-hover/row:bg-card group-focus-visible/row:bg-card sticky left-0 z-(--publy-z-sticky-cell)"
			          data-slot="table-cell"
			        >
			          <div
			            class="flex min-w-0 items-center justify-between gap-1"
			          >
			            <div
			              class="flex min-w-0 items-center gap-2"
			            >
			              <span
			                class="min-w-0 truncate whitespace-nowrap"
			              >
			                <span>
			                  Globex
			                </span>
			              </span>
			            </div>
			            <button
			              aria-label="Ouvrir Globex"
			              class="group/button inline-flex cursor-pointer items-center justify-center border border-transparent bg-clip-padding font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 aria-invalid:focus-visible:border-ring aria-invalid:focus-visible:ring-ring dark:aria-invalid:focus-visible:ring-ring [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 bg-background shadow-[var(--effect-raised-control)] hover:bg-[color-mix(in_oklch,var(--background),var(--foreground)_5%)] has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 h-7 shrink-0 gap-1 rounded-[var(--publy-radius-control)] px-2.5 text-xs text-muted-foreground opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 hover:text-foreground [&_svg]:size-3.5"
			              data-slot="button"
			              tabindex="0"
			              type="button"
			            >
			              <svg
			                aria-hidden="true"
			                class="tabler-icon tabler-icon-external-link size-3.5"
			                fill="none"
			                height="24"
			                stroke="currentColor"
			                stroke-linecap="round"
			                stroke-linejoin="round"
			                stroke-width="2"
			                viewBox="0 0 24 24"
			                width="24"
			                xmlns="http://www.w3.org/2000/svg"
			              >
			                <path
			                  d="M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6"
			                />
			                <path
			                  d="M11 13l9 -9"
			                />
			                <path
			                  d="M15 4h5v5"
			                />
			              </svg>
			              list-open
			            </button>
			          </div>
			        </td>
			        <td
			          class="truncate border-r border-b bg-background px-2 last:border-r-0 group-hover/row:bg-card group-focus-visible/row:bg-card"
			          data-slot="table-cell"
			        >
			          <span>
			            3
			          </span>
			        </td>
			      </tr>
			      <tr
			        class="group/row h-12 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring/50"
			        data-slot="table-row"
			        tabindex="0"
			      >
			        <td
			          class="truncate border-r border-b bg-background px-2 last:border-r-0 group-hover/row:bg-card group-focus-visible/row:bg-card sticky left-0 z-(--publy-z-sticky-cell)"
			          data-slot="table-cell"
			        >
			          <div
			            class="flex min-w-0 items-center justify-between gap-1"
			          >
			            <div
			              class="flex min-w-0 items-center gap-2"
			            >
			              <span
			                class="min-w-0 truncate whitespace-nowrap"
			              >
			                <span>
			                  Initech
			                </span>
			              </span>
			            </div>
			            <button
			              aria-label="Ouvrir Initech"
			              class="group/button inline-flex cursor-pointer items-center justify-center border border-transparent bg-clip-padding font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 aria-invalid:focus-visible:border-ring aria-invalid:focus-visible:ring-ring dark:aria-invalid:focus-visible:ring-ring [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 bg-background shadow-[var(--effect-raised-control)] hover:bg-[color-mix(in_oklch,var(--background),var(--foreground)_5%)] has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 h-7 shrink-0 gap-1 rounded-[var(--publy-radius-control)] px-2.5 text-xs text-muted-foreground opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 hover:text-foreground [&_svg]:size-3.5"
			              data-slot="button"
			              tabindex="0"
			              type="button"
			            >
			              <svg
			                aria-hidden="true"
			                class="tabler-icon tabler-icon-external-link size-3.5"
			                fill="none"
			                height="24"
			                stroke="currentColor"
			                stroke-linecap="round"
			                stroke-linejoin="round"
			                stroke-width="2"
			                viewBox="0 0 24 24"
			                width="24"
			                xmlns="http://www.w3.org/2000/svg"
			              >
			                <path
			                  d="M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6"
			                />
			                <path
			                  d="M11 13l9 -9"
			                />
			                <path
			                  d="M15 4h5v5"
			                />
			              </svg>
			              list-open
			            </button>
			          </div>
			        </td>
			        <td
			          class="truncate border-r border-b bg-background px-2 last:border-r-0 group-hover/row:bg-card group-focus-visible/row:bg-card"
			          data-slot="table-cell"
			        >
			          <span>
			            0
			          </span>
			        </td>
			      </tr>
			      <tr
			        aria-hidden="true"
			        data-spacer=""
			      >
			        <td
			          class="border-r bg-background p-0 last:border-r-0 sticky left-0 z-(--publy-z-sticky-cell)"
			        />
			        <td
			          class="border-r bg-background p-0 last:border-r-0"
			        />
			      </tr>
			    </tbody>
			  </table>
			</div>
		`);
	});
});
