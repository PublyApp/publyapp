import { useTranslation } from 'react-i18next';
import { Field } from '~/components/field';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { LoadingSpinner } from '~/components/ui/loading-spinner';

import { STATUS_OPTIONS } from './_edit-schema';

type RoleOption = {
	value: string;
	label: string;
	description?: string;
};

export const EditAccessSection = ({
	isSubmittingForm,
	roles,
	roleOptions,
	deferredRoleSearch,
	roleSearch,
	onRoleSearchChange,
	pagination,
}: {
	isSubmittingForm: boolean;
	/** State of the assigned-roles query driving this section's busy,
	 * empty and settled rendering. */
	roles: {
		isFetching: boolean;
		isPending: boolean;
		hasNoServerRows: boolean;
		isSearchSettled: boolean;
	};
	roleOptions: RoleOption[];
	deferredRoleSearch: string;
	roleSearch: string;
	onRoleSearchChange: (value: string) => void;
	pagination: {
		/** Renders the page line + prev/next pair; on while another page of
		 * role rows exists in either direction. */
		hasPagination: boolean;
		pageIndex: number;
		hasPreviousPage: boolean;
		hasNextCursor: boolean;
		onPreviousPage: () => void;
		onNextPage: () => void;
	};
}) => {
	const { t } = useTranslation(['staff-users', 'common']);

	return (
		<section className="rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] shadow-[var(--publy-shadow-ring)]">
			<div className="publy-card-header">
				<p className="publy-type-section-title">{t('common:access')}</p>
			</div>
			<div className="space-y-4 p-5">
				<div className="grid gap-4 md:grid-cols-2">
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
						htmlFor="staff-user-role-search"
					>
						{t('common:search-roles')}
					</label>
					<Input
						id="staff-user-role-search"
						aria-label={t('common:search-roles')}
						value={roleSearch}
						onChange={(event) => {
							onRoleSearchChange(event.target.value);
						}}
						placeholder={t('common:search-roles')}
						autoComplete="off"
						disabled={isSubmittingForm}
						data-testid="staff-user-role-search"
					/>
				</div>
				{roles.isFetching ? (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<LoadingSpinner />
						<span>{t('common:roles')}</span>
					</div>
				) : null}
				{roleOptions.length > 0 ? (
					<Field.CheckboxGroup
						name="roleIds"
						label={t('common:select-roles')}
						options={roleOptions}
						isDisabled={isSubmittingForm || roles.isPending || roles.isFetching}
					/>
				) : null}
				{roles.hasNoServerRows &&
				roles.isSearchSettled &&
				!roles.isPending &&
				!roles.isFetching ? (
					<p role="status" className="text-sm text-muted-foreground">
						{deferredRoleSearch
							? t('common:list-no-match-default-description')
							: t('common:no-roles-available')}
					</p>
				) : null}
				{pagination.hasPagination ? (
					<div className="flex items-center justify-between gap-3">
						<p className="text-xs text-muted-foreground">
							{t('common:page-n', {
								page: pagination.pageIndex + 1,
							})}
						</p>
						<div className="flex items-center gap-2">
							<Button
								type="button"
								variant="outline"
								size="sm"
								aria-label={t('common:previous-page')}
								disabled={
									isSubmittingForm ||
									roles.isFetching ||
									!pagination.hasPreviousPage
								}
								onClick={pagination.onPreviousPage}
							>
								{t('common:previous-page')}
							</Button>
							<Button
								type="button"
								variant="outline"
								size="sm"
								aria-label={t('common:next-page')}
								disabled={
									isSubmittingForm ||
									roles.isFetching ||
									!pagination.hasNextCursor
								}
								onClick={pagination.onNextPage}
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
