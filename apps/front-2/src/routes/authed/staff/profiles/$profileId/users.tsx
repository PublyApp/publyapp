import {
	IconAlertCircle,
	IconArrowLeft,
	IconSearchOff,
} from '@tabler/icons-react';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { View403 } from '~/components/error-views/View403';
import { DataTable } from '~/components/table/data-table';
import { useTableController } from '~/components/table/use-table-controller';
import { Button, buttonVariants } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { LoadingSpinner } from '~/components/ui/loading-spinner';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import {
	toStaffProfileUserRows,
	useStaffProfileUsersQuery,
} from '~/lib/query/staff-profile-users';
import {
	toStaffProfileDetails,
	useStaffProfileDetailsQuery,
} from '~/lib/query/staff-profiles';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';
import {
	parseTableSearchParams,
	serializeTableSearchParams,
} from '~/lib/url-state/table-search-params';
import type {
	TableSearchParamInput,
	TableSearchParams,
} from '~/lib/url-state/table-search-params';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';
import { getUserFullName } from '@org/shared-ts/utils/user.utils';

import { formatStaffStatusLabel } from '../../staff-users/status-labels';

const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 100;
const MALFORMED_ID_TRANSLATION_KEY = 'malformed-id';

export const buildColumns = (
	t: (key: string, options?: Record<string, unknown>) => string,
): ColumnDef<ReturnType<typeof toStaffProfileUserRows>[number]>[] => [
	{
		id: 'name',
		header: t('name'),
		enableSorting: false,
		cell: ({ row }) => (
			<Link
				to="/staff/staff-users/$userId"
				params={{ userId: row.original.id }}
				className="publy-record-link"
			>
				<div className="space-y-1">
					<p className="font-medium text-foreground">
						{getUserFullName({
							firstName: row.original.firstName,
							lastName: row.original.lastName,
						}) ||
							row.original.email ||
							t('no-email-address')}
					</p>
					<p className="text-xs text-muted-foreground">
						{row.original.email || t('no-email-address')}
					</p>
				</div>
			</Link>
		),
	},
	{
		id: 'status',
		header: t('status'),
		accessorKey: 'status',
		meta: { width: '122px' },
		cell: ({ getValue }) => {
			const status = getValue<string | null>();

			return (
				<StatusPill tone={statusPillTone(status)}>
					{formatStaffStatusLabel(status, t)}
				</StatusPill>
			);
		},
	},
];

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
			className="mx-auto flex min-h-[50vh] w-full max-w-5xl items-center justify-center px-4 py-12"
			data-testid="staff-profile-users-loading"
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
			code={t('error-404-code')}
			title={t('staff-profile-not-found')}
			description={getFailureDescription(
				failure,
				t('staff-profile-not-found-description'),
			)}
			testId="staff-profile-users-not-found"
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
			code={t('error-500-code')}
			title={t('unable-to-load-staff-profile')}
			description={t('problem-loading-staff-profile-details')}
			testId="staff-profile-users-error"
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

export const Route = createFileRoute(
	'/_authed-layout/staff/profiles/$profileId/users',
)({
	validateSearch: (search) =>
		parseTableSearchParams(search as TableSearchParamInput),
	component: StaffProfileUsersPage,
});

