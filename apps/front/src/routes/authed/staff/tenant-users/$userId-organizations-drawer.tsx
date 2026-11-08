import { IconSearch } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import QueryDisplay from '~/components/query-display';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import {
	Drawer,
	DrawerBody,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerForm,
	DrawerHeader,
	DrawerTitle,
} from '~/components/ui/drawer';
import { BrandTile } from '~/components/ui/initials-avatar';
import { Input } from '~/components/ui/input';
import {
	displayLocalMutationFailure,
	toastLocalMutationResult,
} from '~/lib/mutation-feedback/mutation-toast';
import {
	invalidateGlobalTenantUsers,
	toGlobalTenantUserBulkUnlinkSummary,
	toTenantPickerOptions,
	useGlobalTenantUsersPickerQuery,
	useLinkGlobalTenantUserCompaniesMutation,
} from '~/lib/query/staff-global-tenant-users';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { formatTenantStatusLabel } from '../tenants/$tenantId/_tenant-details-shell';

const PICKER_PAGE_SIZE = 20;

/** Test seam + drawer-registry surface: rendered directly by drawer-form guards. */
export const LinkCompaniesDrawerHost = ({
	userId,
	isOpen,
	onOpenChange,
}: {
	userId: string;
	isOpen: boolean;
	onOpenChange: (isOpen: boolean) => void;
}) => {
	const { t } = useTranslation('common');
	const queryClient = useQueryClient();
	const [search, setSearch] = useState('');
	const [selectedTenantIds, setSelectedTenantIds] = useState<Set<string>>(
		new Set(),
	);
	const link = useLinkGlobalTenantUserCompaniesMutation();
	const [shouldLogout, setShouldLogout] = useState(false);

	// ponytail: the drawer has no editable field left — RHF only backs the
	// shared `DrawerForm` submit wrapper, so an empty field map is enough.
	const methods = useForm<Record<string, never>>();

	// The picker only fetches while open — an idle drawer never hits /staff/tenants.
	const pickerQuery = useGlobalTenantUsersPickerQuery(
		{ q: search || undefined, size: PICKER_PAGE_SIZE },
		{ enabled: isOpen },
	);
	// Rows already linked cannot be linked twice — hidden from the picker.
	const linkedIds = useMemo(() => new Set<string>(), []);

	// The parent's list markup and empty-success copy: the parent showed the
	// « no matching companies / no items found » paragraph AND the (empty)
	// list on a zero-row success. `renderOptions` is shared by the data and
	// error-held-data renders so the error branch never duplicates it.
	const renderOptions = (options: ReturnType<typeof toTenantPickerOptions>) => (
		<ul className="space-y-2" data-testid="link-companies-options">
			{options.map((option) => {
				const isChecked = selectedTenantIds.has(option.id);
				const isLinked = linkedIds.has(option.id);

				return (
					<li key={option.id}>
						<label className="flex cursor-pointer items-center gap-3 rounded-[var(--publy-radius-sm)] border border-[var(--publy-row-border)] bg-[var(--publy-surface-raised)] p-3 hover:bg-[var(--publy-surface-hover)]">
							<Checkbox
								checked={isChecked}
								disabled={isLinked}
								onCheckedChange={(checked) => {
									setSelectedTenantIds((previous) => {
										const next = new Set(previous);
										if (checked) {
											next.add(option.id);
										} else {
											next.delete(option.id);
										}
										return next;
									});
								}}
								aria-label={option.name}
							/>
							<BrandTile name={option.name} logoUrl={option.logoUrl} />
							<span className="min-w-0 flex-1 truncate text-sm font-medium">
								{option.name}
							</span>
							{option.status ? (
								<span className="text-xs text-muted-foreground">
									{formatTenantStatusLabel(option.status ?? '', t)}
								</span>
							) : null}
						</label>
					</li>
				);
			})}
		</ul>
	);
	const renderEmptyCompanies = (
		<p
			className="py-6 text-center text-sm text-muted-foreground"
			data-testid="link-companies-empty"
		>
			{search ? t('no-matching-companies') : t('no-items-found')}
		</p>
	);

	// F-M1 (#2341): ErrorSlot must be an ELEMENT with a stable type, not an
	// inline arrow. QueryDisplay mounts a function slot as a component, so an
	// arrow is a new component type on every host render and would remount the
	// held-data list (dropping the focused row's checkbox) each time it is ticked.
	// Computing the element here keeps the subtree reconciling in place.
	const errorContent = (
		<p
			className="py-6 text-center text-sm text-destructive"
			role="alert"
			data-testid="link-companies-error"
		>
			{getFailureMessage(toApiFailure(pickerQuery.error), {
				fallback: t('an-error-occurred'),
			})}
			<Button
				variant="outline"
				size="sm"
				type="button"
				className="ml-2"
				onClick={() => void pickerQuery.refetch()}
			>
				{t('try-again')}
			</Button>
		</p>
	);
	const heldOptions =
		pickerQuery.data === undefined
			? undefined
			: toTenantPickerOptions(pickerQuery.data);
	// The parent rendered the error paragraph AND kept deriving the list from
	// the query data, so a failed refetch (TanStack v5 flips `status: 'error'`
	// without clearing `data`) still shows the loaded rows. On a first-load
	// failure `data === undefined` -> the error paragraph alone, as before.
	const errorSlot =
		heldOptions === undefined ? (
			errorContent
		) : (
			<>
				{errorContent}
				{heldOptions.length === 0 ? renderEmptyCompanies : null}
				{renderOptions(heldOptions)}
			</>
		);

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	const close = () => {
		onOpenChange(false);
		setSearch('');
		setSelectedTenantIds(new Set());
	};

	const performLink = async () => {
		if (selectedTenantIds.size === 0) {
			return;
		}

		try {
			const result = await link.mutateAsync({
				userId,
				tenantIds: [...selectedTenantIds],
			});
			close();

			const summary = toGlobalTenantUserBulkUnlinkSummary({
				succeededCount: result?.succeededCount ?? 0,
				failedCount: result?.failedCount ?? 0,
				failedItems: [],
			});

			await invalidateGlobalTenantUsers(queryClient);

			if (summary.failedCount === 0) {
				toastLocalMutationResult.success(
					t('tenant-user-company-assign-success', {
						count: summary.succeededCount,
					}),
				);
				return;
			}

			toastLocalMutationResult.error(
				t('tenant-user-company-assign-partial-success', {
					succeeded: summary.succeededCount,
					failed: summary.failedCount,
				}),
			);
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				setShouldLogout(true);
				return;
			}
			await displayLocalMutationFailure(
				error,
				t('tenant-user-company-assign-failure'),
			);
		}
	};

	return (
		<Drawer
			open={isOpen}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) {
					close();
					return;
				}
				onOpenChange(nextOpen);
			}}
		>
			<DrawerContent data-testid="link-companies-drawer">
				<DrawerHeader>
					<DrawerTitle>{t('link-companies')}</DrawerTitle>
					<DrawerDescription>
						{t('link-tenant-user-companies-description')}
					</DrawerDescription>
				</DrawerHeader>
				<DrawerForm
					methods={methods}
					onSubmit={(event) => {
						event.preventDefault();
						void performLink();
					}}
				>
					<DrawerBody className="space-y-4">
						<div className="relative">
							<IconSearch
								aria-hidden="true"
								className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
							/>
							<Input
								value={search}
								onChange={(event) => setSearch(event.target.value)}
								placeholder={t('search-companies')}
								aria-label={t('search-companies')}
								className="pl-9"
								data-testid="link-companies-search"
							/>
						</div>

						<QueryDisplay
							query={pickerQuery}
							LoadingSlot={
								<p
									className="py-6 text-center text-sm text-muted-foreground"
									data-testid="link-companies-loading"
								>
									{t('loading')}
								</p>
							}
							ErrorSlot={errorSlot}
							EmptySlot={renderEmptyCompanies}
						>
							{({ data }) => {
								const options = toTenantPickerOptions(data);

								return (
									<>
										{
											null /* ponytail: errorContent slot placeholder — keeps <ul> at child index 2, aligned with the error branch so React reconciles it in place across data↔error flips */
										}
										{options.length === 0 ? renderEmptyCompanies : null}
										{renderOptions(options)}
									</>
								);
							}}
						</QueryDisplay>
					</DrawerBody>
					<DrawerFooter>
						<Button
							type="submit"
							disabled={link.isPending || selectedTenantIds.size === 0}
						>
							{t('link')}
						</Button>
						<DrawerClose
							render={
								<Button type="button" variant="ghost">
									{t('cancel')}
								</Button>
							}
						/>
					</DrawerFooter>
				</DrawerForm>
			</DrawerContent>
		</Drawer>
	);
};
