import { getProtectionHeaders } from '@org/shared/lib/axios';
import { endPoint, functionName } from '@org/shared/lib/constants';
import type { AppFile } from '@org/shared/types/db/appFile.types';

import {
	type CreateAppFileFunctionReturn,
	type FindAppFileFunctionReturn,
} from '@/server/modules/tenant/file-manager/appFile/appFile.functions';

import BaseEndPoints from '../../classes/BaseEndPoints';

export type FindAppFileFunctionParams = {
	page?: number;
	pageSize?: number;
	folderPath?: string;
};

export type CreateAppFileFolderFunctionParams = {
	folderName: string;
	parentFolderPath?: string;
};

export default class AppFileEndPoints extends BaseEndPoints {
	async findAppFile(params: FindAppFileFunctionParams) {
		return this.parseRestClient.cloudRun<FindAppFileFunctionReturn>(functionName.fileManager.findAppFile, { params });
	}

	async createAppFileFolder(params: CreateAppFileFolderFunctionParams) {
		return this.parseRestClient.cloudRun<CreateAppFileFunctionReturn>(functionName.fileManager.createAppFileFolder, {
			params,
		});
	}

	async uploadSingleFile(params: { file: File; parentFolderPath?: string }, options: { restApiKey?: string } = {}) {
		const formData = new FormData();

		formData.set('file', params.file);

		if (params.parentFolderPath) {
			formData.set('parentFolderPath', params.parentFolderPath);
		}

		return this.parseRestClient.http.post<AppFile>(
			this.parseRestClient.serverUrl + endPoint.api.upload.single,
			formData,
			{
				headers: getProtectionHeaders({
					hasFile: true,
					restApiKey: options.restApiKey,
				}),
			},
		);
	}

	async uploadManyFiles(params: { files: File[]; parentFolderPath?: string }, options: { restApiKey?: string } = {}) {
		const formData = new FormData();

		params.files.forEach((file) => {
			formData.append('files', file);
		});

		return this.parseRestClient.http.post<AppFile[]>(
			this.parseRestClient.serverUrl + endPoint.api.upload.many,
			formData,
			{ headers: getProtectionHeaders({ hasFile: true, restApiKey: options.restApiKey }) },
		);
	}
}
