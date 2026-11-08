import { IconAlertCircle } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { View403 } from '~/components/error-views/View403';
import QueryDisplay, {
	type QueryDisplayQuery,
} from '~/components/query-display';
import { LoadingSpinner } from '~/components/ui/loading-spinner';
import { PersonAvatar } from '~/components/ui/person-avatar';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/tabs';
import {
	toGlobalTenantUserDetails,
	useGlobalTenantUserDetailsQuery,
} from '~/lib/query/staff-global-tenant-users';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { formatGlobalTenantUserStatusLabel } from './_tenant-user-status-label';

/**
 * The details query's error surface: a 404 (or a malformed id) is "not found",
 * a 403 is "forbidden", anything else is a retryable load failure.
 */
const renderDetailsError = (
	error: unknown,
	onRetry: () => void,
	t: (key: string) => string,
): ReactNode => {
	const failure = toApiFailure(error);
	const problemStatus = failure.kind === 'problem' ? failure.status : undefined;
	const isNotFound =
		problemStatus === 404 ||
		(problemStatus === 400 &&
			failure.kind === 'problem' &&
			failure.translationKey === 'malformed-id');

	if (isNotFound) {
		return (
			<AppErrorView
				icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
				code={t('error-404-code')}
				title={t('tenant-user-not-found-title')}
				description={getFailureMessage(failure, {
					fallback: t('tenant-user-not-found-description'),
				})}
				testId="tenant-user-details-not-found"
			/>
		);
	}

	if (problemStatus === 403) {
		return <View403 />;
	}

	return (
		<AppErrorView
			icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
			code={t('error-500-code')}
			title={t('unable-to-load-tenant-user')}
			description={getFailureMessage(failure, {
				fallback: t('tenant-user-not-found-description'),
			})}
			testId="tenant-user-details-error"
			onRetry={onRetry}
		/>
	);
};

/**
 * Shared chrome for the GLOBAL staff tenant-user detail tabs. The two tab
 * routes are FLAT siblings under `/staff/tenant-users/details/$userId/*`
 * (the parent path is a redirect-only bookmark stub), so this component
 * carries everything they share: the details query and its error states, the
 * identity header, and the tab strip. Each tab renders through the
 * `children` render-prop once the details have resolved.
 */
export const TenantUserDetailsShell = ({
	userId,
	activeTab,
	children,
}: {
	userId: string;
	activeTab: 'general' | 'organizations';
	children: ReactNode;
}) => {
	const { t } = useTranslation('common');
	const detailsQuery = useGlobalTenantUserDetailsQuery(
		{ userId },
		{ enabled: userId.length > 0 },
	);

	// Hoisted so the fatal gate reads a plain local, not a query flag.
	const detailsError = detailsQuery.error;
	if (detailsError !== null && shouldLogoutForFailure(detailsError)) {
		return <LogoutRedirect />;
	}

	const user = toGlobalTenantUserDetails(detailsQuery.data);
	// `QueryDisplay` reads emptiness from `data`; hand it the mapped user so a
	// payload without its required identity lands in the empty slot.
	const stateQuery: QueryDisplayQuery = { ...detailsQuery, data: user };
	const emptyNode = (
		<AppErrorView
			icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
			code={t('error-404-code')}
			title={t('tenant-user-not-found-title')}
			description={t('tenant-user-payload-empty')}
			testId="tenant-user-details-empty"
		/>
	);

	return (
		<QueryDisplay
			query={stateQuery}
			LoadingSlot={
				<div className="mx-auto flex min-h-[50vh] w-full max-w-5xl items-center justify-center px-4 py-12">
					<div className="flex items-center gap-3 text-sm text-muted-foreground">
						<LoadingSpinner />
						<span data-testid="tenant-user-details-loading">
							{t('loading-tenant-user')}
						</span>
					</div>
				</div>
			}
			ErrorSlot={renderDetailsError(
				detailsError,
				() => void detailsQuery.refetch(),
				t,
			)}
			EmptySlot={emptyNode}
		>
			{() => {
				// A payload without its required identity is not a renderable
				// user: it lands on the same empty-payload view as a null body.
				if (!user) {
					return emptyNode;
				}

				return (
					<div
						className="publy-detail-page space-y-5"
						data-testid="tenant-user-details-page"
					>
						<div
							className="space-y-1"
							data-testid="tenant-user-details-heading"
						>
							<div className="flex items-start gap-3">
								<div className="h-14 w-14">
									<PersonAvatar
										name={user.displayName}
										avatarUrl={user.avatarUrl}
										size="lg"
									/>
								</div>
								<div className="min-w-0">
									<div className="flex flex-wrap items-center gap-2">
										<h1 className="text-[22px] font-semibold leading-7 tracking-[-0.01em] text-foreground">
											{user.displayName}
										</h1>
										{user.status ? (
											<StatusPill tone={statusPillTone(user.status)}>
												{formatGlobalTenantUserStatusLabel(user.status, t)}
											</StatusPill>
										) : null}
									</div>
									<p className="max-w-3xl text-[13px] text-muted-foreground">
										{user.email}
									</p>
								</div>
							</div>

							<Tabs value={activeTab}>
								<TabsList variant="line">
									<TabsTrigger
										value="general"
										render={
											<Link
												to="/staff/tenant-users/details/$userId/general"
												params={{ userId }}
											/>
										}
									>
										{t('general')}
									</TabsTrigger>
									<TabsTrigger
										value="organizations"
										render={
											<Link
												to="/staff/tenant-users/details/$userId/organizations"
												params={{ userId }}
											/>
										}
									>
										{t('organizations')}
									</TabsTrigger>
								</TabsList>
							</Tabs>
						</div>

						{children}
					</div>
				);
			}}
		</QueryDisplay>
	);
};
