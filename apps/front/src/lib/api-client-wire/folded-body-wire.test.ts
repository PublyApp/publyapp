import {
	createUntypedArray,
	createUntypedBoolean,
	createUntypedNull,
	createUntypedNumber,
	createUntypedObject,
	createUntypedString,
} from '@microsoft/kiota-abstractions';
import { describe, expect, test } from 'vitest';

// The server env must be set before lib/env.ts is first imported by the
// client-manager module graph below.
process.env.SERVER_API_BASE_URL = 'https://api.example.test';

import { createClient } from '~/lib/api-client/client-manager';

const STAFF_USER_ID = '01234567-89ab-cdef-8123-456789abcdef';
const TENANT_ID = '01234567-89ab-cdef-a123-456789abcdef';

/**
 * Wire tests pinning the SERIALIZATION side of B3's folded nullable-union
 * request bodies (issue #1459, part of #639).
 *
 * `OpenApiDocumentNormalizer.FoldNullableReferenceUnions` folds every
 * `oneOf [{type: null}, {$ref: T}]` schema contract-wide into a nullable ref.
 * 13 FluentValidation request-body families carry at least one such folded
 * property; the two image projections (`PostDetail.image`,
 * `PostListItem.image`) are response-side folds of the same transform.
 *
 * Every other front test mocks the client, so only these tests observe what
 * the generated serializers actually put on the wire. If a Kiota/OpenAPI bump
 * ever turns a folded request body into an empty payload, the matching test
 * here goes red naming the missing key.
 *
 * Each family is exercised through its own generated request builder reached
 * off the production `createApiClient` graph, i.e. through the exact
 * serialization path used at runtime: the adapter's
 * `SerializationWriterFactoryRegistry` (default serializers registered inside
 * `createApiClient`) hands out the `JsonSerializationWriter`, the builder's
 * `to*RequestInformation` calls `setContentFromParsable`, which delegates to
 * the model's own generated `serialize*` function. No hand-rolled JSON
 * anywhere in this file; the stubbed fetch is never invoked because these
 * tests only read `RequestInformation.content` without sending anything.
 */

const buildWireClient = () =>
	createClient({
		getSessionToken: () => undefined,
		fetchImpl: async () => new Response(null, { status: 204 }),
	});

type WireRecord = Record<string, unknown>;

const readWireBody = (request: {
	content?: ArrayBuffer | undefined;
}): WireRecord => {
	if (!request.content) {
		throw new Error('request carries no serialized content');
	}
	const wire = Buffer.from(request.content).toString('utf8');
	return JSON.parse(wire) as WireRecord;
};

