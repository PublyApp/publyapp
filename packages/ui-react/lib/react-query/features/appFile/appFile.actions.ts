import type { QueryFunctionContext } from '@tanstack/react-query';

import type {
	CreateAppFileFolderFunctionParams,
	FindAppFileFunctionParams,
} from '@devist/api/parse/features/file-manager/fileManager.endpoints';
import parseApi from '@devist/api/parse/ParseApi';
import { type functionName } from '@devist/shared/lib/constants';

import type { AppFile } from '@/shared/types/db/appFile.types';

// ---- 1 --------------------------------------------------------------------------------

export type FindAppFileQueryParams = FindAppFileFunctionParams;

export const findAppFileAction = async (
	context: QueryFunctionContext<readonly [typeof functionName.fileManager.findAppFile, FindAppFileQueryParams]>,
) => {
	try {
		const params = context.queryKey[1];

		const result = await parseApi.fileManager.findAppFile(params);

		return result;
	} catch (error) {
		console.log('----- findAppFileAction error ----------', error);
		return Promise.reject(error);
	}
};

export const uploadSingleFileAction = async (params: { file: File }) => {
	try {
		return await parseApi.fileManager.uploadSingleFile(params);
	} catch (error) {
		console.log('----- uploadSingleFileAction error ----------', error);
		return Promise.reject(error);
	}
};

// ---- 2 --------------------------------------------------------------------------------

export type UploadManyFilesActionParams = {
	files?: File[];
	parentFolderPath?: string;
	restApiKey?: string;
};

export const uploadManyFilesAction = async (params: UploadManyFilesActionParams) => {
	try {
		const result = parseApi.fileManager.uploadManyFiles(
			{ files: params.files || [], parentFolderPath: params.parentFolderPath },
			{ restApiKey: params.restApiKey },
		);

		return await result;
	} catch (error) {
		console.log('----- uploadManyFilesAction error ----------', error);
		return Promise.reject(error);
	}
};

// ---- 3 --------------------------------------------------------------------------------

export type CreateAppFileFolderActionParams = CreateAppFileFolderFunctionParams & {
	files?: File[];
	restApiKey?: string;
};

export const createAppFileFolderAction = async ({
	parentFolderPath,
	folderName,
	files,
	restApiKey,
}: CreateAppFileFolderActionParams) => {
	try {
		const appFileFolder = await parseApi.fileManager.createAppFileFolder({ folderName, parentFolderPath });

		let appFiles: AppFile[] = [];

		if (files) {
			const newFilesParentFolderPath = appFileFolder.path;

			appFiles = await uploadManyFilesAction({
				files,
				restApiKey,
				parentFolderPath: newFilesParentFolderPath,
			});
		}

		return {
			appFileFolder,
			appFiles,
		};
	} catch (error) {
		console.log('----- createAppFileFolderAction error ----------', error);
		return Promise.reject(error);
	}
};
