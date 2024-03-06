import z from 'zod';

import { DEFAULT_PAGE_SIZE, functionName, roleSet } from '@devist/shared/lib/constants';

import { parseFrom } from '@/server/lib/parse/utils';
import FileService from '@/server/resources/file/file.service';
import FolderService from '@/server/resources/folder/folder.service';
import { folderNameSchema } from '@/shared/validations/file/file.validations';

Parse.Cloud.define(
	functionName.findAppFile,
	parseFrom({
		requireUser: false,
		// allowedRoles: roleSet.ALL,
		action: async ({ /* t, */ req, user }) => {
			const { pageSize, page, folderPath } = req.params;

			const sessionToken = user?.getSessionToken();

			const folderService = new FolderService({ sessionToken });

			const parentFolder = await folderService.getByPath(folderPath);

			const fileService = new FileService({ sessionToken });

			return fileService.listFiles({
				pageSize: pageSize || DEFAULT_PAGE_SIZE,
				page: page || 1,
				json: true,
				parentFolder,
			});
		},
	}),
);

const schema = z.object({
	folderName: folderNameSchema,
	parentFolderPath: z.string().min(1).optional(),
});

Parse.Cloud.define(
	functionName.saveAppFileFolder,
	parseFrom({
		requireUser: true,
		allowedRoles: roleSet.ALL,
		action: async ({ req, user }) => {
			const { folderName, parentFolderPath } = schema.parse(req.params);

			const sessionToken = user.getSessionToken();

			const folderService = new FolderService({ sessionToken });

			const parentFolder = await folderService.getByPath(parentFolderPath);

			return folderService.createOne({ name: folderName, parentFolder });
		},
	}),
);
