import { useQuery } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';

import type { ApiClient } from '@org/client-ts/apiClient';
import type {
	FindTopOrganisationsForStaffResponse,
	GetDashboardSeriesForStaffResponse,
} from '@org/client-ts/models/index';
import { buildStaffQueryOptions } from '@org/shared-ts/lib/query/create-hooks';

/** The only series the staff dashboard endpoint serves (#2348). The
 * `active_tenants` metric answers 422: organisations store their current
 * status only, so no honest past daily count exists. */
export type StaffDashboardMetric = 'audit_events';

export type StaffDashboardSeriesVariables = {
	metric: StaffDashboardMetric;
	startDate: string;
	endDate: string;
};

export type StaffDashboardTopOrganisationsVariables = {
	startDate: string;
	endDate: string;
	size?: number;
};

/** @internal Unscoped — `scopedKey('staff', …)` builds the invalidation key. */
export const STAFF_DASHBOARD_QUERY_KEY = ['staff-dashboard'] as const;

export const staffDashboardSeriesQueryOptions = buildStaffQueryOptions<
	ApiClient,
	GetDashboardSeriesForStaffResponse,
	StaffDashboardSeriesVariables
>(
	{
		queryKeyFn: () => [...STAFF_DASHBOARD_QUERY_KEY, 'series'],
		fetcher: async (client, variables) => {
			const result = await client.staff.dashboard.series.get({
				queryParameters: {
					metric: variables.metric,
					startDate: variables.startDate,
					endDate: variables.endDate,
				},
			});

			if (!result) {
				throw new Error('staff dashboard series result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

export const staffDashboardTopOrganisationsQueryOptions =
	buildStaffQueryOptions<
		ApiClient,
		FindTopOrganisationsForStaffResponse,
		StaffDashboardTopOrganisationsVariables
	>(
		{
			queryKeyFn: () => [...STAFF_DASHBOARD_QUERY_KEY, 'top-organisations'],
			fetcher: async (client, variables) => {
				const result = await client.staff.dashboard.topOrganisations.get({
					queryParameters: {
						startDate: variables.startDate,
						endDate: variables.endDate,
						size:
							variables.size === undefined ? undefined : String(variables.size),
					},
				});

				if (!result) {
					throw new Error('staff dashboard top organisations result was empty');
				}

				return result;
			},
		},
		{ clientAccessor: getClientManager() },
	);

export const useStaffDashboardSeriesQuery = (
	variables: StaffDashboardSeriesVariables,
	options?: { enabled?: boolean },
) =>
	useQuery({
		queryKey: staffDashboardSeriesQueryOptions.queryKey(variables),
		queryFn: () => staffDashboardSeriesQueryOptions.fetcher(variables),
		enabled: options?.enabled ?? true,
	});

export const useStaffDashboardTopOrganisationsQuery = (
	variables: StaffDashboardTopOrganisationsVariables,
	options?: { enabled?: boolean },
) =>
	useQuery({
		queryKey: staffDashboardTopOrganisationsQueryOptions.queryKey(variables),
		queryFn: () =>
			staffDashboardTopOrganisationsQueryOptions.fetcher(variables),
		enabled: options?.enabled ?? true,
	});
