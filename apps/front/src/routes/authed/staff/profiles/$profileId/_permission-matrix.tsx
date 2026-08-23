import { IconCheck } from '@tabler/icons-react';
import { useMemo } from 'react';
import type { StaffPermissionCatalog } from '~/lib/query/staff-profiles';

// Extracted from the details route so the route file stays component-only
// for Fast Refresh (react-doctor `no-multi-component-file`).
export const PermissionMatrix = ({
	assignedKeys,
	catalog,
}: {
	assignedKeys: string[];
	catalog: StaffPermissionCatalog | undefined;
}) => {
	const allPermissions = useMemo(() => {
		const entries: {
			key: string;
			name: string;
			description: string | null;
			groupKey: string;
			groupLabel: string;
		}[] = [];

		for (const [moduleKey, permissions] of Object.entries(catalog ?? {})) {
			const groupLabel = moduleKey
				.trim()
				.replace(/[_-]+/g, ' ')
				.replace(/\b\w/g, (c) => c.toUpperCase());

			for (const perm of Object.values(permissions)) {
				if (typeof perm !== 'object' || perm === null) {
					continue;
				}
				const key = perm.key?.trim();
				if (!key) {
					continue;
				}

				entries.push({
					key,
					name: perm.name?.trim() ?? key,
					description: perm.description ?? null,
					groupKey: moduleKey,
					groupLabel,
				});
			}
		}

		for (const key of assignedKeys) {
			if (!entries.some((e) => e.key === key)) {
				const dotIdx = key.indexOf('.');
				const groupKey = dotIdx > 0 ? key.slice(0, dotIdx) : key;
				const groupLabel = groupKey
					.replace(/[_-]+/g, ' ')
					.replace(/\b\w/g, (c) => c.toUpperCase());
				entries.push({
					key,
					name: key,
					description: null,
					groupKey,
					groupLabel,
				});
			}
		}

		return entries;
	}, [assignedKeys, catalog]);

	const groups = useMemo(() => {
		const map = new Map<string, typeof allPermissions>();
		for (const entry of allPermissions) {
			const group = map.get(entry.groupKey) ?? [];
			group.push(entry);
			map.set(entry.groupKey, group);
		}

		const result = Array.from(map.entries()).map(([key, permissions]) => ({
			key,
			label: permissions[0]?.groupLabel ?? key,
			permissions,
		}));

		result.sort((a, b) => a.label.localeCompare(b.label));
		return result;
	}, [allPermissions]);

	let totalLines = 0;
	for (const g of groups) {
		totalLines += g.permissions.length + 1;
	}

	const midpoint = Math.ceil(totalLines / 2);
	let accumulated = 0;
	const leftGroups: typeof groups = [];
	const rightGroups: typeof groups = [];

	for (const group of groups) {
		const groupSize = group.permissions.length + 1;
		if (accumulated < midpoint) {
			leftGroups.push(group);
		} else {
			rightGroups.push(group);
		}
		accumulated += groupSize;
	}

	return (
		<div className="publy-perm-matrix">
			<div className="publy-perm-matrix-col">
				{leftGroups.map((group) => (
					<PermGroup
						key={group.key}
						group={group}
						assignedKeys={assignedKeys}
					/>
				))}
			</div>
			<div className="publy-perm-matrix-col">
				{rightGroups.map((group) => (
					<PermGroup
						key={group.key}
						group={group}
						assignedKeys={assignedKeys}
					/>
				))}
			</div>
		</div>
	);
};

const PermGroup = ({
	group,
	assignedKeys,
}: {
	group: {
		key: string;
		label: string;
		permissions: { key: string; name: string; description: string | null }[];
	};
	assignedKeys: string[];
}) => {
	const assignedSet = useMemo(() => new Set(assignedKeys), [assignedKeys]);

	return (
		<div>
			<div className="publy-perm-group-header">
				<span className="text-[13px] font-semibold">{group.label}</span>
				<span className="text-[11px] text-[var(--publy-foreground-subtle)]">
					{group.permissions.length}
				</span>
			</div>
			{group.permissions.map((perm) => {
				const isAssigned = assignedSet.has(perm.key);
				return (
					<div key={perm.key} className="publy-perm-row">
						<div
							className={`publy-perm-check ${
								isAssigned ? 'publy-perm-check--granted' : ''
							}`}
						>
							{isAssigned ? <IconCheck className="size-[10px]" /> : null}
						</div>
						<span
							className="publy-perm-key"
							title={perm.description ?? undefined}
						>
							{perm.key}
						</span>
					</div>
				);
			})}
		</div>
	);
};
