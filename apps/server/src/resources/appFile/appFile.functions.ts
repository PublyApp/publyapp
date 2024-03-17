import z from 'zod';

import { DEFAULT_PAGE_SIZE, functionName, roleSet } from '@devist/shared/lib/constants';

import { parseFrom, type FunctionReturn } from '@/server/lib/parse/utils';
import FileService from '@/server/resources/file/file.service';
import FolderService from '@/server/resources/folder/folder.service';
import type { AppFile } from '@/shared/types/db/appFile.types';
import { folderNameSchema } from '@/shared/validations/file/file.validations';

export type FindAppFileFunctionReturn = FunctionReturn<typeof findAppFileFunction>;

const findAppFileFunction = parseFrom({
	requireUser: false,
	// allowedRoles: roleSet.ALL,
	action: async ({ /* t, */ req, user }) => {
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

const createAppFileFolderSchema = z.object({
	folderName: folderNameSchema,
	parentFolderPath: z.string().min(1).optional(),
});

export type CreateAppFileFunctionReturn = FunctionReturn<typeof createAppFileFolderFunction>;

const createAppFileFolderFunction = parseFrom({
	requireUser: true,
	allowedRoles: roleSet.ALL,
	action: async ({ req, user }) => {
		const { folderName, parentFolderPath } = createAppFileFolderSchema.parse(req.params);

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
