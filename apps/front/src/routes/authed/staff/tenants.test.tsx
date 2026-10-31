/** @vitest-environment jsdom */
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import sharedEn from '@org/shared-ts/lib/i18n/locales/en';
import sharedFr from '@org/shared-ts/lib/i18n/locales/fr';

const mocks = vi.hoisted(() => ({
	search: {} as Record<string, unknown>,
	navigate: vi.fn(),
	invalidateQueries: vi.fn(),
	useStaffTenantsQuery: vi.fn(),
	shouldLogoutForFailure: vi.fn(() => false),
	downloadFile: vi.fn(),
	suspendTenantMutation: vi.fn(),
	useSuspendStaffTenantMutation: vi.fn(),
	useReactivateStaffTenantMutation: vi.fn(),
	useDeleteStaffTenantMutation: vi.fn(),
	useBulkSuspendStaffTenantsMutation: vi.fn(),
	useBulkReactivateStaffTenantsMutation: vi.fn(),
	useBulkDeleteStaffTenantsMutation: vi.fn(),
	toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('@tanstack/react-query', () => ({
	useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
		useNavigate: () => mocks.navigate,
		useSearch: () => mocks.search,
	}),
	Link: ({ children, to, ...props }: { children: ReactNode; to: string }) =>
		createElement('a', { href: to, ...props }, children),
}));

const TRANSLATIONS: Record<string, string> = {
	tenants: 'Organisations',
	'tenants-list-description': 'Gérez les organisations.',
	'list-aria': 'Organisations (personnel)',
	'list-search-placeholder': 'Rechercher une organisation…',
	'list-export': 'Exporter',
	'list-export-file': 'organisations',
	'list-new-organisation': 'Nouvelle organisation',
	'new-organization': 'Nouvelle organisation',
	'list-sort': 'Trier',
	'list-sort-default': 'Ordre par défaut',
	'list-filters': 'Filtres',
	'list-columns': 'Colonnes',
	'list-columns-hidden': 'Masquées',
	'list-columns-shown': '{{count}} affichées',
	'list-columns-reset': 'Colonnes par défaut',
	'list-clear-all': 'Tout effacer',
	'list-filter-chip': '{{category}} : {{value}}',
	'list-filter-remove': 'Retirer {{filter}}',
	'list-filter-active_one': '{{count}} filtre actif',
	'list-filter-active_other': '{{count}} filtres actifs',
	'list-stats-collapse': 'Replier les statistiques',
	'list-stats-expand': 'Déplier les statistiques',
	'list-empty': 'Aucune organisation ne correspond aux filtres.',
	'list-statuses': 'Statuts',
	'list-seats': 'Places',
	'list-languages': 'Langues',
	'list-status-active': 'Active',
	'list-status-pending': 'En attente',
	'list-status-suspended': 'Suspendue',
	'list-seats-full': 'Complètes',
	'list-seats-high': 'Presque pleines',
	'list-seats-available': 'Places disponibles',
	'list-invitations-with': 'Invitations en attente',
	'list-invitations-without': 'Aucune invitation',
	'list-stat-organisations': 'Organisations',
	'list-stat-members': 'Membres',
	'list-stat-almost-full': 'Presque pleines',
	'list-stat-pending-invitations': 'Invitations en attente',
	'list-stat-active-count_one': '{{count}} active',
	'list-stat-active-count_other': '{{count}} actives',
	'list-stat-pending-count_one': '{{count}} en attente',
	'list-stat-pending-count_other': '{{count}} en attente',
	'list-stat-suspended-count_one': '{{count}} suspendue',
	'list-stat-suspended-count_other': '{{count}} suspendues',
	'list-stat-seats-share': '{{percent}} % des places occupées',
	'list-stat-over-80_one': '{{count}} au-delà de 80 %',
	'list-stat-over-80_other': '{{count}} au-delà de 80 %',
	'list-stat-full_one': '{{count}} complète',
	'list-stat-full_other': '{{count}} complètes',
	'list-total-organisations_one': '{{count}} organisation',
	'list-total-organisations_other': '{{count}} organisations',
	'list-total-members_one': '{{count}} membre',
	'list-total-members_other': '{{count}} membres',
	'list-total-projects_one': '{{count}} projet',
	'list-total-projects_other': '{{count}} projets',
	'list-total-seats': '{{percent}} % de {{seats}} places',
	'list-total-active_one': '{{count}} active',
	'list-total-active_other': '{{count}} actives',
	'list-total-pending_one': '{{count}} en attente',
	'list-total-pending_other': '{{count}} en attente',
	'list-total-suspended_one': '{{count}} suspendue',
	'list-total-suspended_other': '{{count}} suspendues',
	'list-total-active-week': '{{count}} actives cette semaine',
	'list-column-organisation': 'Organisation',
	'list-column-identifier': 'Identifiant',
	'list-column-status': 'Statut',
	'list-column-members': 'Membres',
	'list-column-seats': 'Places occupées',
	'list-column-projects': 'Projets',
	'list-column-connected-accounts': 'Comptes connectés',
	'list-column-posts-month': 'Publications (mois)',
	'list-column-invitations': 'Invitations',
	'list-column-owners': 'Propriétaires',
	'list-column-profiles': 'Profils',
	'list-column-language': 'Langue',
	'list-column-timezone': 'Fuseau horaire',
	'list-column-website': 'Site web',
	'list-column-billing-email': 'E-mail de facturation',
	'list-column-created-at': 'Créée le',
	'list-column-last-activity': 'Dernière activité',
	'list-never': 'Jamais',
	'list-open': 'Ouvrir',
	'list-open-row': 'Ouvrir {{name}}',
	'list-select-row': 'Sélectionner {{name}}',
	'list-select-all': 'Sélectionner toutes les lignes',
	'list-summary': 'Récapitulatif',
	'list-sorted-by': 'Trié par {{column}} {{direction}}',
	'list-sort-asc': 'croissant',
	'list-sort-desc': 'décroissant',
	'list-columns-drag-hint': 'Glissez pour réordonner',
	'page-n': 'Page {{page}}',
	'actions-for': 'Actions pour {{name}}',
	suspend: 'Suspendre',
	reactivate: 'Réactiver',
	delete: 'Supprimer',
	'no-lifecycle-actions': 'Aucune action',
	'bulk-actions': 'Actions groupées',
	'bulk-suspend': 'Suspendre la sélection',
	'bulk-reactivate': 'Réactiver la sélection',
	'bulk-delete': 'Supprimer la sélection',
	'selected-count': '{{count}} sélectionné(s)',
	'clear-selection': 'Effacer la sélection',
	'select-row-named': 'Sélectionner {{name}}',
	'select-all-rows': 'Sélectionner toutes les lignes',
	'more-actions': 'Plus d’actions',
	'list-error-default-description': 'La liste est indisponible.',
	'list-no-match-default-description': 'Aucun résultat.',
	'list-unavailable-title': 'Liste indisponible',
	'list-empty-title': 'Aucune ligne',
	'list-no-match-title': 'Aucun résultat',
	retry: 'Réessayer',
	'bulk-action-max-count-exceeded':
		'Réduisez la sélection à {{max}} éléments ({{count}} sélectionnés).',
	'bulk-action-rows-may-leave-filter': 'Certaines lignes peuvent disparaître.',
	'status-active': 'Actif',
	'status-pending': 'En attente',
	'status-suspended': 'Suspendu',
	'minutes-ago': 'il y a {{count}} minutes',
	'hours-ago': 'il y a {{count}} heures',
	'days-ago': 'il y a {{count}} jours',
	'months-ago': 'il y a {{count}} mois',
	'years-ago': 'il y a {{count}} ans',
	close: 'Fermer',
	'rows-per-page': 'Lignes par page',
	'previous-page': 'Page précédente',
	'next-page': 'Page suivante',
	'range-of-counted': '{{start}}–{{end}} sur {{count}}',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			let text = TRANSLATIONS[key] ?? key;
			for (const [name, value] of Object.entries(options ?? {})) {
				text = text.replaceAll(`{{${name}}}`, String(value));
			}
			return text;
		},
		i18n: { language: 'fr' },
	}),
}));

