import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import type { ColumnDef } from '~/components/table/column-type';
import { DataTable } from '~/components/table/data-table';
import type { SortState } from '~/components/table/sort-descriptor';
import type { UseRowSelectionResult } from '~/components/table/use-row-selection';
import type { SupportedNamespace } from '~/lib/i18n.namespaces';
import type { I18nResources, SupportedLanguage } from '~/lib/i18n.shared';
import { createI18nFromResources } from '~/lib/i18n.shared';

/**
 * Loaded ONLY via `vite.ssrLoadModule()` from
 * `render-data-table-icon-guard.ts` — never imported directly by a
 * `.spec.ts` file. Same constraint as `render-focus-ring-target.tsx`:
 * Playwright's own test-file loader transforms every `.tsx` file it
 * touches with its own JSX runtime, which would turn the real
 * `DataTable` JSX into descriptor objects rather than real React
 * elements. Loading this file through Vite's own SSR module graph
 * instead keeps every JSX element compiled with React's actual
 * automatic runtime.
 *
 * The markup rendered here is the only one the real-browser spec
 * paints: the real shipping `DataTable` (not a hand-mirrored
 * `<div class="...">` with a copy of the checkbox class string). The
 * class list and DOM shape embedded into the page therefore come
 * directly out of the `Checkbox` primitive and the real `IconCheck`
 * icon — the spec measures the live contract, not a copy of it.
 *
 * The i18n instance is built from the REAL `common.json` translation
 * file on disk rather than a hand-written key/value map, so the SSR
 * render never fabricates a missing key the production app would have
 * — every pluralized form (`range-of-total_one` /
 * `range-of-total_other`, etc.) is the actual production resource.
 * `createI18nFromResources` is the same chokepoint the app uses at
 * SSR time (see `~/lib/i18n.server.ts`), so the rendered HTML is
 * what the production server would emit for an English request.
 */

const FRONT_ROOT = path.resolve(import.meta.dirname, '../..');

const loadCommonResources = (): I18nResources => {
	const filePath = path.join(FRONT_ROOT, 'src/i18n/locales/en/common.json');
	const raw = readFileSync(filePath, 'utf8');
	// The i18n type is constrained to `SupportedNamespace` keys, but the
	// local map is constructed directly from the on-disk translation
	// file. The cast is the single chokepoint where "what is on disk
	// is what the render uses" is asserted, so a missing/renamed key
	// surfaces as a missing translation at render time rather than
	// passing silently through a fabricated stub.
	const commonResource = JSON.parse(raw) as Record<string, unknown>;
	return {
		en: {
			common: commonResource as I18nResources['en'] extends infer R
				? R extends { common?: infer C }
					? C
					: never
				: never,
		},
	};
};

const buildI18n = () =>
	createI18nFromResources(
		'en' as SupportedLanguage,
		['common'] as readonly SupportedNamespace[],
		loadCommonResources(),
	);

type TestRow = { id: string; name: string };

const columns: ColumnDef<TestRow>[] = [
	{
		accessorKey: 'name',
		header: 'Name',
		cell: ({ getValue }) => String(getValue()),
	},
];

const rows: TestRow[] = [
	{ id: 'row-1', name: 'Alice' },
	{ id: 'row-2', name: 'Bob' },
	{ id: 'row-3', name: 'Charlie' },
];

const allSelectedSelection: UseRowSelectionResult = {
	rowSelection: {
		'row-1': true,
		'row-2': true,
		'row-3': true,
	},
	selectedKeys: new Set(['row-1', 'row-2', 'row-3']),
	selectedCount: 3,
	isSelectionMode: true,
	onSelectionChange: () => undefined,
	clearSelection: () => undefined,
};

const render = (i18n: ReturnType<typeof buildI18n>): ReactElement => (
	<I18nextProvider i18n={i18n}>
		<DataTable
			testId="icon-guard-1799"
			ariaLabel="icon guard 1799"
			columns={columns}
			rows={rows}
			queryState={{
				isPending: false,
				isError: false,
				onRetry: () => undefined,
				hasActiveSearch: false,
			}}
			pagination={{
				pageIndex: 0,
				hasPreviousPage: false,
				hasNextPage: false,
				isPaginationPending: false,
				onNextPage: () => undefined,
				onPreviousPage: () => undefined,
			}}
			sort={{ id: 'name', order: 'asc' } as SortState}
			onSortChange={() => undefined}
			size={20}
			onSizeChange={() => undefined}
			searchDraft=""
			onSearchDraftChange={() => undefined}
			selection={allSelectedSelection}
		/>
	</I18nextProvider>
);

export const renderDataTableAllSelectedMarkup = (): string =>
	renderToStaticMarkup(render(buildI18n()));
