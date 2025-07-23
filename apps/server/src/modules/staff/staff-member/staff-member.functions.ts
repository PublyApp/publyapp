import { getNewStaffMemberSchemaServerSide } from '@org/shared/validations/staff-member/staff-member.validation';
import { eachOfLimit } from 'async';
import _ from 'lodash';
import type { AnyBulkWriteOperation, BulkWriteResult } from 'mongodb';
import { nanoid } from 'nanoid';
import { generateUsername } from 'unique-username-generator';
import { HttpException } from '@/server/exceptions/HttpException';
import { USE_MASTER_KEY } from '@/server/lib/constants';
import { getParseFunctionHeader } from '@/server/lib/parse/cloud/core';
import {
	defineCloudFunction,
	type FunctionParams,
	type FunctionReturn,
	fromStaffMemberParseFunction,
	parseFunctionEnhanced,
} from '@/server/lib/parse/cloud/function';
import { getDatabase, removeParseFields } from '@/server/lib/parse/parse.utils';
import { applyPagination, applySorting } from '@/server/lib/parse/query.utils';
import {
	className,
	DEFAULT_PAGE_SIZE,
	fileProvider,
	functionName,
	roleEnum,
	roleSet,
	X_CODE,
} from '@/shared/lib/constants';
import type { IUser } from '@/shared/types/db/user.types';
import { makePath } from '@/shared/utils/string.utils';
import { tryCatchWrapper } from '@/shared/utils/try-catch.utils';
import { getMulterMemoryFileSchema } from '@/shared/validations/file/file-server.validations';
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
			page: z.number().min(1).default(1).optional(),
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
			.notEqualTo('isDeleted', true)
			.select([...SELECTED_FIELDS, 'emailVerified']);

		// because function is only allowed to be used by staff admins
		const count = await query.count(USE_MASTER_KEY);

		// apply pagination/limit
		// it's necessary to sort by at least one field, to make cursor based pagination work
		const sort: NonNullable<typeof params.sort> = params.sort || {
			id: 'createdAt',
			order: 'desc',
		};

		// special case for sorting by roleData.rank
		if (sort.id === 'role') {
			sort.id = 'roleData.rank';
		}

		applySorting(query, [sort]);
		applyPagination(query, {
			page: params.page || 1,
			size: params.limit || DEFAULT_PAGE_SIZE,
		});

		// ok to use master key here
		// because function is only allowed to be used by staff admins
		const staffMembers = await query.find(USE_MASTER_KEY);

		const users = _.map(staffMembers, (user) => {
			const _userData = _.pick(user.toJSON(), [...SELECTED_FIELDS, 'objectId']);
			let _status = user.get('emailVerified') === true ? 'active' : 'pending';

			if (user.get('isBanned') === true) {
				_status = 'banned';
			}

			_.set(_userData, 'status', _status);
			return _userData;
		});

		return {
			rows: users as IUser[],
			count,
		};
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

export namespace GetStaffMemberByIdFunction {
	export type Params = FunctionParams<typeof getStaffMemberById>;
	export type Return = FunctionReturn<typeof getStaffMemberById>;
}

const getStaffMemberById = fromStaffMemberParseFunction({
	name: functionName.staff.staffMember.getById,
	allowedRoles: roleSet.STAFF_ADMIN_ONLY,
	validateParams: ({ params, z }) => {
		return z
			.object({
				id: z.string(),
			})
			.parse(params);
	},
	action: async ({ params, t }) => {
		const user = await new Parse.Query(ParseUser)
			.select(['firstName', 'lastName', 'email', 'avatarUrl', 'roleData.role'])
			.equalTo('isStaffMember', true)
			.equalTo('objectId', params.id)
			.notEqualTo('isDeleted', true)
			// ok to use master key here
			// because function is only allowed to be used by staff admins
			// and user documents have an ACL allowing owner only
			// so we are obliged to use master key anyway
			.first(USE_MASTER_KEY);

		if (!user) {
			throw new HttpException(
				404,
				t('item-not-found', { item: t('staff-member') }),
				{
					xcode: X_CODE.USER_NOT_FOUND,
				},
			);
		}

		return removeParseFields(user.toJSON()) as IUser;
	},
});

//--------------------------------------------------------------------------------------//
//                                 Define the functions                                 //
//--------------------------------------------------------------------------------------//

export const defineStaffMemberFunctions = () => {
	defineCloudFunction(migrateIsStaffMember);
	defineCloudFunction(migrateRoleData);
	defineCloudFunction(findStaffMember);
	defineCloudFunction(getStaffMemberById);
};
