import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
	displayLocalMutationFailure,
	toastLocalMutationResult,
} from '~/lib/mutation-toast';
import {
	getStaffTenantProfilePermissionKeysCacheSnapshot,
	useAssignStaffTenantProfilePermissionMutation,
	useUnassignStaffTenantProfilePermissionMutation,
} from '~/lib/query/staff-tenant-profiles';
import { invalidateAllStaffTenantScopes } from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

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

export type ProfilePermissionsSaveApi = {
	isSaving: boolean;
	saveErrorText: string | null;
	isDirty: boolean;
	stagedKeys: Set<string>;
	baselineKeys: Set<string>;
	setPermissionsStaged: (nextKeys: string[]) => void;
	onDiscardClick: () => void;
	onSaveClick: () => void;
};

/**
 * Owns the inline permission-matrix save orchestration: the staged/baseline
 * key sets, the per-key assign/unassign batch with partial-save
 * reconciliation, the granted-truth adoption guard, and the page-level dirty
 * flag reported up to the layout's navigation guard.
 *
 * The dirty flag is notified to the parent synchronously at the event sites
 * that change it (toggle / discard / save) rather than from a derived-state
 * effect, so the parent never pays an extra render just to stay in sync
 * (react-doctor no-pass-data-to-parent / no-prop-callback-in-effect). The
 * loading flag resets in a `finally` so a rejected await can never leave the
 * bar stuck saving (react-doctor no-loading-flag-reset-outside-finally).
 */
export const useProfilePermissionsSave = ({
	tenantId,
	profileId,
	grantedKeys,
	grantedRevision,
	onDirtyChange,
	onSessionExpired,
	onFocusActionBarClose,
}: {
	tenantId: string;
	profileId: string;
	grantedKeys: string[];
	grantedRevision: number;
	onDirtyChange: (isDirty: boolean) => void;
	onSessionExpired: () => void;
	onFocusActionBarClose: () => void;
}): ProfilePermissionsSaveApi => {
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

		const next = new Set(grantedSignature.split(',').filter(Boolean));
		setBaselineKeys(next);
		setStagedKeys(next);
		appliedGrantedRevisionRef.current = grantedRevision;
		suppressedThroughGrantedRevisionRef.current = null;
	}, [grantedRevision, grantedSignature, isDirty]);

	// A tab switch / Back that the user confirms unmounts this hook; clear
	// the page-level dirty flag so it can't wrongly block the next navigation.
	// Cleanup-only: never runs during render, so it does not hand data back to
	// the parent on a state change (only on the unmount it is keyed for).
	useEffect(() => {
		return () => onDirtyChange(false);
	}, [onDirtyChange]);

	const setPermissionsStaged = (nextKeys: string[]): void => {
		setSaveErrorText(null);
		const next = new Set(nextKeys);
		setStagedKeys(next);
		onDirtyChange(!areKeySetsEqual(next, baselineKeys));
	};

	const handleDiscard = (): void => {
		setSaveErrorText(null);
		setStagedKeys(new Set(baselineKeys));
		onDirtyChange(false);
		onFocusActionBarClose();
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
		const addedKeys = [...stagedKeys].filter((key) => !baselineKeys.has(key));
		const removedKeys = [...baselineKeys].filter((key) => !stagedKeys.has(key));
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

		try {
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
				(result): result is PromiseRejectedResult =>
					result.status === 'rejected',
			);
			if (rejected.some((result) => shouldLogoutForFailure(result.reason))) {
				if (openSaveGenerationRef.current === saveGeneration) {
					openSaveGenerationRef.current = null;
				}
				onSessionExpired();
				return;
			}

			// Advance the baseline only for operations that actually persisted:
			// their keys stop counting as unsaved (and are never retried on the
			// next Save), while failed/aborted operations stay dirty for retry.
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
				// Persistence succeeded; only the cache refresh failed. Swallow so
				// the success/partial reporting below reflects the actual write
				// outcome.
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
						cacheSnapshotAtGenerationClose.revision <=
							suppressionBoundaryRevision
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
				setSaveErrorText(
					t('permissions-save-partial', {
						saved: t('permissions-saved-count', {
							count: fulfilledCount,
						}),
						failed: t('permissions-failed-count', {
							count: visibleFailures.length,
						}),
					}),
				);
				return;
			}

			if (rejected.length > 0) {
				// Only aborted requests remain; their keys stayed dirty for retry.
				return;
			}

			toastLocalMutationResult.success(
				t('common:profile-updated-successfully'),
			);
			onDirtyChange(false);
			onFocusActionBarClose();
		} finally {
			// The loading flag must clear on every path — success, partial,
			// abort, session-expiry, and any pathological throw — so a rejected
			// await can never leave the bar stuck saving.
			setIsSaving(false);
		}
	};

	const handleUnexpectedSaveError = (error: unknown): void => {
		// Belt-and-braces: the batch above already settles every mutation, so
		// this only fires for a pathological synchronous throw. Close any open
		// generation so the bar can retry.
		openSaveGenerationRef.current = null;
		void displayLocalMutationFailure(error, t('permissions-save-failed'));
	};

	const onSaveClick = (): void => {
		handleSave().catch(handleUnexpectedSaveError);
	};

	return {
		isSaving,
		saveErrorText,
		isDirty,
		stagedKeys,
		baselineKeys,
		setPermissionsStaged,
		onDiscardClick: handleDiscard,
		onSaveClick,
	};
};
