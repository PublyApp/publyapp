import { HttpException } from '@/server/exceptions/HttpException';
import { USE_MASTER_KEY } from '@/server/lib/constants';
import { getParseFunctionHeader } from '@/server/lib/parse/cloud/core';
import {
	type FunctionParams,
	type FunctionReturn,
	defineCloudFunction,
	fromStaffMemberParseFunction,
	parseFunctionEnhanced,
} from '@/server/lib/parse/cloud/function';
import { getDatabase } from '@/server/lib/parse/parse.utils';
import {
	DEFAULT_PAGE_SIZE,
	className,
	fileProvider,
	functionName,
	roleEnum,
	roleSet,
} from '@/shared/lib/constants';
import type { IUser } from '@/shared/types/db/user.types';
import { makePath } from '@/shared/utils/string.utils';
import { tryCatchWrapper } from '@/shared/utils/try-catch.utils';
import { getMulterMemoryFileSchema } from '@/shared/validations/file/file-server.validations';
import { getNewStaffMemberSchemaServerSide } from '@org/shared/validations/staff-member/staff-member.validation';
import { eachOfLimit } from 'async';
import _ from 'lodash';
import type { AnyBulkWriteOperation, BulkWriteResult } from 'mongodb';
import { nanoid } from 'nanoid';
import { generateUsername } from 'unique-username-generator';
import RoleService from '../../common/auth/role/role.service';
import ParseUser from '../../common/auth/user/user.class';
import FileService from '../../common/file/file.service';
import StaffTenantService from '../tenant/staff-tenant.service';

export namespace CreateStaffMemberFunction {
	export type Params = FunctionParams<typeof createStaffMember>;
	export type Return = FunctionReturn<typeof createStaffMember>;
}

export const createStaffMember = fromStaffMemberParseFunction({
	name: functionName.staff.staffMember.create,
	allowedRoles: roleSet.STAFF_ADMIN_ONLY,
	validateParams: ({ params, z }) => {
		return getNewStaffMemberSchemaServerSide(z).parse(params);
	},
	action: async ({ params, user, req, z, t, log }) => {
		const sessionToken = user?.getSessionToken();
		const roleService = new RoleService(USE_MASTER_KEY);

		const role = await roleService.findRoleByName(params.role);

		if (!role) {
			throw new HttpException(400, t('item-is-invalid', { item: t('role') }));
		}

		// create new user
		const savedUser = await new ParseUser(
			_.omitBy(
				{
					...params,
					// avatarUrl,
					username: generateUsername(),
					password: nanoid(),
					createdBy: user,
				},
				(value, key) => _.isNil(value) || key === 'role',
			) as never,
		).save(null, { sessionToken });

		// no need to check if is already member of a tenant
		// because a newly created use should not have any role
		// and should not have any tenant relation yet
		await roleService.assignRoleToUsers(role, [savedUser]);

		// set roleData
		const setRoleData = tryCatchWrapper({
			handler: async () => {
				const _user = new ParseUser();
				_user.id = savedUser.id;
				_user.set('roleData', {
					role: params.role,
					rank: roleEnum[params.role].rank,
				});
				_user.set('isStaffMember', true);
				// obliged to use master key here
				// because user objects have an ACL:
				// only himself can update himself
				await _user.save(null, USE_MASTER_KEY);
			},
			onError: async (error) => {
				log.error('Error setting roleData on user', error);
				// delete the user
				await savedUser.destroy(USE_MASTER_KEY);
				throw error;
			},
		});
		// we must await
		await setRoleData();

		// only upload the image if user has been successfully created/saved
		// upload avatar file
		const uploadAvatarFile = tryCatchWrapper({
			handler: async () => {
				const file = getParseFunctionHeader(req, '__avatar__') as unknown;

				const { success, data } = getMulterMemoryFileSchema(z).safeParse(file);

				let avatarUrl: string | undefined;

				if (success) {
					const uploadAdapter = FileService.uploadAdapterMap.get(
						fileProvider.CLOUDFLARE,
					);

					if (!uploadAdapter) {
						throw new HttpException(500, t('Error while uploading file'));
					}

					const fileService = new FileService({ sessionToken, uploadAdapter });

					const result = await fileService.uploadOne({
						file: data,
						folderPath: makePath('staff', 'staff-member', 'avatar'),
						storageFrom: 'memory',
					});

					avatarUrl = result.url;

					// free up memory usage by discarding the file blob
					_.unset(req.headers, '__avatar__');

					// finally set avatar url image on user object
					const _user = new ParseUser();
					_user.id = savedUser.id;
					_user.set('avatarUrl', avatarUrl);
					// obliged to use master key here
					// because user objects have an ACL:
					// only himself can update himself
					await _user.save(null, USE_MASTER_KEY);
				}
			},
			onError: async (error) => {
				log.error('Error uploading avatar file', error);
				savedUser.destroy(USE_MASTER_KEY);
				throw error;
			},
		});
		// we must await
		await uploadAvatarFile();

		const json = savedUser.toJSON();

		const returnedJson = _.pick(json, [
			'firstName',
			'lastName',
			'email',
			'avatarUrl',
			'username',
			'createdAt',
			'updatedAt',
			'objectId',
		]) as unknown as IUser;

		_.set(returnedJson, 'role', params.role);
		_.set(returnedJson, 'createdBy', user.id);

		return returnedJson;
	},
});

