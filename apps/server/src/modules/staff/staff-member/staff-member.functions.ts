import {
	fromStaffMemberParseFunction,
	getParseFunctionHeader,
} from '@/server/lib/parse/function.utils';
import { fileProvider, functionName, roleSet } from '@/shared/lib/constants';
import FileService from '../../common/file/file.service';
import { getMulterFileSchema } from '@/shared/validations/file/file-server.validations';
import _ from 'lodash';

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
	action: async ({ params, user, req, z }) => {
		const sessionToken = user?.getSessionToken();

		// upload avatar file
		const file = getParseFunctionHeader(req, '__avatar__') as unknown;

		const { success, data } = getMulterFileSchema(z).safeParse(file);

		let avatarUrl: string | undefined;

		if (success) {
			const uploadAdapter =
				FileService.uploadAdapterMap.get(fileProvider.CLOUDINARY) ||
				FileService.defaultUploadAdapter;

			const fileService = new FileService({ sessionToken, uploadAdapter });

			const result = await fileService.uploadOne({
				file: data,
				folderPath: 'staff/staff-members-avatars',
			});

			avatarUrl = result.url;

			// free up memory usage by discarding the file blob
			file.destroy(); // multer
		}

		// create new user
		const savedUser = await new Parse.User(
			_.omitBy({ ...params, avatarUrl }, _.isNil),
		).save(null, { sessionToken: user.getSessionToken() });

		return savedUser;
	},
});

Parse.Cloud.define(functionName.staff.staffMember.create, createStaffMember);
