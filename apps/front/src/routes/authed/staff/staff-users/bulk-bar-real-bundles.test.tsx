/**
 * #1400 — the bulk-actions trigger must speak the app's REAL locale bundles.
 *
 * The routing suites (`staff-users-bulk-routing.test.tsx`,
 * `tenants.test.tsx`, `$tenantId/users.test.tsx`) mock `react-i18next` with a
 * synthetic EN-only `t`, so a FR regression in any bulk-bar key is invisible
 * to them; FR coverage relied on the static key-coverage gate alone (issue
 * finding 2). This suite mounts `StaffUsersListBulkActions` through the REAL
 * production init helper (`createI18nFromResources` from `~/lib/i18n.shared`)
 * fed the REAL shipped `en/common.json` and `fr/common.json` bundles — the
 * same instance shape `__root.tsx` serves in production, no synthetic `t`
 * anywhere — and pins the bar's texts per language. (The tenants bar joins
 * this suite once #1400 extracts the shared trigger and exports the
 * component.)
 *
 * It also pins the WCAG 2.5.3 "label in name" contract (#1400 finding 1):
 * the trigger's accessible name must EQUAL its visible label, which holds
 * structurally only while both come from the same i18n key.
 *
 * Mocked at the seam only: the mutation hooks and toasts. Never
 * `react-i18next`.
 */
/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { i18n as I18nInstance } from 'i18next';
import { createElement, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import resourceEN from '~/i18n/locales/en/common.json';
import resourceFR from '~/i18n/locales/fr/common.json';
import {
	createI18nFromResources,
	type I18nResources,
	type SupportedLanguage,
} from '~/lib/i18n.shared';

import { StaffUsersListBulkActions } from './_list-bulk-actions';

const mocks = vi.hoisted(() => ({
	toastSuccess: vi.fn(),
	toastError: vi.fn(),
	displayLocalMutationFailure: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('~/lib/mutation-toast', () => ({
	displayLocalMutationFailure: mocks.displayLocalMutationFailure,
	toastLocalMutationResult: {
		success: mocks.toastSuccess,
		warning: vi.fn(),
		error: mocks.toastError,
	},
}));

vi.mock('~/lib/query/staff-users', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('~/lib/query/staff-users')>();
	return {
		...actual,
		useStaffUsersQuery: () => ({ data: undefined, isPending: false }),
		useBulkSuspendStaffUsersMutation: () => ({
			mutateAsync: vi.fn(),
			isPending: false,
		}),
		useBulkReactivateStaffUsersMutation: () => ({
			mutateAsync: vi.fn(),
			isPending: false,
		}),
		useBulkDeleteStaffUsersMutation: () => ({
			mutateAsync: vi.fn(),
			isPending: false,
		}),
	};
});

// The export surface pulls XLSX machinery irrelevant to this suite.
vi.mock('~/routes/authed/staff/staff-list-export-selected', () => ({
	StaffListExportSelectedAction: () => null,
	StaffListExportSelectedButton: () => null,
}));

/** REAL init helper, REAL shipped bundles — never re-states production init
 * (same discipline as `src/lib/i18n/trans-render.guard.test.tsx`). */
const RESOURCES: I18nResources = {
	en: { common: resourceEN },
	fr: { common: resourceFR },
};

const USER_A = '11111111-1111-1111-1111-111111111111';

const staffUserRow = {
	id: USER_A,
	email: 'alex@example.com',
	firstName: 'Alex',
	lastName: 'User',
	avatarUrl: null,
	level: 'Admin',
	status: 'Active',
	displayName: 'Alex User',
};

const staffSelection = {
	rowSelection: { [USER_A]: true },
	selectedKeys: new Set([USER_A]),
	selectedCount: 1,
	isSelectionMode: true,
	onSelectionChange: () => undefined,
	clearSelection: () => undefined,
} as const;

describe('#1400 bulk bar speaks the real locale bundles', () => {
	let i18n: I18nInstance;

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	const mountStaffBar = (language: SupportedLanguage) => {
		i18n = createI18nFromResources(language, ['common'], RESOURCES);
		render(
			createElement(
				QueryClientProvider,
				{ client: new QueryClient() },
				createElement(I18nextProvider, { i18n }),
				createElement(StaffUsersListBulkActions, {
					rows: [staffUserRow],
					selection: staffSelection,
					onSessionExpired: () => undefined,
				}),
			),
		);
	};

	for (const language of ['en', 'fr'] as const) {
		test(`staff-users bulk bar (${language}): visible label == accessible name == bundle text`, () => {
			mountStaffBar(language);

			const expectedLabel =
				language === 'en' ? 'Bulk actions' : 'Actions groupées';
			const trigger = screen.getByRole('button', { name: expectedLabel });

			expect(trigger.textContent).toContain(expectedLabel);
			expect(trigger.getAttribute('aria-label')).toBe(expectedLabel);
			expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
			expect(
				screen.queryByRole('button', { name: "Plus d'actions" }),
			).toBeNull();
		});
	}

	test('staff-users bulk menu items come from the fr bundle', () => {
		mountStaffBar('fr');

		fireEvent.click(screen.getByRole('button', { name: 'Actions groupées' }));

		expect(
			screen.getByRole('menuitem', { name: 'Réactiver la sélection' }),
		).toBeTruthy();
		expect(
			screen.getByRole('menuitem', { name: 'Suspendre la sélection' }),
		).toBeTruthy();
		expect(
			screen.getByRole('menuitem', { name: 'Supprimer la sélection' }),
		).toBeTruthy();
	});

	test('staff-users bulk menu items come from the en bundle', () => {
		mountStaffBar('en');

		fireEvent.click(screen.getByRole('button', { name: 'Bulk actions' }));

		expect(
			screen.getByRole('menuitem', { name: 'Reactivate selected' }),
		).toBeTruthy();
		expect(
			screen.getByRole('menuitem', { name: 'Suspend selected' }),
		).toBeTruthy();
		expect(
			screen.getByRole('menuitem', { name: 'Delete selected' }),
		).toBeTruthy();
	});
});
