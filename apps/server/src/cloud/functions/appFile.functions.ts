import z from 'zod';

import { functionName, RolesEnum } from '@devist/shared/utils/constants';

import { USE_MASTER_KEY } from '@server/utils/constants';
// import { USE_MASTER_KEY } from '@server/utils/constants';
import { parseFrom } from '@server/utils/parse.utils';

import FileCloudService from '../services/file.cloud.service';

// import type { AppFile } from '@shared/types/appFiles.types';

const uploadSchema = z.object({
	name: z.string(),
	type: z.string(),
	// buffer: z.array(z.number()),
	base64: z.string(),
});

Parse.Cloud.define(
	functionName.uploadFile,
	parseFrom({
		requireUser: true,
		allowedRoles: [RolesEnum.ADMIN, RolesEnum.MODERATOR, RolesEnum.AUTHOR, RolesEnum.READER],
		action: async ({ /* t, */ req, user }) => {
			const { name, type, base64 } = uploadSchema.parse(req.params);

			const sessionToken = user.getSessionToken();

			const fileService = new FileCloudService({ base64, fileName: name, fileType: type, sessionToken });

			const appFile = await fileService.save(USE_MASTER_KEY);

			return {
				appFile,
			};
		},
	}),
);