export namespace FindStaffMemberFunction {
	export type Params = FunctionParams<typeof findStaffMember>;
	export type Return = FunctionReturn<typeof findStaffMember>;
}

const findStaffMember = fromStaffMemberParseFunction({
	name: functionName.staff.staffMember.find,
	allowedRoles: roleSet.STAFF_ADMIN_ONLY,
	validateParams: ({ params, z }) => {
		const schema = z.object({
			limit: z.number().optional(),
			lastId: z.string().optional(),
			sort: z
				.object({
					id: z.string(),
					order: z.enum(['desc', 'asc']),
				})
				.optional(),
		});
		return schema.parse(params);
	},
	action: async ({ params /* , user, req, z, t, log */ }) => {
		// const sessionToken = user.getSessionToken();

		const SELECTED_FIELDS = [
			'firstName',
			'lastName',
			'email',
			'avatarUrl',
			'roleData.role',
		];

		const query = new Parse.Query(ParseUser)
			.equalTo('isStaffMember', true)
			.select(SELECTED_FIELDS);

		// apply pagination/limit
		// it's necessary to sort by at least one field, to make cursor based pagination work
		const sort: NonNullable<typeof params.sort> = params.sort || {
			id: 'createdAt',
			order: 'desc',
		};

		if (sort.order === 'asc') {
			query.addAscending('objectId');
		} else {
			query.addDescending('objectId');
		}

		query.limit(params.limit || DEFAULT_PAGE_SIZE);
		if (params.lastId) {
			query.greaterThan('objectId', params.lastId);
		}

		// ok to use master key here
		// because function is only allowed to be used by staff admins
		const staffMembers = await query.find(USE_MASTER_KEY);

		const users = _.map(staffMembers, (user) => {
			return _.pick(user.toJSON(), [...SELECTED_FIELDS, 'objectId']);
		});

		return users as IUser[];
	},
});

// ==== Migration functions

const migrateIsStaffMember = parseFunctionEnhanced({
	name: functionName.staff.staffMember.migrateIsStaffMember,
	requireMasterKey: true,
	action: async ({ log }) => {
		const staffTenantService = new StaffTenantService();

		// find which users have a STAFF role
		const userIdsWithStaffRole: string[] = [];

		const staffRoles = await new Parse.Query(Parse.Role)
			.select('name')
			.containedIn(
				'name',
				roleSet.STAFF_MEMBER.map((role) => role.name),
			)
			.findAll(USE_MASTER_KEY);

		await new Parse.Query(ParseUser).select([]).eachBatch(async (users) => {
			const _userIdsWithStaffRole =
				await staffTenantService.verifyIfAnyOfUsersHaveAnyOfRoles(
					users,
					staffRoles,
				);
			userIdsWithStaffRole.push(..._userIdsWithStaffRole);
		}, USE_MASTER_KEY);

		// bulk update users using mongodb
		const result = await getDatabase()
			.collection(className.USER)
			.updateMany(
				{
					_id: {
						$in: userIdsWithStaffRole as never,
					},
				},
				{
					$set: {
						isStaffMember: true,
					},
				},
			);

		log.debug('Finished migrating field isStaffMember', result);
	},
});

const migrateRoleData = parseFunctionEnhanced({
	name: functionName.staff.staffMember.migrateRoleData,
	requireMasterKey: true,
	action: async ({ log }) => {
		const roleService = new RoleService(USE_MASTER_KEY);

		await new Parse.Query(ParseUser).select([]).eachBatch(async (users) => {
			const bulkOps: AnyBulkWriteOperation<Document>[] = [];

			// find users roles in batch
			await eachOfLimit(users, 100, async (user) => {
				const roles = await roleService.getUserRoles(user, {
					json: true,
					select: ['name', 'rank'],
				});

				// sort roles by rank
				const sortedRoles = _.sortBy(roles, (role) => role.rank);

				// get the highest rank role
				const highestRankRole = _.first(sortedRoles);

				if (highestRankRole) {
					bulkOps.push({
						updateOne: {
							filter: { _id: user.id as never },
							update: {
								$set: {
									roleData: {
										role: highestRankRole.name,
										rank: highestRankRole.rank,
									},
								},
							},
							upsert: true,
						},
					});
				}
			});

			let result: BulkWriteResult | undefined;
			if (bulkOps.length > 0) {
				result = await getDatabase()
					.collection(className.USER)
					.bulkWrite(bulkOps as never);
			}

			log.debug('Batch update done', result || {});
		}, USE_MASTER_KEY);
	},
});

export const defineStaffMemberFunctions = () => {
	defineCloudFunction(migrateIsStaffMember);
	defineCloudFunction(migrateRoleData);
	defineCloudFunction(findStaffMember);
};
