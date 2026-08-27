import { IconChevronDown } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { SearchInput } from '~/components/ui/search-input';
import {
	buildStaffTenantPermissionGroupColumns,
	type StaffTenantPermissionGroup,
} from '~/lib/query/staff-tenant-profiles';
import { cn } from '~/lib/utils';

type PermissionMatrixProps = {
	groups: StaffTenantPermissionGroup[];
	value: string[];
	onChange: (value: string[]) => void;
	baselineValue?: string[];
	disabled?: boolean;
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
	selectedKeys: Set<string>;
	baselineKeys: Set<string>;
	filterNeedle: string;
	isCollapsed: boolean;
	disabled: boolean;
	onToggleKey: (key: string, checked: boolean) => void;
	onToggleModule: (keys: string[], checked: boolean) => void;
	onToggleCollapsed: (moduleKey: string) => void;
};

const PermissionModuleGroup = ({
	group,
	selectedKeys,
	baselineKeys,
	filterNeedle,
	isCollapsed,
	disabled,
	onToggleKey,
	onToggleModule,
	onToggleCollapsed,
}: PermissionModuleGroupProps) => {
	const { t } = useTranslation('staff-tenant-profiles');
	const allKeys = group.options.map((option) => option.key);
	const selectedCount = allKeys.filter((key) => selectedKeys.has(key)).length;
	const totalCount = allKeys.length;
	const allChecked = selectedCount === totalCount && totalCount > 0;
	const someChecked = selectedCount > 0 && !allChecked;
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
						disabled={disabled}
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
					{selectedCount} / {totalCount}
				</span>
			</div>

			{expanded ? (
				<ul className="flex flex-col">
					{visibleOptions.map((option) => {
						const checked = selectedKeys.has(option.key);
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
										disabled={disabled}
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

const PermissionMatrix = ({
	groups,
	value,
	onChange,
	baselineValue,
	disabled = false,
}: PermissionMatrixProps) => {
	const { t } = useTranslation('staff-tenant-profiles');
	const [filterDraft, setFilterDraft] = useState('');
	const [collapsedModules, setCollapsedModules] = useState<Set<string>>(
		() => new Set(),
	);
	const selectedKeys = useMemo(() => new Set(value), [value]);
	const baselineKeys = useMemo(
		() => new Set(baselineValue ?? value),
		[baselineValue, value],
	);
	const catalogKeys = groups.flatMap((group) =>
		group.options.map((option) => option.key),
	);
	const selectedCount = catalogKeys.filter((key) =>
		selectedKeys.has(key),
	).length;
	const filterNeedle = filterDraft.trim().toLowerCase();
	const visibleGroups = groups.filter((group) =>
		group.options.some((option) => matchesFilter(option, filterNeedle)),
	);
	const [leftGroups, rightGroups] =
		buildStaffTenantPermissionGroupColumns(visibleGroups);
	const anyCollapsed = groups.some((group) =>
		collapsedModules.has(group.moduleKey),
	);

	const toggleKey = (key: string, checked: boolean): void => {
		const next = new Set(value);
		if (checked) {
			next.add(key);
		} else {
			next.delete(key);
		}
		onChange([...next]);
	};

	const toggleModule = (keys: string[], checked: boolean): void => {
		const next = new Set(value);
		for (const key of keys) {
			if (checked) {
				next.add(key);
			} else {
				next.delete(key);
			}
		}
		onChange([...next]);
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

	const toggleAllCollapsed = (): void => {
		setCollapsedModules(
			anyCollapsed
				? new Set()
				: new Set(groups.map((group) => group.moduleKey)),
		);
	};

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<SearchInput
					aria-label={t('filter-permissions')}
					value={filterDraft}
					onValueChange={setFilterDraft}
					placeholder={t('filter-permissions')}
					clearLabel={t('clear-permissions-filter')}
					data-testid="permissions-filter"
				/>
				<div className="flex flex-wrap items-center gap-2">
					<strong
						className="text-sm font-semibold text-foreground"
						data-testid="permissions-selected-total"
						aria-live="polite"
					>
						{t('permissions-selected-total', {
							selected: selectedCount,
							total: catalogKeys.length,
						})}
					</strong>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={toggleAllCollapsed}
						disabled={groups.length === 0}
					>
						{anyCollapsed ? t('expand-all') : t('collapse-all')}
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => onChange([])}
						disabled={disabled || selectedCount === 0}
					>
						{t('common:clear-all')}
					</Button>
				</div>
			</div>

			{visibleGroups.length > 0 ? (
				<div className="grid gap-4 lg:grid-cols-2">
					{[leftGroups, rightGroups].map((columnGroups, columnIndex) => (
						<div key={columnIndex} className="flex flex-col gap-4">
							{columnGroups.map((group) => (
								<PermissionModuleGroup
									key={group.moduleKey}
									group={group}
									selectedKeys={selectedKeys}
									baselineKeys={baselineKeys}
									filterNeedle={filterNeedle}
									isCollapsed={collapsedModules.has(group.moduleKey)}
									disabled={disabled}
									onToggleKey={toggleKey}
									onToggleModule={toggleModule}
									onToggleCollapsed={toggleCollapsed}
								/>
							))}
						</div>
					))}
				</div>
			) : null}

			{groups.length > 0 &&
			visibleGroups.length === 0 &&
			filterNeedle.length > 0 ? (
				<p
					className="py-6 text-center text-sm text-muted-foreground"
					role="status"
				>
					{t('no-matching-permissions')}
				</p>
			) : null}
		</div>
	);
};

export { PermissionMatrix };
