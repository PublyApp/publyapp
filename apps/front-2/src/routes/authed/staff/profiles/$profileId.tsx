import {
	IconAlertCircle,
	IconBuildingBank,
	IconCalendar,
	IconChartBar,
	IconCheck,
	IconDots,
	IconNews,
	IconPencil,
	IconSearchOff,
	IconSettings,
	IconShield,
	IconUsers,
	IconUsersPlus,
	IconWorld,
} from '@tabler/icons-react';
import type { Icon } from '@tabler/icons-react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { View403 } from '~/components/error-views/View403';
import { Button, buttonVariants } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import {
	DetailAside,
	DetailGrid,
	DetailMain,
} from '~/components/ui/detail-layout';
import { InitialsAvatar } from '~/components/ui/initials-avatar';
import {
	useStaffProfileUsersQuery,
	toStaffProfileUserRows,
} from '~/lib/query/staff-profile-users';
import {
	type StaffPermissionCatalog,
	toStaffProfileDetails,
	useStaffPermissionCatalogQuery,
	useStaffProfileDetailsQuery,
	useStaffProfilePermissionKeysQuery,
} from '~/lib/query/staff-profiles';
import { shouldLogoutForFailure } from '~/routes/authed/layout';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

const PROFILE_ICON_MAP: Record<string, Icon> = {
	news: IconNews,
	calendar: IconCalendar,
	shield: IconShield,
	'building-bank': IconBuildingBank,
	users: IconUsers,
	settings: IconSettings,
	'chart-bar': IconChartBar,
	world: IconWorld,
};

const MALFORMED_ID_TRANSLATION_KEY = 'malformed-id';

const isProblemStatus = (
	error: unknown,
	status: number,
	translationKey?: string,
): boolean => {
	const failure = toApiFailure(error);

	if (failure.kind !== 'problem' || failure.status !== status) {
		return false;
	}

	return (
		translationKey === undefined || failure.translationKey === translationKey
	);
};

const getFailureDescription = (
	failure: ReturnType<typeof toApiFailure>,
	fallback: string,
): string => {
	if (failure.kind === 'problem') {
		return failure.detail || fallback;
	}

	return fallback;
};

const ProfileDetailsLoading = () => (
	<div
		className="mx-auto flex min-h-[50vh] w-full items-center justify-center py-12"
		data-testid="staff-profile-details-loading"
	>
		<div className="flex items-center gap-3 text-sm text-muted-foreground">
			<span
				role="status"
				aria-label="Loading"
				className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground"
			/>
			<span>Loading staff profile…</span>
		</div>
	</div>
);

const InvalidProfileView = ({ error }: { error: unknown }) => {
	const failure = toApiFailure(error);

	return (
		<AppErrorView
			icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
			code="400 — Bad Request"
			title="Invalid profile link"
			description={getFailureDescription(
				failure,
				'This staff profile link is malformed or incomplete.',
			)}
			testId="staff-profile-details-invalid"
		/>
	);
};

const MissingProfileView = ({ error }: { error: unknown }) => {
	const failure = toApiFailure(error);

	return (
		<AppErrorView
			icon={<IconSearchOff aria-hidden="true" className="size-7" />}
			code="404 — Not Found"
			title="Staff profile not found"
			description={getFailureDescription(
				failure,
				'The requested staff profile does not exist or is no longer available.',
			)}
			testId="staff-profile-details-not-found"
		/>
	);
};

const ProfileDetailsError = ({
	error,
	onRetry,
}: {
	error: unknown;
	onRetry: () => void;
}) => {
	if (isProblemStatus(error, 400, MALFORMED_ID_TRANSLATION_KEY)) {
		return <InvalidProfileView error={error} />;
	}

	if (isProblemStatus(error, 403)) {
		return <View403 />;
	}

	if (isProblemStatus(error, 404)) {
		return <MissingProfileView error={error} />;
	}

	return (
		<AppErrorView
			icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
			code="500 — Server Error"
			title="Unable to load this staff profile"
			description="There was a problem loading the profile details."
			testId="staff-profile-details-error"
			actions={
				<>
					<Button variant="default" onClick={onRetry} type="button">
						Try again
					</Button>
					<Link
						to="/staff/profiles"
						className={buttonVariants({ variant: 'outline' })}
					>
						Back to staff profiles
					</Link>
				</>
			}
		/>
	);
};

