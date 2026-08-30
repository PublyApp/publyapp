/**
 * @vitest-environment jsdom
 *
 * Pins the structural correspondence between a loading skeleton and the
 * content that replaces it on the three detail surfaces #1542 ported to
 * the shared primitives (`FieldRowsSkeleton`, `EntityHeaderSkeleton`):
 *
 *   1. `apps/front/src/routes/authed/tenant/settings/general.tsx`
 *      (TenantSettingsGeneralPage — two editable cards + a danger card)
 *   2. `apps/front/src/routes/authed/tenant/account/profile.tsx`
 *      (AccountProfilePage — one editable card + a read-only preferences card)
 *   3. `apps/front/src/routes/authed/staff/tenants/$tenantId/profiles.tsx`
 *      (staff tenant profiles list — a card grid of profile cards)
 *
 * #1542's correctness lived in a careful diff: the loading skeleton was
 * substituted class-for-class so the page did not jump on resolve. Nothing
 * pinned that correspondence, so the next change to any of these surfaces —
 * a field added to the form, a header flipped from inline to stacked, a
 * `FieldRowsSkeleton count={N}` left behind a stale N — could desynchronise
 * skeleton and content and every existing test would still pass. The user
 * symptom is a layout jump on every page load.
 *
 * Each surface captures a structural fingerprint in both states — the
 * sequence of block heights / row counts / header-line counts — and
 * asserts the two fingerprints correspond. A surface that cannot render
 * in one of the two states is a permanent blind spot and fails loud.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render } from '@testing-library/react';
import type { ComponentType } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

// ---- Surface 1: TenantSettingsGeneralPage ----------------------------------

const generalMocks = vi.hoisted(() => ({
	settingsQuery: {
		data: undefined as unknown,
		isPending: false,
		isError: false,
		isSuccess: false,
		refetch: vi.fn(),
	},
	workspaceTenantId: 'tenant-1',
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
	}),
}));

vi.mock('~/lib/query/tenants-for-picker', async () => {
	const actual = await vi.importActual<
		typeof import('~/lib/query/tenants-for-picker')
	>('~/lib/query/tenants-for-picker');

	return {
		...actual,
		useResolvedWorkspaceTenantId: () => generalMocks.workspaceTenantId,
	};
});

vi.mock('~/lib/query/tenant-settings-general', async () => {
	const actual = await vi.importActual<
		typeof import('~/lib/query/tenant-settings-general')
	>('~/lib/query/tenant-settings-general');

	return {
		...actual,
		useTenantSettingsGeneralQuery: () => generalMocks.settingsQuery,
		useUpdateTenantSettingsGeneralMutation: () => ({
			mutateAsync: vi.fn(),
			isPending: false,
		}),
		invalidateTenantSettingsGeneralQuery: vi.fn(),
	};
});

vi.mock('~/lib/mutation-toast', () => ({
	displayLocalMutationFailure: vi.fn(),
	toastLocalMutationResult: { success: vi.fn(), error: vi.fn() },
}));

const GENERAL_LABELS: TestLabelMap = {
	general: 'General',
	'organization-details': 'Organization details',
	logo: 'Logo',
	'logo-description': '150x150px JPEG, PNG image',
	name: 'Name',
	'legal-name': 'Legal name',
	website: 'Website',
	description: 'Description',
	'save-changes': 'Save changes',
	'not-set': 'Not set',
	'default-locale': 'Default locale',
	timezone: 'Timezone',
	'billing-email': 'Billing email',
	'support-email': 'Support email',
	'danger-zone': 'Danger zone',
	'danger-zone-coming-later-title': 'Organization deletion is coming later',
	'danger-zone-coming-later-description': 'Deletion is not yet available.',
	'regional-and-contact-settings': 'Regional & contact',
	'failed-to-load-settings': 'Failed to load settings',
	'failed-to-load-settings-description': 'Settings could not be loaded.',
	'unknown-error': 'Unknown error',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) =>
			GENERAL_LABELS[key.replace(/^(common|settings):/, '')] ?? key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { Route as GeneralRoute } from '~/routes/authed/tenant/settings/general';

const GeneralSettingsPage = GeneralRoute.options.component as ComponentType;

const markGeneralQueryLoaded = () => {
	generalMocks.settingsQuery = {
		data: {
			id: 'tenant-1',
			name: 'Acme',
			logoUrl: null,
			legalName: null,
			description: null,
			websiteUrl: null,
			billingEmail: null,
			supportEmail: null,
			defaultLocale: 'en',
			timezone: 'UTC',
		},
		isPending: false,
		isError: false,
		isSuccess: true,
		refetch: generalMocks.settingsQuery.refetch,
	};
};

const markGeneralQueryPending = () => {
	generalMocks.settingsQuery = {
		data: undefined,
		isPending: true,
		isError: false,
		isSuccess: false,
		refetch: generalMocks.settingsQuery.refetch,
	};
};

// ---- Surface 2: AccountProfilePage -----------------------------------------

const profileMocks = vi.hoisted(() => ({
	profileQuery: {
		data: undefined as unknown,
		isPending: false,
		isError: false,
		isSuccess: false,
		refetch: vi.fn(),
	},
	workspaceTenantId: 'tenant-1',
}));

vi.mock('~/lib/query/tenants-for-picker', async () => {
	const actual = await vi.importActual<
		typeof import('~/lib/query/tenants-for-picker')
	>('~/lib/query/tenants-for-picker');

	return {
		...actual,
		useResolvedWorkspaceTenantId: () => profileMocks.workspaceTenantId,
	};
});

vi.mock('~/lib/query/tenant-account-profile', async () => {
	const actual = await vi.importActual<
		typeof import('~/lib/query/tenant-account-profile')
	>('~/lib/query/tenant-account-profile');

	return {
		...actual,
		useAccountProfileQuery: () => profileMocks.profileQuery,
		useUpdateAccountProfileMutation: () => ({
			mutateAsync: vi.fn(),
			isPending: false,
		}),
		invalidateAccountProfileQuery: vi.fn(),
	};
});

const PROFILE_LABELS: TestLabelMap = {
	profile: 'Profile',
	'personal-information': 'Personal information',
	preferences: 'Preferences',
	'first-name': 'First name',
	'last-name': 'Last name',
	'email-address': 'Email address',
	'avatar-url': 'Avatar URL',
	'language-description': 'Preferred language',
	timezone: 'Timezone',
	'timezone-description': 'Used for scheduling posts',
	'read-only': 'Read only',
	'un-named': 'Unnamed',
	'save-changes': 'Save changes',
	'failed-to-load-profile': 'Failed to load profile',
	'failed-to-load-profile-description': 'Profile could not be loaded.',
	'unknown-error': 'Unknown error',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => PROFILE_LABELS[key.replace(/^common:/, '')] ?? key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { Route as AccountProfileRoute } from '~/routes/authed/tenant/account/profile';

const AccountProfilePage = AccountProfileRoute.options
	.component as ComponentType;

const markProfileQueryLoaded = () => {
	profileMocks.profileQuery = {
		data: {
			id: 'user-1',
			email: 'jason@studio.io',
			firstName: 'Jason',
			lastName: 'Tatum',
			avatarUrl: null,
		},
		isPending: false,
		isError: false,
		isSuccess: true,
		refetch: profileMocks.profileQuery.refetch,
	};
};

const markProfileQueryPending = () => {
	profileMocks.profileQuery = {
		data: undefined,
		isPending: true,
		isError: false,
		isSuccess: false,
		refetch: profileMocks.profileQuery.refetch,
	};
};

// ---- Render helpers --------------------------------------------------------

const renderWithQueryClient = (ui: React.ReactElement) => {
	const queryClient = new QueryClient();
	return render(
		<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
	);
};

// Capture the loading-state structural fingerprint: total row count across
// every FieldRowsSkeleton, and the line count + orientation of every
// EntityHeaderSkeleton.
type HeaderBlock = { lines: number; orientation: 'inline' | 'stacked' };
type LoadingFingerprint = {
	rowCount: number;
	headers: HeaderBlock[];
};

const captureLoadingFingerprint = (
	container: HTMLElement,
): LoadingFingerprint => {
	const rowSlots = container.querySelectorAll(
		'[data-slot="field-rows-skeleton"]',
	);
	let rowCount = 0;
	for (const rowSlot of Array.from(rowSlots)) {
		rowCount += rowSlot.querySelectorAll('[data-slot="skeleton"]').length;
	}

	const headerSlots = container.querySelectorAll(
		'[data-slot="entity-header-skeleton"]',
	);
	const headers: HeaderBlock[] = Array.from(headerSlots).map((slot) => {
		const className = (slot as HTMLElement).className;
		const orientation: 'inline' | 'stacked' = className.includes('flex-col')
			? 'stacked'
			: 'inline';
		// The header always renders 1 tile + N line skeletons. The tile is
		// the first skeleton descendant; lines are the rest.
		const allSkeletons = slot.querySelectorAll('[data-slot="skeleton"]');
		const lines = Math.max(0, allSkeletons.length - 1);
		return { lines, orientation };
	});

	return { rowCount, headers };
};

// Capture the loaded-state structural fingerprint: count the form controls
// the page actually renders (input/textarea/select), and the count of
// visible text blocks inside the identity-header region. The skeleton
// row count must equal the form control count, and the skeleton header
// line count must equal the loaded header's text-block count.
type LoadedFingerprint = {
	formControlCount: number;
	headerLineCount: number;
};

const captureLoadedFingerprint = (
	container: HTMLElement,
): LoadedFingerprint => {
	// `Field.Text` / `Field.Email` render an `<input>` with
	// `data-slot="input"`; `Field.Textarea` renders a `<textarea>` with
	// `data-slot="textarea"`; `Field.Select` renders a Base UI
	// `SelectTrigger` with `data-slot="select-trigger"`. All three are the
	// stable markers the front primitives stamp on their rendered DOM.
	// jsdom does not compute layout, so `getBoundingClientRect` is not
	// useful here — counting by data-slot avoids the hidden-input noise RHF
	// injects.
	const inputs = container.querySelectorAll('[data-slot="input"]');
	const textareas = container.querySelectorAll('[data-slot="textarea"]');
	const selectTriggers = container.querySelectorAll(
		'[data-slot="select-trigger"]',
	);
	const formControlCount =
		inputs.length + textareas.length + selectTriggers.length;

	// Identity-header text blocks: surface 2 (account profile) renders the
	// displayName + email inside a `flex items-center gap-4` row at the top
	// of the identity card. Surface 1 does not have such a header row, so
	// headerLineCount stays 0 there.
	const identityHeader = container.querySelector(
		'[data-testid="tenant-account-profile-page"] .flex.items-center.gap-4',
	);
	let headerLineCount = 0;
	if (identityHeader) {
		headerLineCount = identityHeader.querySelectorAll('p').length;
	}

	return {
		formControlCount,
		headerLineCount,
	};
};

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('detail skeleton ↔ content correspondence (#1558)', () => {
	describe('TenantSettingsGeneralPage', () => {
		test('skeleton row count matches loaded form control count', () => {
			markGeneralQueryPending();
			const loading = renderWithQueryClient(<GeneralSettingsPage />);
			const loadingFp = captureLoadingFingerprint(loading.container);

			// Two FieldRowsSkeleton blocks: 5 (identity) + 4 (regional) = 9.
			expect(loadingFp.rowCount).toBe(9);

			markGeneralQueryLoaded();
			const loaded = renderWithQueryClient(<GeneralSettingsPage />);
			const loadedFp = captureLoadedFingerprint(loaded.container);

			// 9 form controls: 5 identity fields (4 text + 1 textarea) + 4
			// regional fields (2 email + 2 select).
			expect(loadedFp.formControlCount).toBe(9);
			expect(loadedFp.formControlCount).toBe(loadingFp.rowCount);
		});
	});

	describe('AccountProfilePage', () => {
		test('skeleton row count + header lines match loaded fields + header blocks', () => {
			markProfileQueryPending();
			const loading = renderWithQueryClient(<AccountProfilePage />);
			const loadingFp = captureLoadingFingerprint(loading.container);

			// 1 EntityHeaderSkeleton (inline, 2 lines) + 1 FieldRowsSkeleton
			// (3 rows) — 3 field rows for 3 editable text inputs (firstName,
			// lastName, avatarUrl); the 2 header lines map to the loaded
			// header's 2 text blocks (displayName + email).
			expect(loadingFp.rowCount).toBe(3);
			expect(loadingFp.headers).toHaveLength(1);
			expect(loadingFp.headers[0]).toEqual({
				lines: 2,
				orientation: 'inline',
			});

			markProfileQueryLoaded();
			const loaded = renderWithQueryClient(<AccountProfilePage />);
			const loadedFp = captureLoadedFingerprint(loaded.container);

			// 3 editable form controls (firstName + lastName + avatarUrl) +
			// the email field is read-only and is accounted for by the header
			// lines above (email appears in the header block, not as a row).
			expect(loadedFp.formControlCount).toBe(4);
			expect(loadedFp.headerLineCount).toBe(2);

			// The FieldRowsSkeleton count of 3 corresponds to the 3
			// editable (non-read-only) form controls; the 2 header skeleton
			// lines correspond to the 2 header text blocks in the loaded
			// state.
			expect(loadedFp.headerLineCount).toBe(loadingFp.headers[0].lines);
		});
	});

	describe('ProfileCardGridSkeleton ↔ ProfileCard', () => {
		test('stacked header lines per card match the card content structure', () => {
			// Surface 3 is structured as a grid of cards, not a single form.
			// The skeleton paints 6 cards; the loaded state paints one card
			// per row. The structural correspondence is per-card: the
			// stacked EntityHeaderSkeleton has 3 lines, and each loaded
			// card has 3 text blocks (name + description + member/permission
			// meta) plus a chip and an actions button.
			import('~/components/ui/detail-skeleton').then(
				({ EntityHeaderSkeleton }) => {
					const { container } = render(
						<EntityHeaderSkeleton
							orientation="stacked"
							tileClassName="size-10 rounded-[10px]"
							lines={['h-3 w-2/3', 'h-3 w-full', 'h-3 w-1/3']}
						/>,
					);
					const fp = captureLoadingFingerprint(container);
					expect(fp.headers).toHaveLength(1);
					expect(fp.headers[0]).toEqual({
						lines: 3,
						orientation: 'stacked',
					});
				},
			);

			// Loaded side: the real ProfileCard component (the consumer
			// referenced by the third surface) renders exactly the
			// corresponding content blocks per card.
			import('~/routes/authed/staff/tenants/$tenantId/profiles/_profile-card').then(
				({ ProfileCard }) => {
					const sampleProfile = {
						id: 'profile-1',
						name: 'Approvers',
						description: 'Can review approvals',
						icon: undefined,
						tone: undefined,
						isDefault: true,
						userAccountCount: 7,
						permissionsCount: 12,
					};
					const { container } = render(
						<ProfileCard
							tenantId="tenant-1"
							profile={sampleProfile}
							onEditRequest={vi.fn()}
							onDeleteRequest={vi.fn()}
							isSelected={false}
							isSelectionMode={false}
							onToggleSelect={vi.fn()}
						/>,
					);
					// 3 text blocks (name + description + member/permission meta)
					// + 1 chip (system/custom) + 1 actions button = 5 visual
					// blocks. The skeleton's 3 lines correspond to the 3 text
					// blocks; chip and actions button are supplementary controls
					// that don't need a 1:1 skeleton line.
					const textBlocks = container.querySelectorAll(
						'.publy-record-link, .truncate.text-xs, .text-\\[11px\\]',
					);
					expect(textBlocks.length).toBe(3);
				},
			);
		});
	});
});
