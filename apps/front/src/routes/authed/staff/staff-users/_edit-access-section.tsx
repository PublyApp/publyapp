import { useTranslation } from 'react-i18next';
import { Field } from '~/components/field';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { LoadingSpinner } from '~/components/ui/loading-spinner';

import { ACCOUNT_LEVEL_OPTIONS, STATUS_OPTIONS } from './_edit-schema';

type ProfileOption = {
	value: string;
	label: string;
	description?: string;
};

export const EditAccessSection = ({
	isSubmittingForm,
	isProfilesFetching,
	isProfilesPending,
	profileOptions,
	hasNoServerProfileRows,
	isProfileSearchSettled,
	deferredProfileSearch,
	profileSearch,
	onProfileSearchChange,
	hasPagination,
	pageIndex,
	hasPreviousPage,
	hasNextCursor,
	onPreviousPage,
	onNextPage,
}: {
	isSubmittingForm: boolean;
	isProfilesFetching: boolean;
	isProfilesPending: boolean;
	profileOptions: ProfileOption[];
	hasNoServerProfileRows: boolean;
	isProfileSearchSettled: boolean;
	deferredProfileSearch: string;
	profileSearch: string;
	onProfileSearchChange: (value: string) => void;
	hasPagination: boolean;
	pageIndex: number;
	hasPreviousPage: boolean;
	hasNextCursor: boolean;
	onPreviousPage: () => void;
	onNextPage: () => void;
}) => {
	const { t } = useTranslation(['staff-users', 'common']);

	return (
		<section className="rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] shadow-[var(--publy-shadow-ring)]">
			<div className="publy-card-header">
				<p className="publy-type-section-title">{t('common:access')}</p>
			</div>
			<div className="space-y-4 p-5">
				<div className="grid gap-4 md:grid-cols-2">
					<Field.Select
						name="accountLevel"
						label={t('role')}
						options={ACCOUNT_LEVEL_OPTIONS.map((value) => ({
							value,
							label: t(value === 'Admin' ? 'common:admin' : 'common:user'),
						}))}
						isDisabled={isSubmittingForm}
					/>
					{/* TODO(contract): status changes use suspend/reactivate endpoints. */}
					<Field.Select
						name="status"
						label={t('common:status')}
						helperText={t('status-managed-from-details')}
						options={STATUS_OPTIONS.map((value) => ({
							value,
							label: t(
								value === 'Active'
									? 'common:status-active'
									: 'common:status-suspended',
							),
						}))}
						isDisabled
					/>
				</div>
				<div className="space-y-1">
					<label
						className="text-sm font-medium text-foreground"
						htmlFor="staff-user-profile-search"
					>
						{t('common:search-profiles')}
					</label>
					<Input
						id="staff-user-profile-search"
						aria-label={t('common:search-profiles')}
						value={profileSearch}
						onChange={(event) => {
							onProfileSearchChange(event.target.value);
						}}
						placeholder={t('common:search-profiles')}
						autoComplete="off"
						disabled={isSubmittingForm}
						data-testid="staff-user-profile-search"
					/>
				</div>
				{isProfilesFetching ? (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<LoadingSpinner />
						<span>{t('common:profiles')}</span>
					</div>
				) : null}
				{profileOptions.length > 0 ? (
					<Field.CheckboxGroup
						name="profileIds"
						label={t('common:select-profiles')}
						options={profileOptions}
						isDisabled={
							isSubmittingForm || isProfilesPending || isProfilesFetching
						}
					/>
				) : null}
				{hasNoServerProfileRows &&
				isProfileSearchSettled &&
				!isProfilesPending &&
				!isProfilesFetching ? (
					<p role="status" className="text-sm text-muted-foreground">
						{deferredProfileSearch
							? t('common:list-no-match-default-description')
							: t('common:no-profiles-available')}
					</p>
				) : null}
				{hasPagination ? (
					<div className="flex items-center justify-between gap-3">
						<p className="text-xs text-muted-foreground">
							{t('common:page-n', {
								page: pageIndex + 1,
							})}
						</p>
						<div className="flex items-center gap-2">
							<Button
								type="button"
								variant="outline"
								size="sm"
								aria-label={t('common:previous-page')}
								disabled={
									isSubmittingForm || isProfilesFetching || !hasPreviousPage
								}
								onClick={onPreviousPage}
							>
								{t('common:previous-page')}
							</Button>
							<Button
								type="button"
								variant="outline"
								size="sm"
								aria-label={t('common:next-page')}
								disabled={
									isSubmittingForm || isProfilesFetching || !hasNextCursor
								}
								onClick={onNextPage}
							>
								{t('common:next-page')}
							</Button>
						</div>
					</div>
				) : null}
			</div>
		</section>
	);
};
