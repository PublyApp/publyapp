import { createUntypedString } from '@microsoft/kiota-abstractions';
import _ from 'lodash';

import { delay } from '@org/shared-ts/utils/any.utils';
import { getSessionTokensFromClient } from '@/front/lib/cookies/session-cookie.utils';
import type {
	BulkStaffInvitationsCreated,
	CreateStaffInvitationBody,
} from '@/js-client/src/models';
import { SESSION_TOKEN_HEADER_KEY } from '@/shared/lib/constants';

import { createStaffMutation, createStaffQuery } from '../../create-hooks';

// Query: Find Staff Invitations
type FindStaffInvitationsParams = {
	cursor?: string;
	limit?: number;
	sort?: { id: string; order: 'desc' | 'asc' };
	status?: string;
};

// Query: Get Single Staff Invitation
type GetStaffInvitationParams = {
	invitationId: string;
};

export const useGetStaffInvitation = createStaffQuery({
	queryKeyFn: (client) => client.staff.invitations.byInvitationId('').get,
	fetcher: async (client, params: GetStaffInvitationParams) => {
		const result = await client.staff.invitations
			.byInvitationId(params.invitationId)
			.get();
		if (_.isNil(result)) {
			throw new Error('useGetStaffInvitation: result is nil');
		}
		return result;
	},
});

// Cursor-based listing with optional status filter.
export const useFindStaffInvitations = createStaffQuery({
	queryKeyFn: (client) => client.staff.invitations.get,
	fetcher: async (client, params: FindStaffInvitationsParams) => {
		const result = await client.staff.invitations.get({
			queryParameters: {
				cursor: params.cursor,
				limit: params.limit ? params.limit.toString() : undefined,
				sortId: params.sort?.id,
				sortOrder: params.sort?.order,
				status: params.status,
			},
		});
		if (_.isNil(result)) {
			throw new Error('useFindStaffInvitations: result is nil');
		}
		return result;
	},
});

// Query: Find Staff Profiles (placeholder using delay)
export const useFindStaffProfilesFromInvitations = createStaffQuery({
	queryKeyFn: (client) => client.staff.profiles.get,
	fetcher: async (_client) => {
		// const result = await client.staff.profiles.get();
		const result = await delay(1500, []);
		if (_.isNil(result)) {
			throw new Error('useFindStaffProfilesFromInvitations: result is nil');
		}
		return result;
	},
});

// Mutation: Create Invitation
type CreateInvitationPayload = {
	email: string;
	profileId: string;
};

export const useCreateStaffInvitation = createStaffMutation({
	mutationKeyFn: (client) => client.staff.invitations.post,
	mutationFn: async (client, data: CreateInvitationPayload) => {
		const body: CreateStaffInvitationBody = {
			email: createUntypedString(data.email) as typeof body.email,
			profileId: createUntypedString(data.profileId) as typeof body.profileId,
		};
		const result = await client.staff.invitations.post(body);
		if (_.isNil(result)) {
			throw new Error('useCreateStaffInvitation: result is nil');
		}
		return result;
	},
});

// Mutation: Bulk Create Invitations
// Note: This mutation uses a custom fetch due to API limitations with Kiota
type BulkCreateInvitationsPayload = {
	invitations: Array<{
		email: string;
		profileIds: string[];
	}>;
};

export const useBulkCreateStaffInvitations = createStaffMutation({
	mutationKeyFn: (client) => client.staff.invitations.bulk.post,
	mutationFn: async (client, data: BulkCreateInvitationsPayload) => {
		// Use client to get request info, but make custom fetch for bulk endpoint
		const reqInfo = client.staff.invitations.bulk.toPostRequestInformation({});
		// Use staffToken for staff endpoints (falls back to tenantToken if no staffToken)
		const tokens = getSessionTokensFromClient();
		const sessionToken = tokens.staffToken ?? tokens.tenantToken;

		const response = await fetch(reqInfo.URL, {
			method: reqInfo.httpMethod,
			body: JSON.stringify({
				invitations: data.invitations,
			}),
			headers: {
				'Content-Type': 'application/json',
				[SESSION_TOKEN_HEADER_KEY]: sessionToken || '',
			},
		});

		if (!response.ok) {
			const errorBody = await response.json();
			// Add responseStatusCode for compatibility with toApiFailure schema
			throw { ...errorBody, responseStatusCode: response.status };
		}

		const result: BulkStaffInvitationsCreated | undefined =
			await response.json();

		if (_.isNil(result)) {
			throw new Error('useBulkCreateStaffInvitations: result is nil');
		}
		return result;
	},
});

// Mutation: Revoke Invitation
type RevokeInvitationPayload = {
	invitationId: string;
};

export const useRevokeInvitation = createStaffMutation({
	mutationKeyFn: (client) => client.staff.invitations.byInvitationId('').delete,
	mutationFn: async (client, data: RevokeInvitationPayload) => {
		const result = await client.staff.invitations
			.byInvitationId(data.invitationId)
			.delete();
		if (_.isNil(result)) {
			throw new Error('useRevokeInvitation: result is nil');
		}
		return result;
	},
});

type GetInvitationLinkPayload = {
	invitationId: string;
};

// Use mutation to avoid caching tokenized invitation links.
export const useGetInvitationLink = createStaffMutation({
	mutationKeyFn: (client) =>
		client.staff.invitations.byInvitationId('').link.get,
	mutationFn: async (client, data: GetInvitationLinkPayload) => {
		const result = await client.staff.invitations
			.byInvitationId(data.invitationId)
			.link.get();
		if (_.isNil(result)) {
			throw new Error('useGetInvitationLink: result is nil');
		}
		return result;
	},
});

type ResendInvitationPayload = {
	invitationId: string;
};

// Resend is modeled as a mutation to keep query cache clean.
export const useResendInvitation = createStaffMutation({
	mutationKeyFn: (client) =>
		client.staff.invitations.byInvitationId('').resend.post,
	mutationFn: async (client, data: ResendInvitationPayload) => {
		const result = await client.staff.invitations
			.byInvitationId(data.invitationId)
			.resend.post();
		if (_.isNil(result)) {
			throw new Error('useResendInvitation: result is nil');
		}
		return result;
	},
});