function PermissionMatrix({
	assignedKeys,
	catalog,
}: {
	assignedKeys: string[];
	catalog: StaffPermissionCatalog | undefined;
}) {
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
}

function PermGroup({
	group,
	assignedKeys,
}: {
	group: {
		key: string;
		label: string;
		permissions: { key: string; name: string; description: string | null }[];
	};
	assignedKeys: string[];
}) {
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
}

export const Route = createFileRoute(
	'/_authed-layout/staff/profiles/$profileId',
)({
	component: StaffProfileDetailsPage,
});

function StaffProfileDetailsPage() {
	const { profileId } = Route.useParams();
	const { i18n } = useTranslation('common');

	const detailQuery = useStaffProfileDetailsQuery({ profileId });
	const permissionKeysQuery = useStaffProfilePermissionKeysQuery({ profileId });
	const permissionCatalogQuery = useStaffPermissionCatalogQuery({
		language: i18n.language,
	});
	const usersQuery = useStaffProfileUsersQuery({ profileId, size: 5 });

	if (
		(detailQuery.isError && shouldLogoutForFailure(detailQuery.error)) ||
		(permissionKeysQuery.isError &&
			shouldLogoutForFailure(permissionKeysQuery.error)) ||
		(permissionCatalogQuery.isError &&
			shouldLogoutForFailure(permissionCatalogQuery.error))
	) {
		return <LogoutRedirect />;
	}

	if (detailQuery.isPending || permissionKeysQuery.isPending) {
		return <ProfileDetailsLoading />;
	}

	if (detailQuery.isError) {
		return (
			<ProfileDetailsError
				error={detailQuery.error}
				onRetry={() => void detailQuery.refetch()}
			/>
		);
	}

	if (permissionKeysQuery.isError) {
		return (
			<ProfileDetailsError
				error={permissionKeysQuery.error}
				onRetry={() => void permissionKeysQuery.refetch()}
			/>
		);
	}

	if (permissionCatalogQuery.isError) {
		return (
			<ProfileDetailsError
				error={permissionCatalogQuery.error}
				onRetry={() => void permissionCatalogQuery.refetch()}
			/>
		);
	}

	const details = toStaffProfileDetails(detailQuery.data);
	if (!details) {
		return (
			<AppErrorView
				icon={<IconSearchOff aria-hidden="true" className="size-7" />}
				code="404 — Not Found"
				title="Staff profile not found"
				description="The profile payload was empty."
				testId="staff-profile-details-empty"
			/>
		);
	}

	const assignedKeys = permissionKeysQuery.data.permissionKeys ?? [];
	const catalog = (permissionCatalogQuery.data?.additionalData ?? undefined) as
		| StaffPermissionCatalog
		| undefined;
	const userRows = toStaffProfileUserRows(usersQuery.data?.users);
	const userCount = details.userAccountCount;
	let catalogPermCount = 0;
	if (catalog) {
		for (const module of Object.values(catalog)) {
			catalogPermCount += Object.keys(module).length;
		}
	}

	return (
		<div
			className="publy-detail-page publy-page-fill"
			data-testid="staff-profile-details-page"
		>
			{/* Identity Header */}
			<div className="flex items-start justify-between gap-4 mb-8">
				<div className="flex items-center gap-4">
					<div
						className="publy-profile-detail-tile"
						data-tone={details.iconTone}
					>
						{(() => {
							const IconComponent = PROFILE_ICON_MAP[details.icon];
							return IconComponent ? (
								<IconComponent className="size-[26px]" />
							) : null;
						})()}
					</div>
					<div className="flex flex-col gap-[5px]">
						<div className="flex items-center gap-2.5">
							<h1 className="publy-type-detail-title">{details.name}</h1>
							<span className="publy-detail-chip publy-detail-chip--outline">
								Profile
							</span>
							<span className="publy-detail-chip publy-detail-chip--amber">
								Custom
							</span>
						</div>
						<p className="text-[13px] text-[var(--publy-foreground-muted)]">
							{details.description ?? 'No description'}
							{' · '}
							{details.userAccountCount === null
								? '—'
								: `${details.userAccountCount} member${details.userAccountCount !== 1 ? 's' : ''}`}
							{' · '}
							{assignedKeys.length} permissions
						</p>
					</div>
				</div>
				<div className="flex items-center gap-2.5">
					<Button variant="outline" size="sm" className="gap-1.5">
						<IconUsersPlus className="size-4" />
						Assign to users
					</Button>
					<Button variant="outline" size="sm" className="gap-1.5">
						<IconPencil className="size-4" />
						Edit
					</Button>
					<Button variant="outline" size="icon-sm" aria-label="More actions">
						<IconDots className="size-4" />
					</Button>
				</div>
			</div>

			<DetailGrid>
				<DetailMain>
					{/* Permissions in this profile */}
					<Card className="publy-detail-card">
						<div className="publy-detail-card-header">
							<span className="text-[14px] font-semibold">
								Permissions in this profile
							</span>
							<Link
								to="/staff/profiles"
								className="text-[12px] no-underline inline-flex items-center gap-[5px] text-[var(--publy-foreground-muted)]"
							>
								<IconPencil className="size-[13px]" />
								Edit permissions
							</Link>
						</div>
						{assignedKeys.length === 0 ? (
							<div className="px-[18px] py-8 text-center text-[13px] text-muted-foreground">
								No permissions are assigned to this profile.
							</div>
						) : (
							<PermissionMatrix assignedKeys={assignedKeys} catalog={catalog} />
						)}
					</Card>
				</DetailMain>

				<DetailAside className="flex flex-col gap-5">
					{/* About Card */}
					<Card className="publy-detail-card">
						<div className="publy-detail-card-header">
							<span className="text-[14px] font-semibold">About</span>
						</div>
						<div className="publy-detail-card-body">
							<div className="publy-detail-row">
								<span className="publy-type-metadata-label">Type</span>
								<span className="publy-detail-chip publy-detail-chip--amber">
									Custom
								</span>
							</div>
							<div className="publy-detail-row">
								<span className="publy-type-metadata-label">Profile ID</span>
								<span className="font-mono text-[12px] text-[var(--publy-foreground-secondary)]">
									{details.id}
								</span>
							</div>
							<div className="publy-detail-row">
								<span className="publy-type-metadata-label">Created</span>
								<span className="text-[12px] font-medium text-muted-foreground">
									{/* TODO(contract): created_at not in profile detail response */}
									—
								</span>
							</div>
							<div className="publy-detail-row">
								<span className="publy-type-metadata-label">Last updated</span>
								<span className="text-[12px] font-medium text-muted-foreground">
									{/* TODO(contract): updated_at not in profile detail response */}
									—
								</span>
							</div>
							<div className="publy-detail-row">
								<span className="publy-type-metadata-label">Permissions</span>
								<span className="text-[12px] font-medium">
									{assignedKeys.length}
									{catalogPermCount > 0
										? ` of ${catalogPermCount} granted`
										: ''}
								</span>
							</div>
						</div>
					</Card>

					{/* Members Card */}
					<Card className="publy-detail-card">
						<div className="publy-detail-card-header">
							<span className="text-[14px] font-semibold">
								Members{' '}
								<span className="font-normal text-[var(--publy-foreground-subtle)]">
									· {userCount === null ? '—' : userCount}
								</span>
							</span>
							<Link
								to="/staff/profiles"
								className="text-[12px] no-underline text-[var(--publy-foreground-muted)]"
							>
								View all
							</Link>
						</div>
						<div className="flex flex-col">
							{userRows.length === 0 ? (
								<div className="px-[18px] py-8 text-center text-[13px] text-muted-foreground">
									No members yet.
								</div>
							) : (
								userRows.slice(0, 5).map((user) => (
									<div
										key={user.id}
										className="flex items-center gap-[11px] px-[18px] py-[11px] border-b border-[var(--publy-row-border)] last:border-b-0"
									>
										<InitialsAvatar
											name={
												[user.firstName, user.lastName]
													.filter(Boolean)
													.join(' ') || user.email
											}
										/>
										<div className="flex flex-col gap-px min-w-0">
											<span className="text-[13px] font-medium truncate">
												{[user.firstName, user.lastName]
													.filter(Boolean)
													.join(' ') || user.email}
											</span>
											<span className="text-[12px] text-[var(--publy-foreground-muted)]">
												{/* TODO(contract): role not in StaffProfileUserItem */}
												Member
											</span>
										</div>
										<span className="publy-detail-chip publy-detail-chip--outline ml-auto">
											{/* TODO(contract): role not in StaffProfileUserItem */}—
										</span>
									</div>
								))
							)}
						</div>
					</Card>
				</DetailAside>
			</DetailGrid>
		</div>
	);
}
