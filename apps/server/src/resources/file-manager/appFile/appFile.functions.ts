import { DEFAULT_PAGE_SIZE, functionName, roleSet } from '@devist/shared/lib/constants';

import { parseFunctionEnhanced, type FunctionReturn } from '@/server/lib/parse/utils';
import FileService from '@/server/resources/file-manager/file/file.service';
import FolderService from '@/server/resources/file-manager/folder/folder.service';
import type { AppFile } from '@/shared/types/db/appFile.types';
import { getMulterCreateFolderSchema } from '@/shared/validations/file/file.validations.server';

export type FindAppFileFunctionReturn = FunctionReturn<typeof findAppFileFunction>;

const findAppFileFunction = parseFunctionEnhanced({
	action: async ({ req, user }) => {
		const { pageSize, page, folderPath } = req.params;

		const sessionToken = user?.getSessionToken();

		const folderService = new FolderService({ sessionToken });

		const parentFolder = await folderService.getByPath(folderPath);

		const fileService = new FileService({ sessionToken, uploadAdapter: FileService.defaultUploadAdapter });

		return fileService.listFiles({
			pageSize: pageSize || DEFAULT_PAGE_SIZE,
			page: page || 1,
			json: true,
			parentFolder,
		});
	},
});

export type CreateAppFileFunctionReturn = FunctionReturn<typeof createAppFileFolderFunction>;

const createAppFileFolderFunction = parseFunctionEnhanced({
	requireUser: true,
	allowedRoles: roleSet.ALL,
	action: async ({ req, user, z }) => {
		const { folderName, parentFolderPath } = getMulterCreateFolderSchema(z).parse(req.params);

		const sessionToken = user.getSessionToken();

		const folderService = new FolderService({ sessionToken });

		const parentFolder = await folderService.getByPath(parentFolderPath);

		const savedFolder = await folderService.createOne({ name: folderName, parentFolder });

		const finalFolder = savedFolder.toJSON() as unknown as AppFile;
		return finalFolder;
	},
});

Parse.Cloud.define(functionName.createAppFileFolder, createAppFileFolderFunction);
Parse.Cloud.define(functionName.findAppFile, findAppFileFunction);