describe('folded request bodies', () => {
	test('AcceptInvitationBody serializes its folded key in both nullability states', () => {
		const client = buildWireClient();

		const withValue = readWireBody(
			client.invitations
				.byToken('invitation-token')
				.accept.toPostRequestInformation({
					firstName: createUntypedString('Ada'),
					lastName: createUntypedString('Lovelace'),
					password: createUntypedString('secret-password'),
					useExistingAccount: createUntypedBoolean(true),
				}),
		);
		expect(Object.keys(withValue).sort()).toEqual([
			'firstName',
			'lastName',
			'password',
			'useExistingAccount',
		]);
		expect(withValue.useExistingAccount).toBe(true);

		const foldedAbsent = readWireBody(
			client.invitations
				.byToken('invitation-token')
				.accept.toPostRequestInformation({
					firstName: createUntypedString('Ada'),
					password: createUntypedString('secret-password'),
				}),
		);
		expect(Object.keys(foldedAbsent).sort()).toEqual(['firstName', 'password']);
	});

	test('BulkSuspendTenantsAsStaffBody serializes its folded key in both nullability states', () => {
		const client = buildWireClient();
		const tenantIds = createUntypedArray([createUntypedString(TENANT_ID)]);

		const withValue = readWireBody(
			client.staff.tenants.bulkSuspend.toPostRequestInformation({
				tenantIds,
				reason: createUntypedString('offboard-request'),
			}),
		);
		expect(Object.keys(withValue).sort()).toEqual(['reason', 'tenantIds']);
		expect(withValue.reason).toBe('offboard-request');

		const foldedNull = readWireBody(
			client.staff.tenants.bulkSuspend.toPostRequestInformation({
				tenantIds,
				reason: createUntypedNull(),
			}),
		);
		expect(Object.keys(foldedNull)).toContain('reason');
		expect(foldedNull.reason).toBeNull();
	});

	test('CreatePostBody serializes its folded key in both nullability states', () => {
		const client = buildWireClient();
		const postBody = createUntypedObject({ blocks: createUntypedArray([]) });

		const withValue = readWireBody(
			client.posts.toPostRequestInformation({
				body: postBody,
				projectId: createUntypedString(TENANT_ID),
			}),
		);
		expect(Object.keys(withValue).sort()).toEqual(['body', 'projectId']);
		expect(withValue.projectId).toBe(TENANT_ID);

		const foldedNull = readWireBody(
			client.posts.toPostRequestInformation({
				body: postBody,
				projectId: createUntypedNull(),
			}),
		);
		expect(Object.keys(foldedNull)).toContain('projectId');
		expect(foldedNull.projectId).toBeNull();
	});

	test('CreateStaffProfileBody serializes its four folded keys and the absent state', () => {
		const client = buildWireClient();

		const withValue = readWireBody(
			client.staff.profiles.toPostRequestInformation({
				name: createUntypedString('Editors'),
				description: createUntypedString('Can edit posts'),
				permissions: createUntypedArray([createUntypedString('posts.update')]),
				emails: createUntypedArray([
					createUntypedString('editor@example.test'),
				]),
				icon: createUntypedString('shield'),
				tone: createUntypedString('neutral'),
			}),
		);
		expect(Object.keys(withValue).sort()).toEqual([
			'description',
			'emails',
			'icon',
			'name',
			'permissions',
			'tone',
		]);
		expect(withValue.permissions).toEqual(['posts.update']);

		const foldedAbsent = readWireBody(
			client.staff.profiles.toPostRequestInformation({
				name: createUntypedString('Editors'),
			}),
		);
		expect(Object.keys(foldedAbsent)).toEqual(['name']);
	});

	test('CreateSystemNoticeBody serializes its folded key and the absent state', () => {
		const client = buildWireClient();

		const withValue = readWireBody(
			client.staff.notices.toPostRequestInformation({
				severity: createUntypedString('info'),
				title: createUntypedString('Maintenance window'),
				message: createUntypedString('Read models rebuild tonight.'),
				startsAt: createUntypedString('2026-08-26T00:00:00.000Z'),
				expiresAt: createUntypedString('2026-08-27T00:00:00.000Z'),
			}),
		);
		expect(Object.keys(withValue).sort()).toEqual([
			'expiresAt',
			'message',
			'severity',
			'startsAt',
			'title',
		]);
		expect(withValue.expiresAt).toBe('2026-08-27T00:00:00.000Z');

		const foldedAbsent = readWireBody(
			client.staff.notices.toPostRequestInformation({
				severity: createUntypedString('info'),
				title: createUntypedString('Maintenance window'),
				message: createUntypedString('Read models rebuild tonight.'),
				startsAt: createUntypedString('2026-08-26T00:00:00.000Z'),
			}),
		);
		expect(Object.keys(foldedAbsent).sort()).toEqual([
			'message',
			'severity',
			'startsAt',
			'title',
		]);
	});

	test('CreateTenantAsStaffBody serializes its eleven folded keys and the absent state', () => {
		const client = buildWireClient();

		const withValue = readWireBody(
			client.staff.tenants.toPostRequestInformation({
				name: createUntypedString('Acme'),
				maxUsers: createUntypedNumber(25),
				initialUsers: createUntypedArray([]),
				code: createUntypedString('acme'),
				seedDefaultProfile: createUntypedBoolean(true),
				logoUrl: createUntypedString('https://cdn.example.test/acme.png'),
				legalName: createUntypedString('Acme Inc'),
				description: createUntypedString('Acme tenant'),
				websiteUrl: createUntypedString('https://acme.example.test'),
				billingEmail: createUntypedString('billing@acme.example.test'),
				supportEmail: createUntypedString('support@acme.example.test'),
				defaultLocale: createUntypedString('en-US'),
				timezone: createUntypedString('UTC'),
				notes: createUntypedString('seed tenant'),
			}),
		);
		for (const key of [
			'code',
			'seedDefaultProfile',
			'logoUrl',
			'legalName',
			'description',
			'websiteUrl',
			'billingEmail',
			'supportEmail',
			'defaultLocale',
			'timezone',
			'notes',
		]) {
			expect(Object.keys(withValue), `missing wire key ${key}`).toContain(key);
		}
		expect(withValue.code).toBe('acme');
		expect(withValue.maxUsers).toBe(25);

		const foldedAbsent = readWireBody(
			client.staff.tenants.toPostRequestInformation({
				name: createUntypedString('Acme'),
				maxUsers: createUntypedNumber(25),
				initialUsers: createUntypedArray([]),
			}),
		);
		expect(Object.keys(foldedAbsent).sort()).toEqual([
			'initialUsers',
			'maxUsers',
			'name',
		]);
	});

	test('ResolveDeadLetterUnclassifiedForStaffBody serializes its folded key in both nullability states', () => {
		const client = buildWireClient();

		const withValue = readWireBody(
			client.staff.deadLetter
				.byDeadLetterId(STAFF_USER_ID)
				.resolveUnclassified.toPostRequestInformation({
					note: createUntypedString('duplicate of another failure'),
				}),
		);
		expect(Object.keys(withValue)).toEqual(['note']);
		expect(withValue.note).toBe('duplicate of another failure');

		const foldedNull = readWireBody(
			client.staff.deadLetter
				.byDeadLetterId(STAFF_USER_ID)
				.resolveUnclassified.toPostRequestInformation({
					note: createUntypedNull(),
				}),
		);
		expect(Object.keys(foldedNull)).toEqual(['note']);
		expect(foldedNull.note).toBeNull();
	});

	test('SuspendTenantAsStaffBody serializes its folded key in both nullability states', () => {
		const client = buildWireClient();

		const withValue = readWireBody(
			client.staff.tenants
				.byTenantId(TENANT_ID)
				.suspend.toPostRequestInformation({
					reason: createUntypedString('billing-hold'),
				}),
		);
		expect(Object.keys(withValue)).toEqual(['reason']);
		expect(withValue.reason).toBe('billing-hold');

		const foldedNull = readWireBody(
			client.staff.tenants
				.byTenantId(TENANT_ID)
				.suspend.toPostRequestInformation({
					reason: createUntypedNull(),
				}),
		);
		expect(Object.keys(foldedNull)).toEqual(['reason']);
		expect(foldedNull.reason).toBeNull();
	});

	test('UpdatePostBody serializes its folded key in both nullability states', () => {
		const client = buildWireClient();

		const withValue = readWireBody(
			client.posts.byPostId(STAFF_USER_ID).toPatchRequestInformation({
				body: createUntypedObject({
					blocks: createUntypedArray([
						createUntypedObject({
							text: createUntypedString('hello'),
						}),
					]),
				}),
				imageAltText: createUntypedString('A sunrise over the harbour'),
				projectId: createUntypedString(TENANT_ID),
			}),
		);
		expect(Object.keys(withValue).sort()).toEqual([
			'body',
			'imageAltText',
			'projectId',
		]);
		expect(withValue.body).toEqual({ blocks: [{ text: 'hello' }] });

		const foldedNull = readWireBody(
			client.posts.byPostId(STAFF_USER_ID).toPatchRequestInformation({
				imageAltText: createUntypedNull(),
				projectId: createUntypedNull(),
			}),
		);
		expect(Object.keys(foldedNull).sort()).toEqual([
			'imageAltText',
			'projectId',
		]);
		expect(foldedNull.imageAltText).toBeNull();

		const foldedAbsent = readWireBody(
			client.posts.byPostId(STAFF_USER_ID).toPatchRequestInformation({}),
		);
		expect(Object.keys(foldedAbsent)).toEqual([]);
	});

	test('UpdateStaffUserBody serializes its folded key in both nullability states', () => {
		const client = buildWireClient();

		const withValue = readWireBody(
			client.staff.users.byUserId(STAFF_USER_ID).toPatchRequestInformation({
				firstName: createUntypedString('Grace'),
				lastName: createUntypedString('Hopper'),
				accountLevel: createUntypedString('admin'),
			}),
		);
		expect(Object.keys(withValue).sort()).toEqual([
			'accountLevel',
			'firstName',
			'lastName',
		]);
		expect(withValue.accountLevel).toBe('admin');

		const foldedNull = readWireBody(
			client.staff.users.byUserId(STAFF_USER_ID).toPatchRequestInformation({
				accountLevel: createUntypedNull(),
			}),
		);
		expect(Object.keys(foldedNull)).toEqual(['accountLevel']);
		expect(foldedNull.accountLevel).toBeNull();
	});

	test('UpdateSystemNoticeBody serializes its four folded keys and the absent state', () => {
		const client = buildWireClient();

		const withValue = readWireBody(
			client.staff.notices.byNoticeId(STAFF_USER_ID).toPatchRequestInformation({
				severity: createUntypedString('warning'),
				title: createUntypedString('Degraded ingestion'),
				message: createUntypedString('Retries queued.'),
				startsAt: createUntypedString('2026-08-26T01:00:00.000Z'),
				expiresAt: createUntypedString('2026-08-26T09:00:00.000Z'),
			}),
		);
		expect(Object.keys(withValue).sort()).toEqual([
			'expiresAt',
			'message',
			'severity',
			'startsAt',
			'title',
		]);
		expect(withValue.severity).toBe('warning');

		const foldedAbsent = readWireBody(
			client.staff.notices.byNoticeId(STAFF_USER_ID).toPatchRequestInformation({
				expiresAt: createUntypedString('2026-08-26T09:00:00.000Z'),
			}),
		);
		expect(Object.keys(foldedAbsent)).toEqual(['expiresAt']);
	});

	test('UpdateTenantAsStaffBody serializes its folded key in both nullability states', () => {
		const client = buildWireClient();

		const withValue = readWireBody(
			client.staff.tenants.byTenantId(TENANT_ID).toPatchRequestInformation({
				name: createUntypedString('Acme renamed'),
				maxUsers: createUntypedNumber(50),
			}),
		);
		expect(Object.keys(withValue).sort()).toEqual(['maxUsers', 'name']);
		expect(withValue.maxUsers).toBe(50);

		const foldedNull = readWireBody(
			client.staff.tenants.byTenantId(TENANT_ID).toPatchRequestInformation({
				name: createUntypedString('Acme renamed'),
				maxUsers: createUntypedNull(),
			}),
		);
		expect(Object.keys(foldedNull)).toContain('maxUsers');
		expect(foldedNull.maxUsers).toBeNull();
	});

	test('UpdateTenantUserAsStaffBody serializes its folded key in both nullability states', () => {
		const client = buildWireClient();

		const withValue = readWireBody(
			client.staff.tenants
				.byTenantId(TENANT_ID)
				.users.byUserId(STAFF_USER_ID)
				.toPatchRequestInformation({
					firstName: createUntypedString('Radia'),
					level: createUntypedString('member'),
				}),
		);
		expect(Object.keys(withValue).sort()).toEqual(['firstName', 'level']);
		expect(withValue.level).toBe('member');

		const foldedNull = readWireBody(
			client.staff.tenants
				.byTenantId(TENANT_ID)
				.users.byUserId(STAFF_USER_ID)
				.toPatchRequestInformation({
					firstName: createUntypedString('Radia'),
					level: createUntypedNull(),
				}),
		);
		expect(Object.keys(foldedNull)).toContain('level');
		expect(foldedNull.level).toBeNull();
	});
});
