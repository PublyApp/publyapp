import { IconChevronDown, IconSearch } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormActionBar } from '~/components/field/form-layout';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Input } from '~/components/ui/input';
import {
	displayLocalMutationFailure,
	toastLocalMutationResult,
} from '~/lib/mutation-toast';
import {
	buildStaffTenantPermissionGroupColumns,
	getStaffTenantProfilePermissionKeysCacheSnapshot,
	type StaffTenantPermissionGroup,
	useAssignStaffTenantProfilePermissionMutation,
	useUnassignStaffTenantProfilePermissionMutation,
} from '~/lib/query/staff-tenant-profiles';
import { invalidateAllStaffTenantScopes } from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';
import { cn } from '~/lib/utils';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

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

const matchesFilter = (
	option: { key: string; label: string },
	needle: string,
): boolean => {
	if (needle.length === 0) {
		return true;
	}

	return (
		option.label.toLowerCase().includes(needle) ||
		option.key.toLowerCase().includes(needle)
	);
};

type PermissionModuleGroupProps = {
	group: StaffTenantPermissionGroup;
	stagedKeys: Set<string>;
	baselineKeys: Set<string>;
	filterNeedle: string;
	isCollapsed: boolean;
	isSaving: boolean;
	onToggleKey: (key: string, checked: boolean) => void;
	onToggleModule: (keys: string[], checked: boolean) => void;
	onToggleCollapsed: (moduleKey: string) => void;
};

