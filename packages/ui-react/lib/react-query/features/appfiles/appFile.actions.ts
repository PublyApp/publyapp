import type { QueryFunctionContext } from '@tanstack/react-query';

import { type functionName } from '@devist/shared/lib/constants';

import type { AppFile } from '@/shared/types/db/appFile.types';
import type {
	CreateAppFileFolderFunctionParams,
	FindAppFileFunctionParams,
} from '@/ui-react/api/parse/appFile.endpoints';
import type ParseApi from '@/ui-react/api/parse/ParseApi';

export type FindAppFileQueryParams = FindAppFileFunctionParams;

export default class PostActions {
	constructor(private parseApi: ParseApi) {}

	async findAppFileAction(
		context: QueryFunctionContext<readonly [typeof functionName.findAppFile, FindAppFileQueryParams]>,
	) {
		try {
			const params = context.queryKey[1];

			const result = await this.parseApi.appFiles.findAppFile(params);

			return result;
		} catch (error) {
			console.log('----- findAppFileAction error ----------', error);
			return Promise.reject(error);
		}
	}

	async uploadManyFilesAction(params: UploadManyFilesActionParams) {
		try {
			const result = this.parseApi.parseRestClient.uploadManyFiles(
				{ files: params.files || [], parentFolderPath: params.parentFolderPath },
				{ restApiKey: params.restApiKey },
			);

			return await result;
		} catch (error) {
			console.log('----- uploadManyFilesAction error ----------', error);
			return Promise.reject(error);
		}
	}

	async createAppFileFolderAction({
		parentFolderPath,
		folderName,
		files,
		restApiKey,
	}: CreateAppFileFolderActionParams) {
		try {
			const appFileFolder = await this.parseApi.appFiles.createAppFileFolder({ folderName, parentFolderPath });

			let appFiles: AppFile[] = [];

			if (files) {
				const newFilesParentFolderPath = appFileFolder.path;

				appFiles = await this.uploadManyFilesAction({
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
	}
}

// ---- 2 --------------------------------------------------------------------------------

export type UploadManyFilesActionParams = {
	files?: File[];
	parentFolderPath?: string;
	restApiKey?: string;
};

// ---- 3 --------------------------------------------------------------------------------

export type CreateAppFileFolderActionParams = CreateAppFileFolderFunctionParams & {
	files?: File[];
	restApiKey?: string;
};
