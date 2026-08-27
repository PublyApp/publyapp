import {
	IconAlertTriangle,
	IconBuilding,
	IconChevronRight,
	IconLoader2,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { AuthAlert } from '~/components/auth/auth-alert';
import { Button } from '~/components/ui/button';
import { useLogout } from '~/lib/hooks/use-logout';
import {
	isActiveTenantForPicker,
	isSuspendedTenantForPicker,
	type TenantForPickerRow,
	type TenantsForPickerData,
} from '~/lib/query/tenants-for-picker';

type TenantPickerRowProps = {
	tenant: TenantForPickerRow;
	onSelect: (tenantId: string) => void;
};

const TenantPickerRow = ({ tenant, onSelect }: TenantPickerRowProps) => {
	const { t } = useTranslation('common');
	const isActive = isActiveTenantForPicker(tenant);
	const isSuspended = isSuspendedTenantForPicker(tenant);

	const cardContent = (
		<>
			<div
				className="flex size-12 shrink-0 items-center justify-center rounded-[var(--publy-radius-input)] bg-muted"
				aria-hidden="true"
			>
				<IconBuilding className="size-7 text-muted-foreground" />
			</div>
			<div className="min-w-0 flex-1 text-left">
				<div className="flex items-center gap-2">
					<span className="truncate text-sm font-medium text-foreground">
						{tenant.name ?? t('unnamed-tenant')}
					</span>
					{isSuspended ? (
						<span className="shrink-0 rounded-[var(--publy-radius-chip)] bg-(--publy-alert-danger-bg) px-2 py-0.5 text-xs font-medium text-(--publy-alert-danger-text)">
							{t('suspended')}
						</span>
					) : null}
				</div>
				{tenant.code ? (
					<span className="block truncate font-mono text-xs text-muted-foreground">
						{tenant.code}
					</span>
				) : null}
			</div>
			{isActive ? (
				<IconChevronRight
					aria-hidden="true"
					className="size-5 shrink-0 text-muted-foreground"
				/>
			) : null}
		</>
	);

	if (!isActive) {
		return (
			<div
				className="flex items-center gap-3 rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] p-4 opacity-50 shadow-[var(--publy-shadow-ring)]"
				data-testid="tenant-portal-row"
				data-tenant-id={tenant.id}
				data-tenant-status={tenant.status}
			>
				{cardContent}
			</div>
		);
	}

	return (
		<button
			type="button"
			onClick={() => onSelect(tenant.id)}
			className="flex w-full items-center gap-3 rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] p-4 text-left shadow-[var(--publy-shadow-ring)] transition-colors hover:bg-[var(--publy-surface-hover)] hover:shadow-[0_0_0_1px_var(--publy-border-strong)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
			data-testid="tenant-portal-row"
			data-tenant-id={tenant.id}
			data-tenant-status={tenant.status}
		>
			{cardContent}
		</button>
	);
};

type TenantPortalPickerViewProps = {
	data: TenantsForPickerData;
	onSelect: (tenantId: string) => void;
};

export const TenantPortalPickerView = ({
	data,
	onSelect,
}: TenantPortalPickerViewProps) => {
	const { t } = useTranslation('common');
	const { logout, isLoggingOut } = useLogout();

	return (
		<div data-testid="tenant-portal-picker">
			<h1 className="text-center text-2xl font-semibold tracking-[-0.01em] text-foreground">
				{t('select-organization')}
			</h1>
			<p className="mt-1 text-center text-sm text-muted-foreground">
				{t('select-organization-description')}
			</p>

			{data.hasSuspendedTenants ? (
				<AuthAlert
					tone="amber"
					icon={<IconAlertTriangle aria-hidden="true" />}
					className="mt-6"
					testId="tenant-portal-suspended-banner"
				>
					{t('suspended-tenants-banner')}
				</AuthAlert>
			) : null}

			<div
				className="mt-6 flex flex-col gap-3"
				data-testid="tenant-portal-list"
			>
				{data.tenants.map((tenant) => (
					<TenantPickerRow
						key={tenant.id}
						tenant={tenant}
						onSelect={onSelect}
					/>
				))}
			</div>

			<div className="mt-8 flex justify-start">
				<Button
					variant="ghost"
					disabled={isLoggingOut}
					onClick={() => logout()}
					className="text-muted-foreground"
					data-testid="tenant-portal-logout-button"
				>
					{isLoggingOut ? (
						<IconLoader2 aria-hidden="true" className="size-4 animate-spin" />
					) : null}
					{t('log-out')}
				</Button>
			</div>
		</div>
	);
};
