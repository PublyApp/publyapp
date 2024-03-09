import type { QueryFunction } from '@tanstack/react-query';

import { endPoint, type functionName } from '@devist/shared/lib/constants';
import {
	runCreateAppFileFolder,
	runFindAppFile,
	type CreateAppFileFolderFunctionParams,
	type FindAppFileFunctionParams,
	type FindAppFileFunctionResult,
} from '@devist/shared/lib/parse/cloudRunners/appFile.runner';

import type { AppFile } from '@/shared/types/db/appFile.types';
import { protectRequest, type AxiosHttp } from '@/ui-react/lib/axios';

// import { http } from '@/office/lib/axios/http';
// import { env } from '@/office/lib/env';

// import type { ParseAppFile} from '@devist/shared/lib/parse/classes/appFile.class';

// ---- 1 --------------------------------------------------------------------------------

export type FindAppFileQueryParams = FindAppFileFunctionParams;

export const findAppFileAction: QueryFunction<
	FindAppFileFunctionResult,
	readonly [typeof functionName.findAppFile, FindAppFileQueryParams]
> = async (context) => {
	try {
		const params = context.queryKey[1];

		const result = await runFindAppFile(params);

		return result;
	} catch (error) {
		console.log('----- findAppFileAction error ----------', error);
		return Promise.reject(error);
	}
};

// ---- 2 --------------------------------------------------------------------------------

export type UploadManyFilesActionInput = {
	files?: File[];
	parentFolderPath?: string;
	http: AxiosHttp;
	restApiKey: string;
};

export const uploadManyFilesAction = async (input: UploadManyFilesActionInput) => {
	try {
		const formData = new FormData();

		if (input.parentFolderPath) {
			formData.set('parentFolderPath', input.parentFolderPath);
		}

		input.files?.forEach((file) => {
			formData.append('files', file);
		});

		const sessionToken = (await Parse.User.currentAsync())?.getSessionToken() || '';

		const result = await input.http.post<AppFile[]>(
			endPoint.uploadManyFiles,
			formData,
			protectRequest({ hasFile: true, sessionToken, restApiKey: input.restApiKey }),
		);

		return result;
	} catch (error) {
		console.log('----- uploadManyFilesAction error ----------', error);
		return Promise.reject(error);
	}
};

// ---- 3 --------------------------------------------------------------------------------

export type CreateAppFileFOlderActionParams = CreateAppFileFolderFunctionParams & {
	files?: File[];
	http: AxiosHttp;
	restApiKey: string;
};

export const createAppFileFolderAction = async ({
	parentFolderPath,
	folderName,
	files,
	http,
	restApiKey,
}: CreateAppFileFOlderActionParams) => {
	try {
		const appFileFolder = await runCreateAppFileFolder({ folderName, parentFolderPath });

		let appFiles: AppFile[] = [];

		if (files) {
			const newFilesParentFolderPath = appFileFolder.get('path');
			appFiles = await uploadManyFilesAction({
				files,
				http,
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
