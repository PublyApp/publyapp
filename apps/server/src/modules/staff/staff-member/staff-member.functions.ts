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
import {
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
import _ from 'lodash';
import { nanoid } from 'nanoid';
import { generateUsername } from 'unique-username-generator';
import RoleService from '../../common/auth/role/role.service';
import ParseUser from '../../common/auth/user/user.class';
import FileService from '../../common/file/file.service';

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

		// upload avatar file
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
		}

		// create new user
		const savedUser = await new ParseUser(
			_.omitBy(
				{
					...params,
					avatarUrl,
					username: generateUsername(),
					password: nanoid(),
					createdBy: user,
				},
				(value, key) => _.isNil(value) || key === 'role',
			) as never,
		).save(null, { sessionToken });

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
		// we mut await
		await setRoleData();

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

//--------------------------------------------------------------------------------------//
//                                                                                      //
//                                 Migration functions                                  //
//                                                                                      //
//--------------------------------------------------------------------------------------//

const migrateIsStaffMember = parseFunctionEnhanced({
	name: functionName.staff.staffMember.migrateIsStaffMember,
	requireMasterKey: true,
	action: async () => {
		await new Parse.Query(ParseUser).eachBatch(async () => {}, USE_MASTER_KEY);
	},
});

const migrateRoleData = parseFunctionEnhanced({
	name: functionName.staff.staffMember.migrateRoleData,
	requireMasterKey: true,
	action: async () => {
		await new Parse.Query(ParseUser).eachBatch(async () => {}, USE_MASTER_KEY);
	},
});

defineCloudFunction(migrateIsStaffMember);
defineCloudFunction(migrateRoleData);
