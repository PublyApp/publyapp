import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormActionBar } from '~/components/field/form-layout';
import { Button } from '~/components/ui/button';
import {
	displayLocalMutationFailure,
	toastLocalMutationResult,
} from '~/lib/mutation-toast';
import {
	getStaffTenantProfilePermissionKeysCacheSnapshot,
	type StaffTenantPermissionGroup,
	useAssignStaffTenantProfilePermissionMutation,
	useUnassignStaffTenantProfilePermissionMutation,
} from '~/lib/query/staff-tenant-profiles';
import { invalidateAllStaffTenantScopes } from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

import { PermissionMatrix } from './_permission-matrix';

// Assign/unassign fire per key with local feedback: the batch save owns the
// toast (silent success) and its own error surfacing (skip global handler),
// mirroring the edit drawer's permission-save contract.
const LOCAL_PERMISSION_META = {
	silentSuccess: true,
	skipGlobalErrorHandler: true,
} as const;

const areKeySetsEqual = (left: Set<string>, right: Set<string>): boolean => {
	if (left.size !== right.size) {
		return false;
	}

	for (const key of left) {
		if (!right.has(key)) {
			return false;
		}
	}

	return true;
};

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
	const queryClient = useQueryClient();
	const assignPermission = useAssignStaffTenantProfilePermissionMutation(
		LOCAL_PERMISSION_META,
	);
	const unassignPermission = useUnassignStaffTenantProfilePermissionMutation(
		LOCAL_PERMISSION_META,
	);

	// `baselineKeys` tracks the last-saved server truth; `stagedKeys` is the
	// in-progress checkbox state. Both are seeded from the granted keys and the
	// diff between them drives the dirty flag, change count and save payload.
	const [baselineKeys, setBaselineKeys] = useState<Set<string>>(
		() => new Set(grantedKeys),
	);
	const [stagedKeys, setStagedKeys] = useState<Set<string>>(
		() => new Set(grantedKeys),
	);
	const [isSaving, setIsSaving] = useState(false);
	const [saveErrorText, setSaveErrorText] = useState<string | null>(null);

	const isDirty = !areKeySetsEqual(stagedKeys, baselineKeys);
	const grantedSignature = [...grantedKeys].sort().join(',');

	// Query revisions distinguish a stale in-flight result from a later result
	// with the same keys. Signature equality cannot do that: legitimate server
	// truth may repeat a pre-save signature after the save generation completes.
	const appliedGrantedRevisionRef = useRef(grantedRevision);
	const suppressedThroughGrantedRevisionRef = useRef<number | null>(null);
	// A ref-backed generation opens synchronously before writes start. Adoption
	// stays disabled until that generation's invalidation attempt finishes, so a
	// cache notification whose React render is queued cannot slip through the
	// dirty→clean edge.
	const nextSaveGenerationRef = useRef(0);
	const openSaveGenerationRef = useRef<number | null>(null);
	// The tab heading — focus lands here when the action bar (which held focus)
	// unmounts after Save/Discard, so focus never falls to <body>.
	const headingRef = useRef<HTMLHeadingElement>(null);

	// Adopt fresh server truth (after our own save invalidation, or a background
	// refetch) only while the user has nothing staged, so an in-flight edit is
	// never silently discarded. Re-running on the dirty→clean edge lets a value
	// that landed mid-edit rebase the baseline once the user discards or reverts.
	useEffect(() => {
		if (isDirty) {
			return;
		}
		if (openSaveGenerationRef.current !== null) {
			return;
		}
		if (grantedRevision <= appliedGrantedRevisionRef.current) {
			return;
		}
		const suppressedThroughRevision =
			suppressedThroughGrantedRevisionRef.current;
		if (
			suppressedThroughRevision !== null &&
			grantedRevision <= suppressedThroughRevision
		) {
			return;
		}

		const next = new Set(grantedKeys);
		setBaselineKeys(next);
		setStagedKeys(next);
		appliedGrantedRevisionRef.current = grantedRevision;
		suppressedThroughGrantedRevisionRef.current = null;
		// eslint-disable-next-line react-hooks/exhaustive-deps -- grantedSignature is the stable key for the granted-keys array
	}, [grantedRevision, grantedSignature, isDirty]);

	useEffect(() => {
		onDirtyChange(isDirty);
	}, [isDirty, onDirtyChange]);

	// A tab switch / Back that the user confirms unmounts this component; clear
	// the page-level dirty flag so it can't wrongly block the next navigation.
	useEffect(() => {
		return () => onDirtyChange(false);
	}, [onDirtyChange]);

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

	const setPermissionsStaged = (nextKeys: string[]): void => {
		setSaveErrorText(null);
		setStagedKeys(new Set(nextKeys));
	};

	// The action bar closes when the matrix returns to a clean state; it held
	// focus, so hand focus to the tab heading rather than letting it drop to body.
	const focusOnActionBarClose = (): void => {
		headingRef.current?.focus();
	};

	const handleDiscard = (): void => {
		setSaveErrorText(null);
		setStagedKeys(new Set(baselineKeys));
		focusOnActionBarClose();
	};

	const handleSave = async (): Promise<void> => {
		if (!isDirty || isSaving) {
			return;
		}

		setSaveErrorText(null);
		setIsSaving(true);
		const saveGeneration = nextSaveGenerationRef.current + 1;
		nextSaveGenerationRef.current = saveGeneration;
		openSaveGenerationRef.current = saveGeneration;

		// Keep each settled result correlated with the exact operation that
		// produced it, so the baseline can be advanced per key that actually
		// persisted — a partial save must not re-count (or retry) keys the
		// server already accepted.
		const operations = [
			...addedKeys.map((permissionKey) => ({
				permissionKey,
				kind: 'assign' as const,
			})),
			...removedKeys.map((permissionKey) => ({
				permissionKey,
				kind: 'unassign' as const,
			})),
		];

		const results = await Promise.allSettled(
			operations.map((operation) =>
				operation.kind === 'assign'
					? assignPermission.mutateAsync({
							tenantId,
							profileId,
							permissionKey: operation.permissionKey,
						})
					: unassignPermission.mutateAsync({
							tenantId,
							profileId,
							permissionKey: operation.permissionKey,
						}),
			),
		);
		// This exact scoped cache revision is the last one that may predate the
		// settled writes. Invalidation can advance the cache while it is awaited,
		// so generation close must never widen this suppression boundary.
		const cacheSnapshotAtWriteSettlement =
			getStaffTenantProfilePermissionKeysCacheSnapshot(queryClient, {
				tenantId,
				profileId,
			});
		const suppressionBoundaryRevision =
			cacheSnapshotAtWriteSettlement?.revision ?? null;

		const rejected = results.filter(
			(result): result is PromiseRejectedResult => result.status === 'rejected',
		);
		if (rejected.some((result) => shouldLogoutForFailure(result.reason))) {
			if (openSaveGenerationRef.current === saveGeneration) {
				openSaveGenerationRef.current = null;
			}
			setIsSaving(false);
			onSessionExpired();
			return;
		}

		// Advance the baseline only for operations that actually persisted:
		// their keys stop counting as unsaved (and are never retried on the next
		// Save), while failed/aborted operations stay dirty for retry.
		const nextBaseline = new Set(baselineKeys);
		let fulfilledCount = 0;
		for (const [index, result] of results.entries()) {
			if (result.status !== 'fulfilled') {
				continue;
			}

			fulfilledCount += 1;
			const operation = operations[index];
			if (operation.kind === 'assign') {
				nextBaseline.add(operation.permissionKey);
			} else {
				nextBaseline.delete(operation.permissionKey);
			}
		}
		setBaselineKeys(nextBaseline);

		// Whatever succeeded is now server truth — refetch so the granted keys,
		// glance and stat cards reflect it. A refresh failure must NOT be reported
		// as a save failure: the writes already persisted, so let query-level
		// retry/refetch own surfacing any staleness.
		try {
			await invalidateAllStaffTenantScopes(queryClient);
		} catch {
			// Persistence succeeded; only the cache refresh failed. Swallow so the
			// success/partial reporting below reflects the actual write outcome.
		}

		if (openSaveGenerationRef.current === saveGeneration) {
			if (fulfilledCount > 0) {
				const cacheSnapshotAtGenerationClose =
					getStaffTenantProfilePermissionKeysCacheSnapshot(queryClient, {
						tenantId,
						profileId,
					});
				if (
					suppressionBoundaryRevision !== null &&
					cacheSnapshotAtGenerationClose !== null &&
					cacheSnapshotAtGenerationClose.revision <= suppressionBoundaryRevision
				) {
					suppressedThroughGrantedRevisionRef.current =
						suppressionBoundaryRevision;
					appliedGrantedRevisionRef.current = Math.max(
						appliedGrantedRevisionRef.current,
						suppressionBoundaryRevision,
					);
				} else if (
					cacheSnapshotAtGenerationClose !== null &&
					cacheSnapshotAtGenerationClose.revision >
						appliedGrantedRevisionRef.current &&
					areKeySetsEqual(stagedKeys, nextBaseline)
				) {
					const next = new Set(cacheSnapshotAtGenerationClose.permissionKeys);
					setBaselineKeys(next);
					setStagedKeys(next);
					appliedGrantedRevisionRef.current =
						cacheSnapshotAtGenerationClose.revision;
					suppressedThroughGrantedRevisionRef.current = null;
				}
			}
			openSaveGenerationRef.current = null;
		}

		const visibleFailures = rejected.filter(
			(result) => toApiFailure(result.reason).kind !== 'abort',
		);

		if (visibleFailures.length > 0) {
			setIsSaving(false);
			setSaveErrorText(
				t('permissions-save-partial', {
					saved: t('permissions-saved-count', { count: fulfilledCount }),
					failed: t('permissions-failed-count', {
						count: visibleFailures.length,
					}),
				}),
			);
			return;
		}

		if (rejected.length > 0) {
			// Only aborted requests remain; their keys stayed dirty for retry.
			setIsSaving(false);
			return;
		}

		setIsSaving(false);
		toastLocalMutationResult.success(t('common:profile-updated-successfully'));
		focusOnActionBarClose();
	};

	const handleUnexpectedSaveError = (error: unknown): void => {
		// Belt-and-braces: the batch above already settles every mutation, so
		// this only fires for a pathological synchronous throw. Close any open
		// generation and re-enable the bar so the user can retry.
		openSaveGenerationRef.current = null;
		setIsSaving(false);
		void displayLocalMutationFailure(error, t('permissions-save-failed'));
	};

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

			{isDirty ? (
				<FormActionBar
					data-testid="permissions-action-bar"
					status={
						<span data-testid="permissions-change-status">
							{t('permissions-unsaved-changes', { count: changeCount })}
							{changeSummary.length > 0 ? ` · ${changeSummary}` : ''}
						</span>
					}
				>
					<Button
						type="button"
						variant="ghost"
						onClick={handleDiscard}
						disabled={isSaving}
					>
						{t('discard')}
					</Button>
					<Button
						type="button"
						onClick={() => {
							handleSave().catch(handleUnexpectedSaveError);
						}}
						disabled={isSaving}
					>
						{t('common:save-changes')}
					</Button>
				</FormActionBar>
			) : null}
		</div>
	);
};