// Matches design 02-standalone-permissions: no card chrome. Each module is a
// light-gray full-width header band (name + granted count) followed by flat,
// borderless rows on the page background.
const PermissionModuleGroup = ({
	group,
	stagedKeys,
	baselineKeys,
	filterNeedle,
	isCollapsed,
	isSaving,
	onToggleKey,
	onToggleModule,
	onToggleCollapsed,
}: PermissionModuleGroupProps) => {
	const { t } = useTranslation('common');
	const allKeys = group.options.map((option) => option.key);
	const grantedCount = allKeys.filter((key) => stagedKeys.has(key)).length;
	const totalCount = allKeys.length;
	const allChecked = grantedCount === totalCount && totalCount > 0;
	const someChecked = grantedCount > 0 && !allChecked;
	// A live filter narrows the visible rows; the header count and select-all
	// still act on the whole module so the numbers stay honest against the
	// permission total the design shows (e.g. "5 / 6").
	const visibleOptions = group.options.filter((option) =>
		matchesFilter(option, filterNeedle),
	);
	const expanded = !isCollapsed && visibleOptions.length > 0;

	return (
		<section
			className="flex flex-col gap-0.5"
			data-testid={`permission-module-${group.moduleKey}`}
		>
			<div className="flex items-center justify-between gap-3 rounded-[var(--publy-radius-sm)] bg-muted px-3 py-2">
				<div className="flex min-w-0 items-center gap-2.5">
					<Checkbox
						checked={allChecked}
						indeterminate={someChecked}
						disabled={isSaving}
						aria-label={t('toggle-all-module-permissions', {
							module: group.moduleLabel,
						})}
						onCheckedChange={(checked) =>
							onToggleModule(allKeys, Boolean(checked))
						}
					/>
					<button
						type="button"
						className="flex min-w-0 items-center gap-1.5"
						aria-expanded={expanded}
						onClick={() => onToggleCollapsed(group.moduleKey)}
					>
						<IconChevronDown
							aria-hidden="true"
							className={cn(
								'size-3.5 shrink-0 text-muted-foreground transition-transform',
								expanded ? undefined : '-rotate-90',
							)}
						/>
						<span className="publy-type-section-title truncate">
							{group.moduleLabel}
						</span>
					</button>
				</div>
				<span className="shrink-0 text-xs tabular-nums text-muted-foreground">
					{grantedCount} / {totalCount}
				</span>
			</div>

			{expanded ? (
				<ul className="flex flex-col">
					{visibleOptions.map((option) => {
						const checked = stagedKeys.has(option.key);
						const isChanged = checked !== baselineKeys.has(option.key);
						const changedDescriptionId = `permission-changed-${option.key}`;

						return (
							<li
								key={option.key}
								data-testid={`permission-row-${option.key}`}
								data-changed={isChanged ? 'true' : undefined}
								className={cn(
									'rounded-[var(--publy-radius-sm)] px-3 py-1.5',
									isChanged
										? 'bg-[color:var(--publy-primary-soft)]'
										: undefined,
								)}
							>
								<label className="flex items-center gap-2.5 text-sm">
									<Checkbox
										checked={checked}
										disabled={isSaving}
										aria-label={option.label}
										aria-describedby={
											isChanged ? changedDescriptionId : undefined
										}
										onCheckedChange={(next) =>
											onToggleKey(option.key, Boolean(next))
										}
									/>
									<span className="text-foreground">{option.label}</span>
									{isChanged ? (
										<>
											<span aria-hidden="true" className="text-primary">
												•
											</span>
											<span id={changedDescriptionId} className="sr-only">
												{t('permission-changed-indicator')}
											</span>
										</>
									) : null}
									<code className="ml-auto font-mono text-xs text-muted-foreground">
										{option.key}
									</code>
								</label>
							</li>
						);
					})}
				</ul>
			) : null}
		</section>
	);
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
	const { t } = useTranslation('common');
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
	const [collapsedModules, setCollapsedModules] = useState<Set<string>>(
		() => new Set(),
	);
	const [filterDraft, setFilterDraft] = useState('');
	const [isSaving, setIsSaving] = useState(false);
	const [saveErrorText, setSaveErrorText] = useState<string | null>(null);

	const isDirty = !areKeySetsEqual(stagedKeys, baselineKeys);
	const grantedSignature = [...grantedKeys].sort().join(',');

	// Query revisions distinguish a stale in-flight result from a later result
	// with the same keys. Signature equality cannot do that: legitimate server
	// truth may repeat a pre-save signature after the save generation completes.
	const appliedGrantedRevisionRef = useRef(grantedRevision);
	const ignoredGrantedCacheSnapshotRef = useRef<{
		permissionKeys: string[];
		revision: number;
	} | null>(null);
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
		const ignoredSnapshot = ignoredGrantedCacheSnapshotRef.current;
		if (
			ignoredSnapshot !== null &&
			grantedRevision <= ignoredSnapshot.revision
		) {
			return;
		}

		const next = new Set(grantedKeys);
		setBaselineKeys(next);
		setStagedKeys(next);
		appliedGrantedRevisionRef.current = grantedRevision;
		ignoredGrantedCacheSnapshotRef.current = null;
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

	const filterNeedle = filterDraft.trim().toLowerCase();
	const visibleGroups = permissionGroups.filter((group) =>
		group.options.some((option) => matchesFilter(option, filterNeedle)),
	);
	const [leftGroups, rightGroups] =
		buildStaffTenantPermissionGroupColumns(visibleGroups);

	const anyCollapsed = permissionGroups.some((group) =>
		collapsedModules.has(group.moduleKey),
	);

	const setKeyStaged = (key: string, checked: boolean): void => {
		setSaveErrorText(null);
		setStagedKeys((current) => {
			const next = new Set(current);
			if (checked) {
				next.add(key);
			} else {
				next.delete(key);
			}
			return next;
		});
	};

	const setModuleStaged = (keys: string[], checked: boolean): void => {
		setSaveErrorText(null);
		setStagedKeys((current) => {
			const next = new Set(current);
			for (const key of keys) {
				if (checked) {
					next.add(key);
				} else {
					next.delete(key);
				}
			}
			return next;
		});
	};

	const toggleCollapsed = (moduleKey: string): void => {
		setCollapsedModules((current) => {
			const next = new Set(current);
			if (next.has(moduleKey)) {
				next.delete(moduleKey);
			} else {
				next.add(moduleKey);
			}
			return next;
		});
	};

	const handleExpandCollapseAll = (): void => {
		setCollapsedModules(
			anyCollapsed
				? new Set()
				: new Set(permissionGroups.map((group) => group.moduleKey)),
		);
	};

	const handleClearAll = (): void => {
		setSaveErrorText(null);
		setStagedKeys(new Set());
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
				const cacheSnapshot = getStaffTenantProfilePermissionKeysCacheSnapshot(
					queryClient,
					{
						tenantId,
						profileId,
					},
				);
				if (cacheSnapshot !== null) {
					ignoredGrantedCacheSnapshotRef.current = cacheSnapshot;
					appliedGrantedRevisionRef.current = Math.max(
						appliedGrantedRevisionRef.current,
						cacheSnapshot.revision,
					);
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
		toastLocalMutationResult.success(t('profile-updated-successfully'));
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
					{t('permissions')}
				</h2>
				<p className="publy-type-helper">{t('profile-permissions-subtitle')}</p>
			</div>

			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="publy-search-wrapper">
					<IconSearch aria-hidden="true" className="publy-search-icon" />
					<Input
						aria-label={t('filter-permissions')}
						className="bg-background pl-9"
						value={filterDraft}
						placeholder={t('filter-permissions')}
						onChange={(event) => setFilterDraft(event.target.value)}
						data-testid="permissions-filter"
					/>
				</div>
				<div className="flex items-center gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={handleExpandCollapseAll}
						disabled={permissionGroups.length === 0}
					>
						{anyCollapsed ? t('expand-all') : t('collapse-all')}
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={handleClearAll}
						disabled={isSaving || stagedKeys.size === 0}
					>
						{t('clear-all')}
					</Button>
				</div>
			</div>

			{isCatalogPending ? (
				<p className="text-sm text-muted-foreground">
					{t('loading-permissions')}
				</p>
			) : null}

			{isCatalogError ? (
				<p className="text-sm text-destructive" role="alert">
					{getFailureMessage(toApiFailure(catalogError), {
						fallback: t('tenant-permission-catalog-load-failed'),
					})}
				</p>
			) : null}

			{!isCatalogPending && !isCatalogError && permissionGroups.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					{t('no-permissions-available')}
				</p>
			) : null}

			{!isCatalogPending && !isCatalogError && permissionGroups.length > 0 ? (
				<div className="grid gap-4 lg:grid-cols-2">
					{[leftGroups, rightGroups].map((columnGroups, columnIndex) => (
						<div key={columnIndex} className="flex flex-col gap-4">
							{columnGroups.map((group) => (
								<PermissionModuleGroup
									key={group.moduleKey}
									group={group}
									stagedKeys={stagedKeys}
									baselineKeys={baselineKeys}
									filterNeedle={filterNeedle}
									isCollapsed={collapsedModules.has(group.moduleKey)}
									isSaving={isSaving}
									onToggleKey={setKeyStaged}
									onToggleModule={setModuleStaged}
									onToggleCollapsed={toggleCollapsed}
								/>
							))}
						</div>
					))}
				</div>
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
						{t('save-changes')}
					</Button>
				</FormActionBar>
			) : null}
		</div>
	);
};
