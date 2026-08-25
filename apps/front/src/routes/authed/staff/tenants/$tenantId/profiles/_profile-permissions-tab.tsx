import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FormActionBar } from '~/components/field/form-layout';
import { Button } from '~/components/ui/button';
import type { StaffTenantPermissionGroup } from '~/lib/query/staff-tenant-profiles';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

import { PermissionMatrix } from './_permission-matrix';
import { useProfilePermissionsSave } from './_profile-permissions-save-hook';

export const ProfilePermissionsTab = ({
	tenantId,
	profileId,
	grantedKeys,
	grantedRevision,
	permissionGroups,
	isCatalogPending,
	isCatalogError,
	catalogError,
	onDirtyChange,
	onSessionExpired,
}: {
	tenantId: string;
	profileId: string;
	/** Server-truth granted permission keys for this profile. */
	grantedKeys: string[];
	/** Monotonic TanStack Query revision for the granted-key server result. */
	grantedRevision: number;
	permissionGroups: StaffTenantPermissionGroup[];
	isCatalogPending: boolean;
	isCatalogError: boolean;
	catalogError: unknown;
	/** Reports staged-edit dirtiness so the page's nav guard can prompt before
	 * a tab switch / Back discards unsaved matrix changes. */
	onDirtyChange: (isDirty: boolean) => void;
	onSessionExpired: () => void;
}) => {
	const { t } = useTranslation('staff-tenant-profiles');
	// The tab heading — focus lands here when the action bar (which held focus)
	// unmounts after Save/Discard, so focus never falls to <body>.
	const headingRef = useRef<HTMLHeadingElement>(null);
	const focusOnActionBarClose = (): void => {
		headingRef.current?.focus();
	};

	const {
		isSaving,
		saveErrorText,
		isDirty,
		stagedKeys,
		baselineKeys,
		setPermissionsStaged,
		onDiscardClick,
		onSaveClick,
	} = useProfilePermissionsSave({
		tenantId,
		profileId,
		grantedKeys,
		grantedRevision,
		onDirtyChange,
		onSessionExpired,
		onFocusActionBarClose: focusOnActionBarClose,
	});

	const labelByKey = useMemo(() => {
		const entries = new Map<string, string>();
		for (const group of permissionGroups) {
			for (const option of group.options) {
				entries.set(option.key, option.label);
			}
		}
		return entries;
	}, [permissionGroups]);

	const addedKeys = [...stagedKeys].filter((key) => !baselineKeys.has(key));
	const removedKeys = [...baselineKeys].filter((key) => !stagedKeys.has(key));
	const changeCount = addedKeys.length + removedKeys.length;
	const changeSummary = [
		...addedKeys.map((key) => `+${labelByKey.get(key) ?? key}`),
		...removedKeys.map((key) => `−${labelByKey.get(key) ?? key}`),
	].join(', ');
	// Extracted from the action-bar status JSX (repo AI-agent preference:
	// avoid nested ternaries — docs/guides/ai-agent-preferences.md). The
	// dirty/clean choice and the "is there a summary to append" choice are
	// two independent decisions; keeping them as separate flat expressions
	// makes both states easier to review than one ternary nested inside
	// another.
	const changeSummarySuffix =
		changeSummary.length > 0 ? ` · ${changeSummary}` : '';
	const permissionsStatusText = isDirty
		? `${t('permissions-unsaved-changes', { count: changeCount })}${changeSummarySuffix}`
		: t('permissions-no-unsaved-changes');

	return (
		<div
			className="flex flex-col gap-4"
			data-testid="staff-tenant-profile-permissions-content"
		>
			<div className="flex flex-col gap-1">
				<h2
					ref={headingRef}
					tabIndex={-1}
					className="publy-type-page-title outline-none"
				>
					{t('common:permissions')}
				</h2>
				<p className="publy-type-helper">{t('profile-permissions-subtitle')}</p>
			</div>

			{isCatalogPending ? (
				<p className="text-sm text-muted-foreground">
					{t('common:loading-permissions')}
				</p>
			) : null}

			{isCatalogError ? (
				<p className="text-sm text-destructive" role="alert">
					{getFailureMessage(toApiFailure(catalogError), {
						fallback: t('common:tenant-permission-catalog-load-failed'),
					})}
				</p>
			) : null}

			{!isCatalogPending && !isCatalogError && permissionGroups.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					{t('common:no-permissions-available')}
				</p>
			) : null}

			{!isCatalogPending && !isCatalogError && permissionGroups.length > 0 ? (
				<PermissionMatrix
					groups={permissionGroups}
					value={[...stagedKeys]}
					baselineValue={[...baselineKeys]}
					disabled={isSaving}
					onChange={setPermissionsStaged}
				/>
			) : null}

			{saveErrorText ? (
				<p className="text-sm text-destructive" role="alert">
					{saveErrorText}
				</p>
			) : null}

			{/* Always rendered — even clean — so there is a persistent, discoverable
			Save affordance and no layout shift on the first toggle (#976). Both
			buttons gate on dirtiness instead of the bar's presence. */}
			<FormActionBar
				data-testid="permissions-action-bar"
				status={
					<span data-testid="permissions-change-status">
						{permissionsStatusText}
					</span>
				}
			>
				<Button
					type="button"
					variant="ghost"
					onClick={onDiscardClick}
					disabled={isSaving || !isDirty}
				>
					{t('discard')}
				</Button>
				<Button
					type="button"
					onClick={onSaveClick}
					disabled={isSaving || !isDirty}
				>
					{t('common:save-changes')}
				</Button>
			</FormActionBar>
		</div>
	);
};
