import {
	fromStaffMemberParseFunction,
	getParseFunctionHeader,
} from '@/server/lib/parse/function.utils';
import { fileProvider, functionName, roleSet } from '@/shared/lib/constants';
import FileService from '../../common/file/file.service';
import { getMulterMemoryFileSchema } from '@/shared/validations/file/file-server.validations';
import _ from 'lodash';
import { generateUsername } from 'unique-username-generator';
import { makePath } from '@/shared/utils/string.utils';
import { HttpException } from '@/server/exceptions/HttpException';
import { nanoid } from 'nanoid';

const createStaffMember = fromStaffMemberParseFunction({
	allowedRoles: roleSet.STAFF_ADMIN_ONLY,
	validateParams: ({ params, z }) => {
		return z
			.object({
				firstName: z.string(),
				lastName: z.string(),
				email: z.string().email(),
				role: z.enum([
					'STAFF_ADMIN',
					'STAFF_EDITOR',
					'STAFF_USER',
					'STAFF_CONTRIBUTOR',
				]),
			})
			.parse(params);
	},
	action: async ({ params, user, req, z, t }) => {
		const sessionToken = user?.getSessionToken();

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
		const savedUser = await new Parse.User(
			_.omitBy(
				{
					...params,
					avatarUrl,
					username: generateUsername(),
					password: nanoid(),
				},
				_.isNil,
			),
		).save(null, { sessionToken: user.getSessionToken() });

		return savedUser;
	},
});

Parse.Cloud.define(functionName.staff.staffMember.create, createStaffMember);
