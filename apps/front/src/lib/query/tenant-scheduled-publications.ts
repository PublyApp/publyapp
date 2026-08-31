import { useQuery } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';

import type { ApiClient } from '@org/client-ts/apiClient';
import type {
	FindScheduledPublicationsResponse,
	ScheduledPublicationItem,
} from '@org/client-ts/models/index';
import { buildTenantQueryOptions } from '@org/shared-ts/lib/query/create-hooks';

export const TENANT_SCHEDULED_PUBLICATIONS_QUERY_KEY = [
	'tenant-scheduled-publications',
] as const;

import {
	isPublicationWireStatus,
	type PublicationWireStatus,
} from '~/lib/publication-status';

const LOCAL_DATE_TIME_PATTERN =
	/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?$/;

export type ScheduledPublicationStatus = PublicationWireStatus;

export type ScheduledPublicationsQueryVariables = {
	from: Date;
	to: Date;
	statuses?: string[];
	cursor?: string;
	limit?: number;
};

export type ScheduledPublicationRow = {
	id: string;
	publicationId: string;
	postId: string | null;
	postBodyPreview: string | null;
	accountDisplayHandle: string | null;
	status: string | null;
	postStatus: string | null;
	scheduledAtUtc: Date;
	scheduledAtLocal: string;
	timeZone: string | null;
};

const normalizeString = (
	value: string | null | undefined,
): string | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeNullableString = (
	value: string | null | undefined,
): string | null => normalizeString(value) ?? null;

const normalizeStatuses = (
	statuses: string[] | undefined,
): ScheduledPublicationStatus[] | undefined => {
	if (!statuses || statuses.length === 0) {
		return undefined;
	}

	const normalized: ScheduledPublicationStatus[] = [];
	const seen = new Set<string>();
	for (const status of statuses) {
		const trimmed = status.trim();
		if (!isPublicationWireStatus(trimmed) || seen.has(trimmed)) {
			continue;
		}

		seen.add(trimmed);
		normalized.push(trimmed);
	}

	return normalized.length > 0 ? normalized : undefined;
};

const isPositiveSafeInteger = (value: number | undefined): value is number =>
	typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

export const buildFindScheduledPublicationsQueryParameters = (
	variables: ScheduledPublicationsQueryVariables,
) => {
	const statuses = normalizeStatuses(variables.statuses);

	return {
		from: variables.from.toISOString(),
		to: variables.to.toISOString(),
		status: statuses?.join(','),
		cursor: normalizeString(variables.cursor),
		limit: isPositiveSafeInteger(variables.limit)
			? String(variables.limit)
			: undefined,
	};
};

const normalizeScheduledInstant = (
	value: Date | null | undefined,
): Date | null => {
	if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
		return null;
	}

	return value;
};

export const scheduledLocalCivilDate = (
	scheduledAtLocal: string,
): string | null => {
	const match = LOCAL_DATE_TIME_PATTERN.exec(scheduledAtLocal);
	if (!match) {
		return null;
	}

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const hour = Number(match[4]);
	const minute = Number(match[5]);
	const candidate = new Date(Date.UTC(year, month - 1, day, hour, minute));
	if (
		candidate.getUTCFullYear() !== year ||
		candidate.getUTCMonth() !== month - 1 ||
		candidate.getUTCDate() !== day ||
		candidate.getUTCHours() !== hour ||
		candidate.getUTCMinutes() !== minute
	) {
		return null;
	}

	return scheduledAtLocal.slice(0, 10);
};

const toScheduledPublicationRow = (
	item: ScheduledPublicationItem,
): ScheduledPublicationRow | null => {
	const publicationId = normalizeString(item.publicationId?.toString());
	const scheduledAtUtc = normalizeScheduledInstant(item.scheduledAtUtc);
	const scheduledAtLocal = normalizeString(item.scheduledAtLocal);
	if (
		!publicationId ||
		!scheduledAtUtc ||
		!scheduledAtLocal ||
		!scheduledLocalCivilDate(scheduledAtLocal)
	) {
		return null;
	}

	return {
		id: publicationId,
		publicationId,
		postId: normalizeNullableString(item.postId?.toString()),
		postBodyPreview: normalizeNullableString(item.postBodyPreview),
		accountDisplayHandle: normalizeNullableString(item.accountDisplayHandle),
		status: normalizeNullableString(item.status),
		postStatus: normalizeNullableString(item.postStatus),
		scheduledAtUtc,
		scheduledAtLocal,
		timeZone: normalizeNullableString(item.timeZone),
	};
};

export const toScheduledPublicationRows = (
	data: FindScheduledPublicationsResponse | null | undefined,
): ScheduledPublicationRow[] => {
	const rows: ScheduledPublicationRow[] = [];
	for (const item of data?.data ?? []) {
		const row = toScheduledPublicationRow(item);
		if (row) {
			rows.push(row);
		}
	}

	return rows;
};

export const scheduledPublicationsQueryOptions = buildTenantQueryOptions<
	ApiClient,
	FindScheduledPublicationsResponse,
	ScheduledPublicationsQueryVariables
>(
	{
		queryKeyFn: () => [...TENANT_SCHEDULED_PUBLICATIONS_QUERY_KEY],
		fetcher: async (client, variables) => {
			const result = await client.posts.publications.get({
				queryParameters:
					buildFindScheduledPublicationsQueryParameters(variables),
			});
			if (!result) {
				throw new Error('scheduled publications result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

export const useScheduledPublicationsQuery = (
	variables: ScheduledPublicationsQueryVariables & { tenantId: string },
) =>
	useQuery({
		queryKey: scheduledPublicationsQueryOptions.queryKey(variables),
		queryFn: () => scheduledPublicationsQueryOptions.fetcher(variables),
	});
