import { IconChevronDown, IconSearch } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
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

type PermissionModuleCardProps = {
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

const PermissionModuleCard = ({
	group,
	stagedKeys,
	baselineKeys,
	filterNeedle,
	isCollapsed,
	isSaving,
	onToggleKey,
	onToggleModule,
	onToggleCollapsed,
}: PermissionModuleCardProps) => {
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
			className="rounded-[var(--publy-radius-card)] bg-card shadow-[var(--publy-shadow-ring)]"
			data-testid={`permission-module-${group.moduleKey}`}
		>
			<div className="publy-card-header gap-3">
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
				<span className="publy-detail-chip publy-detail-chip--outline shrink-0">
					{grantedCount}/{totalCount}
				</span>
			</div>

			{expanded ? (
				<ul className="flex flex-col divide-y divide-border">
					{visibleOptions.map((option) => {
						const checked = stagedKeys.has(option.key);
						const isChanged = checked !== baselineKeys.has(option.key);

						return (
							<li
								key={option.key}
								data-testid={`permission-row-${option.key}`}
								data-changed={isChanged ? 'true' : undefined}
								className={cn(
									'px-4 py-2',
									isChanged
										? 'bg-[color:var(--publy-primary-soft)]'
										: undefined,
								)}
							>
								<label className="flex items-center gap-2.5 text-[13px]">
									<Checkbox
										checked={checked}
										disabled={isSaving}
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
											<span className="sr-only">
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

	// Adopt fresh server truth (e.g. after our own save invalidation, or a
	// background refetch) only while the user has nothing staged, so an
	// in-flight edit is never silently discarded — the same protection the
	// edit drawer gets by re-seeding on open/profile-id only.
	useEffect(() => {
		if (isDirty) {
			return;
		}

		const next = new Set(grantedKeys);
		setBaselineKeys((current) =>
			areKeySetsEqual(current, next) ? current : next,
		);
		setStagedKeys((current) =>
			areKeySetsEqual(current, next) ? current : next,
		);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- grantedSignature is the stable key for the granted-keys array
	}, [grantedSignature]);

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
	const leftGroups = visibleGroups.filter((_, index) => index % 2 === 0);
	const rightGroups = visibleGroups.filter((_, index) => index % 2 === 1);

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

	const handleDiscard = (): void => {
		setSaveErrorText(null);
		setStagedKeys(new Set(baselineKeys));
	};

	const handleSave = async (): Promise<void> => {
		if (!isDirty || isSaving) {
			return;
		}

		setSaveErrorText(null);
		setIsSaving(true);

		const results = await Promise.allSettled([
			...addedKeys.map((permissionKey) =>
				assignPermission.mutateAsync({ tenantId, profileId, permissionKey }),
			),
			...removedKeys.map((permissionKey) =>
				unassignPermission.mutateAsync({ tenantId, profileId, permissionKey }),
			),
		]);

		const rejected = results.filter(
			(result): result is PromiseRejectedResult => result.status === 'rejected',
		);

		if (rejected.some((result) => shouldLogoutForFailure(result.reason))) {
			setIsSaving(false);
			onSessionExpired();
			return;
		}

		// Whatever succeeded is now server truth — refetch so the granted keys,
		// glance and stat cards reflect it.
		await invalidateAllStaffTenantScopes(queryClient);

		const visibleFailures = rejected.filter(
			(result) => toApiFailure(result.reason).kind !== 'abort',
		);

		if (visibleFailures.length > 0) {
			setIsSaving(false);
			setSaveErrorText(
				t('tenant-profile-permission-update-partial-success', {
					succeeded: results.length - visibleFailures.length,
					failed: visibleFailures.length,
				}),
			);
			return;
		}

		if (rejected.length > 0) {
			// Only aborted requests remain; leave the staged state intact for retry.
			setIsSaving(false);
			return;
		}

		// Full success: the staged set becomes the new baseline so the bar
		// clears immediately, without waiting for the refetch to land.
		setBaselineKeys(new Set(stagedKeys));
		setIsSaving(false);
		toastLocalMutationResult.success(t('profile-updated-successfully'));
	};

	const handleUnexpectedSaveError = (error: unknown): void => {
		// Belt-and-braces: the batch above already settles every mutation, so
		// this only fires for a pathological throw (e.g. the invalidation
		// rejecting). Re-enable the bar so the user can retry.
		setIsSaving(false);
		void displayLocalMutationFailure(error, t('permissions-save-failed'));
	};

	return (
		<div
			className="flex flex-col gap-4"
			data-testid="staff-tenant-profile-permissions-content"
		>
			<div className="flex flex-col gap-1">
				<h2 className="publy-type-page-title">{t('permissions')}</h2>
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
								<PermissionModuleCard
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
