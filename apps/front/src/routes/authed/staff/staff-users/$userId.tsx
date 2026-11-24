import {
	createFileRoute,
	useNavigate,
	useRouterState,
} from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import QueryDisplay from '~/components/query-display';
import { preloadRouteQueries } from '~/lib/query/route-preload';
import {
	staffUserDetailsQueryOptions,
	staffUserRolesQueryOptions,
	toStaffUserDetails,
	useStaffUserDetailsQuery,
	useStaffUserRolesQuery,
} from '~/lib/query/staff-users';

import { logger } from '@org/shared-ts/lib/logger/iso-logger';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { staffUserCrumbsBase } from './$userId/_crumbs';
import { StaffUserDetailsEmptyPayload } from './$userId/_detail-views';
import { StaffUserDetailsBody } from './$userId/_details-body';
import {
	normalizeStatus,
	STAFF_STATUS_ACTIVE,
	STAFF_STATUS_SUSPENDED,
} from './$userId/_lifecycle';
import {
	useStaffDeleteAction,
	useStaffLifecycleAction,
} from './_use-staff-user-actions';
import { StaffUserDetailsError } from './_user-details-error';

const isLogoutFailure = (failure: unknown) =>
	failure !== null && shouldLogoutForFailure(failure);

/** The page's two queries, declared once: the loader warms them and the page
 * reads the same variables. */
const staffUserQueries = ({ userId }: { userId: string }) => ({
	details: {
		options: staffUserDetailsQueryOptions,
		variables: { userId },
	},
	userRoles: {
		options: staffUserRolesQueryOptions,
		variables: { userId },
	},
});

const StaffUserDetailsPage = () => {
	const { userId } = Route.useParams();
	const { i18n } = useTranslation(['staff-users', 'common']);
	const [shouldLogout, setShouldLogout] = useState(false);
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});

	const queries = staffUserQueries({ userId });
	const detailQuery = useStaffUserDetailsQuery(queries.details.variables, {
		enabled: userId.length > 0,
	});
	const rolesQuery = useStaffUserRolesQuery(queries.userRoles.variables, {
		enabled: userId.length > 0,
	});
	const user = toStaffUserDetails(detailQuery.data);
	const normalizedStatus = normalizeStatus(user?.status);
	const canSuspend = normalizedStatus === STAFF_STATUS_ACTIVE;
	const canReactivate = normalizedStatus === STAFF_STATUS_SUSPENDED;
	const onLogout = () => setShouldLogout(true);
	const navigate = useNavigate();
	// `navigate` is a router call, so it stays in the page's event handler path
	// rather than in the data hook — same reason as `submitStaffUserEdit`.
	const onDeleted = async () => {
		try {
			await navigate({ to: '/staff/staff-users' });
		} catch (error) {
			// navigation rejection after a successful delete — don't reuse the failure message
			logger.warn('Staff user delete navigation failed', error);
		}
	};
	const lifecycle = useStaffLifecycleAction({
		userId,
		canSuspend,
		canReactivate,
		onLogout,
	});
	const deletion = useStaffDeleteAction({ userId, onLogout, onDeleted });

	// Hoisted so the fatal-error gates read plain locals, not query flags —
	// QueryDisplay owns the loading/error/data rendering below.
	const detailError = detailQuery.error;
	const rolesError = rolesQuery.error;
	if (
		shouldLogout ||
		isLogoutFailure(detailError) ||
		isLogoutFailure(rolesError)
	) {
		return <LogoutRedirect />;
	}

	return (
		<QueryDisplay
			query={detailQuery}
			ErrorSlot={
				<StaffUserDetailsError
					error={detailError}
					onRetry={() => {
						void detailQuery.refetch();
					}}
				/>
			}
		>
			{() =>
				user ? (
					<StaffUserDetailsBody
						user={user}
						userId={userId}
						locale={i18n.language}
						pathname={pathname}
						rolesQuery={rolesQuery}
						canSuspend={canSuspend}
						canReactivate={canReactivate}
						lifecycle={lifecycle}
						deletion={deletion}
					/>
				) : (
					<StaffUserDetailsEmptyPayload />
				)
			}
		</QueryDisplay>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/staff-users/$userId',
)({
	staticData: {
		i18nNamespaces: ['staff-users'],
		// Always matched alongside an index/permissions/activity/settings
		// child (never the deepest match on its own — see
		// `deriveBreadcrumbTrail`), but the contract requires every route to
		// declare its own trail. The overview base is the correct value for
		// this route's own path.
		crumbs: staffUserCrumbsBase,
	},
	loader: ({ context, params }) => {
		preloadRouteQueries(
			context.queryClient,
			staffUserQueries({ userId: params.userId }),
		);
	},
	component: StaffUserDetailsPage,
});