vi.mock('~/components/error-views/LogoutRedirect', () => ({
	LogoutRedirect: () =>
		createElement('div', { 'data-testid': 'logout-redirect' }, 'logout'),
}));

vi.mock('~/lib/query/staff-tenants', () => ({
	toStaffTenantRows: (items: unknown[] | undefined) => items ?? [],
	useStaffTenantsQuery: mocks.useStaffTenantsQuery,
	invalidateStaffTenants: (client: {
		invalidateQueries: (arg: unknown) => void;
	}) => client.invalidateQueries({ queryKey: ['staff', 'staff-tenants'] }),
	useSuspendStaffTenantMutation: mocks.useSuspendStaffTenantMutation,
	useReactivateStaffTenantMutation: mocks.useReactivateStaffTenantMutation,
	useDeleteStaffTenantMutation: mocks.useDeleteStaffTenantMutation,
	useBulkSuspendStaffTenantsMutation: mocks.useBulkSuspendStaffTenantsMutation,
	useBulkReactivateStaffTenantsMutation:
		mocks.useBulkReactivateStaffTenantsMutation,
	useBulkDeleteStaffTenantsMutation: mocks.useBulkDeleteStaffTenantsMutation,
}));

vi.mock('@org/shared-ts/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

vi.mock('~/lib/mutation-feedback/mutation-toast', () => ({
	displayLocalMutationFailure: vi.fn().mockResolvedValue(undefined),
	toastLocalMutationResult: mocks.toast,
}));

vi.mock('~/utils/download-file', () => ({
	downloadFile: mocks.downloadFile,
	formatExportDateStamp: () => '2026-10-27',
}));

import { Route } from './tenants';

const rows = [
	{
		id: 'tenant-1',
		name: 'Acme Corporation',
		logoUrl: null,
		status: 'Active',
		usersCount: 12,
		projectsCount: 4,
		maxUsers: 50,
		lastActivityAt: new Date('2026-10-24T10:00:00Z'),
	},
	{
		id: 'tenant-2',
		name: 'Globex',
		logoUrl: null,
		status: 'Pending',
		usersCount: 9,
		projectsCount: 1,
		maxUsers: 10,
		lastActivityAt: null,
	},
];

const queryResult = (overrides: Record<string, unknown> = {}) => ({
	data: { data: rows, nextCursor: null },
	error: null,
	isPending: false,
	isError: false,
	isFetching: false,
	refetch: vi.fn().mockResolvedValue(undefined),
	...overrides,
});

const RouteComponent = Route.options.component as () => JSX.Element;

const renderPage = () =>
	render(
		<>
			<div id="app-shell-page-panel" />
			<RouteComponent />
		</>,
	);

describe('staff tenants route (organisations list)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.search = {};
		mocks.shouldLogoutForFailure.mockReturnValue(false);
		mocks.useStaffTenantsQuery.mockReturnValue(queryResult());
		mocks.useSuspendStaffTenantMutation.mockReturnValue({
			mutateAsync: mocks.suspendTenantMutation,
			isPending: false,
		});
		mocks.useReactivateStaffTenantMutation.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		});
		mocks.useDeleteStaffTenantMutation.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		});
		mocks.useBulkSuspendStaffTenantsMutation.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		});
		mocks.useBulkReactivateStaffTenantsMutation.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		});
		mocks.useBulkDeleteStaffTenantsMutation.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		});
	});

	afterEach(() => {
		cleanup();
	});

	test('renders the organisations title, the 4 stat cards and the 14 default columns', () => {
		renderPage();

		expect(screen.getAllByText('Organisations').length).toBeGreaterThan(0);
		expect(screen.getByTestId('tenant-stat-total').textContent).toContain('2');
		expect(screen.getByTestId('tenant-stat-members').textContent).toContain(
			'21',
		);
		expect(screen.getByTestId('tenant-stat-almost-full').textContent).toContain(
			'1',
		);
		expect(screen.getByTestId('tenant-stat-invitations').textContent).toContain(
			'—',
		);

		fireEvent.click(
			screen.getByText('Colonnes').closest('button') as HTMLElement,
		);
		const popover = document.querySelector('[data-slot="popover-content"]');
		if (!popover) {
			throw new Error('columns popover missing');
		}
		expect(
			within(popover as HTMLElement).getAllByRole('checkbox'),
		).toHaveLength(14);
		expect(within(popover as HTMLElement).getByText('Profils')).toBeTruthy();
		expect(
			within(popover as HTMLElement).getByText('E-mail de facturation'),
		).toBeTruthy();
	});

	test('the create CTA uses the feminine organisation label, not a composed masculine one', () => {
		// "Organisation" is feminine: "Nouveau Organisation" (new-item + tenant)
		// was the bug. The dedicated key carries the agreed wording in both
		// locales, and the CTA must render it.
		expect(sharedFr.common['new-organization']).toBe('Nouvelle organisation');
		expect(sharedEn.common['new-organization']).toBe('New organization');

		renderPage();

		expect(
			screen
				.getByRole('link', { name: 'Nouvelle organisation' })
				.getAttribute('href'),
		).toBe('/staff/tenants/new');
	});

	test('a ?status=pending link filters the list and shows its chip', () => {
		mocks.search = { status: 'pending' };
		renderPage();

		expect(screen.getAllByText('Globex').length).toBeGreaterThan(0);
		expect(screen.queryByText('Acme Corporation')).toBeNull();
		expect(screen.getByText('Statuts : En attente')).toBeTruthy();
		// The API is asked for every status so the panel counters stay honest.
		expect(mocks.useStaffTenantsQuery).toHaveBeenCalledWith(
			expect.not.objectContaining({ status: expect.anything() }),
		);
	});

	test('counters equal the rows of the filtered list, from the same data', async () => {
		renderPage();
		const panel = document.getElementById('app-shell-page-panel');
		if (!panel) {
			throw new Error('panel missing');
		}
		await waitFor(() =>
			expect(
				panel.querySelector('[data-list-panel-group="status"]'),
			).toBeTruthy(),
		);
		const statusGroup = panel.querySelector('[data-list-panel-group="status"]');
		if (!statusGroup) {
			throw new Error('status group missing');
		}
		expect(
			within(statusGroup as HTMLElement).getByText('Statuts'),
		).toBeTruthy();
		// 1 active + 1 pending in the loaded rows.
		expect(within(statusGroup as HTMLElement).getAllByText('1')).toHaveLength(
			2,
		);
	});

	test('the missing pending-invitation figure is an em dash, never 0', () => {
		renderPage();
		const card = screen.getByTestId('tenant-stat-invitations');
		expect(card.textContent).not.toContain('0');
		expect(card.textContent).toContain('—');
	});

	test('the row actions menu offers suspend for an active organisation', () => {
		renderPage();
		fireEvent.click(screen.getByTestId('staff-tenants-table-actions-tenant-1'));
		expect(screen.getByRole('menuitem', { name: /Suspendre/ })).toBeTruthy();
	});

	test('selecting a row reveals the bulk bar and the bulk trigger', async () => {
		renderPage();
		fireEvent.click(
			screen.getAllByRole('checkbox', { name: /Sélectionner Acme/ })[0],
		);
		expect(
			await screen.findByRole('button', { name: /Actions groupées/ }),
		).toBeTruthy();
	});

	test('Export writes a CSV of the loaded rows', () => {
		renderPage();
		fireEvent.click(screen.getByRole('button', { name: 'Exporter' }));
		expect(mocks.downloadFile).toHaveBeenCalledTimes(1);
		const payload = mocks.downloadFile.mock.calls[0][0] as {
			data: string;
			fileName: string;
		};
		expect(payload.data).toContain('Acme Corporation');
		expect(payload.fileName).toContain('organisations-');
	});

	test('renders the loading state while the query is pending', () => {
		mocks.useStaffTenantsQuery.mockReturnValue(
			queryResult({ data: undefined, isPending: true }),
		);
		renderPage();
		expect(screen.getByTestId('staff-tenants-loading')).toBeTruthy();
	});

	test('renders the error state without logging out for non-401 failures', () => {
		mocks.useStaffTenantsQuery.mockReturnValue(
			queryResult({ data: undefined, isError: true, error: new Error('boom') }),
		);
		renderPage();
		expect(screen.getByTestId('staff-tenants-error')).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('redirects to logout when the failure invalidates the session', () => {
		mocks.shouldLogoutForFailure.mockReturnValue(true);
		mocks.useStaffTenantsQuery.mockReturnValue(
			queryResult({ data: undefined, isError: true, error: new Error('401') }),
		);
		renderPage();
		expect(screen.getByTestId('logout-redirect')).toBeTruthy();
	});
});
