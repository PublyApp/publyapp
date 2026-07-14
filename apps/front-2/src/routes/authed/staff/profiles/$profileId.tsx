import {
	IconAlertCircle,
	IconArrowLeft,
	IconBuildingBank,
	IconCalendar,
	IconChartBar,
	IconCheck,
	IconNews,
	IconSearchOff,
	IconSettings,
	IconShield,
	IconUsers,
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
import { LoadingSpinner } from '~/components/ui/loading-spinner';
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
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

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

const ProfileDetailsLoading = () => {
	const { t } = useTranslation('common');

	return (
		<div
			className="mx-auto flex min-h-[50vh] w-full items-center justify-center py-12"
			data-testid="staff-profile-details-loading"
		>
			<div className="flex items-center gap-3 text-sm text-muted-foreground">
				<LoadingSpinner />
				<span>{t('loading-staff-profile')}</span>
			</div>
		</div>
	);
};

const MissingProfileView = ({ error }: { error: unknown }) => {
	const { t } = useTranslation('common');
	const failure = toApiFailure(error);

	return (
		<AppErrorView
			icon={<IconSearchOff aria-hidden="true" className="size-7" />}
			code="404 — Not Found"
			title={t('staff-profile-not-found')}
			description={getFailureDescription(
				failure,
				t('staff-profile-not-found-description'),
			)}
			testId="staff-profile-details-not-found"
			actions={
				<Link
					to="/staff/profiles"
					className={buttonVariants({ variant: 'outline' })}
				>
					{t('back-to-staff-profiles')}
				</Link>
			}
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
	const { t } = useTranslation('common');

	if (
		isProblemStatus(error, 404) ||
		isProblemStatus(error, 400, MALFORMED_ID_TRANSLATION_KEY)
	) {
		return <MissingProfileView error={error} />;
	}

	if (isProblemStatus(error, 403)) {
		return <View403 />;
	}

	return (
		<AppErrorView
			icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
			code="500 — Server Error"
			title={t('unable-to-load-staff-profile')}
			description={t('problem-loading-staff-profile-details')}
			testId="staff-profile-details-error"
			actions={
				<>
					<Button variant="default" onClick={onRetry} type="button">
						{t('try-again')}
					</Button>
					<Link
						to="/staff/profiles"
						className={buttonVariants({ variant: 'outline' })}
					>
						{t('back-to-staff-profiles')}
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
	const { t, i18n } = useTranslation('common');

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
			shouldLogoutForFailure(permissionCatalogQuery.error)) ||
		(usersQuery.isError && shouldLogoutForFailure(usersQuery.error))
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
				title={t('staff-profile-not-found')}
				description={t('staff-profile-payload-empty')}
				testId="staff-profile-details-empty"
				actions={
					<Link
						to="/staff/profiles"
						className={buttonVariants({ variant: 'outline' })}
					>
						{t('back-to-staff-profiles')}
					</Link>
				}
			/>
		);
	}

	const assignedKeys = permissionKeysQuery.data.permissionKeys ?? [];
	const catalog = (permissionCatalogQuery.data?.additionalData ?? undefined) as
		| StaffPermissionCatalog
		| undefined;
	const userRows = toStaffProfileUserRows(usersQuery.data?.users);
	const usersFailure = usersQuery.isError
		? toApiFailure(usersQuery.error)
		: null;
	const hasUsersData = !usersQuery.isPending && !usersQuery.isError;
	const userCount = details.userAccountCount;
	const membersCardContent = (() => {
		if (usersFailure) {
			if (usersFailure.kind === 'problem' && usersFailure.status === 403) {
				return (
					<div className="px-[18px] py-8 text-center text-[13px] text-muted-foreground">
						{t('no-permission-to-view-assigned-users')}
					</div>
				);
			}

			return (
				<div className="flex flex-col gap-2 px-[18px] py-8 text-[13px] text-muted-foreground">
					<p>{t('problem-loading-staff-profile-details')}</p>
					<Button
						type="button"
						onClick={() => void usersQuery.refetch()}
						className="h-8 w-max"
					>
						{t('try-again')}
					</Button>
				</div>
			);
		}

		if (usersQuery.isPending) {
			return (
				<div className="px-[18px] py-8 text-center text-[13px] text-muted-foreground">
					{t('loading-staff-profile')}
				</div>
			);
		}

		if (hasUsersData && userRows.length === 0) {
			return (
				<div className="px-[18px] py-8 text-center text-[13px] text-muted-foreground">
					{t('no-members-yet')}
				</div>
			);
		}

		return userRows.slice(0, 5).map((user) => (
			<div
				key={user.id}
				className="flex items-center gap-[11px] px-[18px] py-[11px] border-b border-[var(--publy-row-border)] last:border-b-0"
			>
				<InitialsAvatar
					name={
						[user.firstName, user.lastName].filter(Boolean).join(' ') ||
						user.email
					}
				/>
				<div className="flex flex-col gap-px min-w-0">
					<span className="text-[13px] font-medium truncate">
						{[user.firstName, user.lastName].filter(Boolean).join(' ') ||
							user.email}
					</span>
				</div>
			</div>
		));
	})();
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
			<div className="mb-4">
				<Link to="/staff/profiles" className="publy-back-link">
					<IconArrowLeft aria-hidden="true" className="size-3" />
					{t('back-to-profiles')}
				</Link>
			</div>

			{/* Identity Header */}
			<div
				className="flex items-start justify-between gap-4 mb-8"
				data-testid="staff-profile-identity-header"
			>
				<div className="flex min-w-0 items-center gap-4">
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
					<div className="flex min-w-0 flex-col gap-[5px]">
						<div className="flex min-w-0 items-center gap-2.5">
							<h1
								className="publy-type-detail-title min-w-0 truncate"
								title={details.name || undefined}
							>
								{details.name}
							</h1>
							<span className="publy-detail-chip publy-detail-chip--outline shrink-0">
								{t('profile')}
							</span>
						</div>
						<div className="flex min-w-0 items-center gap-1 text-[13px] text-[var(--publy-foreground-muted)]">
							<span
								className="min-w-0 truncate"
								title={details.description || undefined}
							>
								{details.description || t('no-description')}
							</span>
							<span className="shrink-0 whitespace-nowrap">
								{details.userAccountCount === null ? null : (
									<>
										{' · '}
										{t('profile-member-count', {
											count: details.userAccountCount,
										})}
									</>
								)}
								{' · '}
								{t('assigned-permissions-count', {
									count: assignedKeys.length,
								})}
							</span>
						</div>
					</div>
				</div>
				<div className="flex items-center gap-2.5">
					<Link
						to="/staff/profiles/$profileId/users"
						params={{ profileId }}
						className="inline-flex items-center gap-1.5 rounded-[var(--publy-radius-control)] border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
					>
						{t('view-all-assigned-users')}
					</Link>
				</div>
			</div>

			<DetailGrid>
				<DetailMain>
					{/* Permissions in this profile */}
					<Card className="publy-detail-card">
						<div className="publy-detail-card-header">
							<span className="text-[14px] font-semibold">
								{t('permissions-in-this-profile')}
							</span>
						</div>
						{assignedKeys.length === 0 ? (
							<div className="px-[18px] py-8 text-center text-[13px] text-muted-foreground">
								{t('no-permissions-assigned-to-profile')}
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
							<span className="text-[14px] font-semibold">{t('about')}</span>
						</div>
						<div className="publy-detail-card-body">
							<div className="publy-detail-row">
								<span className="publy-type-metadata-label">
									{t('profile-id')}
								</span>
								<span className="font-mono text-[12px] text-[var(--publy-foreground-secondary)]">
									{details.id}
								</span>
							</div>
							<div className="publy-detail-row">
								<span className="publy-type-metadata-label">
									{t('permissions')}
								</span>
								<span className="text-[12px] font-medium">
									{catalogPermCount > 0
										? t('permissions-of-total-granted', {
												count: assignedKeys.length,
												total: catalogPermCount,
											})
										: assignedKeys.length}
								</span>
							</div>
						</div>
					</Card>

					{/* Members Card */}
					<Card className="publy-detail-card">
						<div className="publy-detail-card-header">
							<span className="text-[14px] font-semibold">
								{t('members')}
								{userCount === null ? null : (
									<span className="font-normal text-[var(--publy-foreground-subtle)]">
										{' '}
										· {userCount}
									</span>
								)}
							</span>
							<Link
								to="/staff/profiles/$profileId/users"
								params={{ profileId }}
								className="text-[12px] no-underline text-[var(--publy-foreground-muted)]"
							>
								{t('view-all')}
							</Link>
						</div>
						<div className="flex flex-col">{membersCardContent}</div>
					</Card>
				</DetailAside>
			</DetailGrid>
		</div>
	);
}
