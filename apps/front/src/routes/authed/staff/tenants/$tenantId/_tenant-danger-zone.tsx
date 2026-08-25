import { Button } from '~/components/ui/button';
import { DangerZoneCard, DangerZoneRow } from '~/components/ui/detail-layout';

/** Danger-zone rows of the tenant "basics" section. Split out of the route
 * file for `react-doctor/no-giant-component`; markup, labels, disabled rules
 * and i18n keys are unchanged. */
export const TenantDangerZone = ({
	lifecycleTitle,
	lifecycleDescription,
	lifecycleConfirmLabel,
	isLifecycleUnavailable,
	canDelete,
	isDeletePending,
	onLifecycleClick,
	onDeleteClick,
	t,
}: {
	lifecycleTitle: string;
	lifecycleDescription: string;
	lifecycleConfirmLabel: string;
	isLifecycleUnavailable: boolean;
	canDelete: boolean;
	isDeletePending: boolean;
	onLifecycleClick: () => void;
	onDeleteClick: () => void;
	t: (key: string, options?: Record<string, unknown>) => string;
}) => (
	<DangerZoneCard title={t('danger-zone')}>
		<DangerZoneRow
			title={lifecycleTitle}
			description={lifecycleDescription}
			action={
				<Button
					type="button"
					variant="destructive"
					size="sm"
					onClick={onLifecycleClick}
					disabled={isLifecycleUnavailable}
					title={
						isLifecycleUnavailable
							? t('lifecycle-unavailable-until-tenant-activates')
							: undefined
					}
				>
					{lifecycleConfirmLabel}
				</Button>
			}
		/>
		<DangerZoneRow
			title={t('confirm-delete-tenant-title')}
			description={t('confirm-delete-tenant-message')}
			action={
				<Button
					type="button"
					variant="destructive"
					size="sm"
					onClick={onDeleteClick}
					disabled={!canDelete || isDeletePending}
					title={
						canDelete ? undefined : t('delete-tenant-disabled-until-suspended')
					}
				>
					{t('delete')}
				</Button>
			}
		/>
	</DangerZoneCard>
);