function StaffProfileUsersPage() {
	const navigate = Route.useNavigate();
	const { profileId } = Route.useParams();
	const search = Route.useSearch();
	const { t } = useTranslation('common');
	const [pageIndex, setPageIndex] = useState(0);
	const onSearchChange = (next: TableSearchParams): void => {
		void navigate({
			search: serializeTableSearchParams(next) as unknown as TableSearchParams,
			replace: true,
		});
	};
	const controller = useTableController({
		search,
		onSearchChange,
		defaultSort: DEFAULT_SORT,
		defaultSize: DEFAULT_SIZE,
	});
	const detailQuery = useStaffProfileDetailsQuery({ profileId });
	const usersQuery = useStaffProfileUsersQuery(
		{
			profileId,
			q: controller.search.committed,
			sortId: controller.sort.id,
			sortOrder: controller.sort.order,
			pageIndex,
			size: controller.size,
		},
		{ enabled: profileId.length > 0 },
	);
	const rows = toStaffProfileUserRows(usersQuery.data?.users);
	const columns = useMemo(() => buildColumns(t), [t]);
	const details = toStaffProfileDetails(detailQuery.data);

	useEffect(() => {
		setPageIndex(0);
	}, [
		profileId,
		controller.search.committed,
		controller.sort.id,
		controller.sort.order,
		controller.size,
	]);

	useEffect(() => {
		const totalCount = usersQuery.data?.count ?? 0;
		const lastPageIndex =
			totalCount > 0
				? Math.max(Math.ceil(totalCount / controller.size) - 1, 0)
				: 0;

		if (pageIndex > lastPageIndex) {
			setPageIndex(lastPageIndex);
		}
	}, [controller.size, pageIndex, usersQuery.data?.count]);

	if (
		(detailQuery.isError && shouldLogoutForFailure(detailQuery.error)) ||
		(usersQuery.isError && shouldLogoutForFailure(usersQuery.error))
	) {
		return <LogoutRedirect />;
	}

	if (detailQuery.isPending) {
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

	if (!details) {
		return (
			<AppErrorView
				icon={<IconSearchOff aria-hidden="true" className="size-7" />}
				code={t('error-404-code')}
				title={t('staff-profile-not-found')}
				description={t('staff-profile-payload-empty')}
				testId="staff-profile-users-empty"
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

	const hasPreviousPage = pageIndex > 0;
	const hasNextPage =
		(pageIndex + 1) * controller.size < (usersQuery.data?.count ?? 0);
	const usersFailure = usersQuery.isError
		? toApiFailure(usersQuery.error)
		: null;

	return (
		<div
			className="mx-auto w-full max-w-5xl space-y-6"
			data-testid="staff-profile-users-page"
		>
			<div className="space-y-4">
				<div className="space-y-2">
					<Link to="/staff/profiles" className="publy-back-link">
						<IconArrowLeft aria-hidden="true" className="size-3" />
						{t('back-to-staff-profiles')}
					</Link>
					<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
						<div className="space-y-2">
							<p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
								{t('staff-profile')}
							</p>
							<h1 className="text-3xl font-semibold tracking-tight text-foreground">
								{details.name}
							</h1>
							<p className="max-w-2xl text-sm text-muted-foreground">
								{t('assigned-users-for-this-staff-profile')}
							</p>
						</div>
						<div className="rounded-large border border-border bg-card p-4">
							<p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
								{t('assigned-users')}
							</p>
							<p className="mt-2 text-2xl font-semibold text-foreground">
								{details.userAccountCount}
							</p>
						</div>
					</div>
				</div>

				<Tabs value="users">
					<TabsList variant="line" aria-label={t('staff-profile-sections')}>
						<TabsTrigger
							value="basics"
							render={
								<Link to="/staff/profiles/$profileId" params={{ profileId }} />
							}
						>
							{t('basics')}
						</TabsTrigger>
						<TabsTrigger value="users">{t('users')}</TabsTrigger>
					</TabsList>

					<TabsContent value="users">
						<Card className="space-y-4 p-5">
							<div className="space-y-1">
								<p className="text-lg font-semibold text-foreground">
									{t('assigned-users')}
								</p>
								<p className="text-sm text-muted-foreground">
									{t('staff-profile-users-description')}
								</p>
							</div>

							<DataTable
								testId="staff-profile-users-table"
								ariaLabel={t('assigned-staff-profile-users')}
								columns={columns}
								rows={rows}
								isPending={usersQuery.isPending}
								isError={usersQuery.isError}
								onRetry={() => void usersQuery.refetch()}
								errorContent={
									usersFailure?.kind === 'problem' &&
									usersFailure.status === 403 ? (
										<p className="text-sm text-muted-foreground">
											{t('no-permission-to-view-assigned-users')}
										</p>
									) : undefined
								}
								emptyContent={t('no-users-assigned-to-profile')}
								noMatchContent={t('no-assigned-users-match-search')}
								hasActiveSearch={Boolean(controller.search.committed)}
								sort={controller.sort}
								onSortChange={controller.onSortChange}
								size={controller.size}
								onSizeChange={controller.onSizeChange}
								pageIndex={pageIndex}
								hasPreviousPage={hasPreviousPage}
								hasNextPage={hasNextPage}
								isPaginationPending={
									usersQuery.isFetching && !usersQuery.isPending
								}
								onNextPage={() => {
									if (hasNextPage) {
										setPageIndex((current) => current + 1);
									}
								}}
								onPreviousPage={() => {
									if (hasPreviousPage) {
										setPageIndex((current) => Math.max(current - 1, 0));
									}
								}}
								searchDraft={controller.search.draft}
								onSearchDraftChange={controller.search.onDraftChange}
							/>
						</Card>
					</TabsContent>
				</Tabs>
			</div>
		</div>
	);
}
