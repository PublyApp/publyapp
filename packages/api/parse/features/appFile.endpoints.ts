import { protectRequest } from '@devist/shared/lib/axios';
import { endPoint, functionName } from '@devist/shared/lib/constants';
import type { AppFile } from '@devist/shared/types/db/appFile.types';

import {
	type CreateAppFileFunctionReturn,
	type FindAppFileFunctionReturn,
} from '@/server/resources/appFile/appFile.functions';

import BaseEndPoints from '../BaseEndPoints';

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
		return this.parseRestClient.cloudRun<FindAppFileFunctionReturn>(functionName.findAppFile, { params });
	}

	async createAppFileFolder(params: CreateAppFileFolderFunctionParams) {
		return this.parseRestClient.cloudRun<CreateAppFileFunctionReturn>(functionName.createAppFileFolder, { params });
	}

	// eslint-disable-next-line class-methods-use-this
	async uploadSingleFile(params: { file: File; parentFolderPath?: string }, options: { restApiKey?: string } = {}) {
		const formData = new FormData();

		formData.set('file', params.file);

		if (params.parentFolderPath) {
			formData.set('parentFolderPath', params.parentFolderPath);
		}

		return this.parseRestClient.http.post<AppFile>(
			this.parseRestClient.serverUrl + endPoint.api(this.apiPath).upload.single,
			formData,
			protectRequest({
				hasFile: true,
				restApiKey: options.restApiKey,
			}),
		);
	}

	// eslint-disable-next-line class-methods-use-this
	async uploadManyFiles(params: { files: File[]; parentFolderPath?: string }, options: { restApiKey?: string } = {}) {
		const formData = new FormData();

		params.files.forEach((file) => {
			formData.append('files', file);
		});

		return this.parseRestClient.http.post<AppFile[]>(
			this.parseRestClient.serverUrl + endPoint.api(this.apiPath).upload.many,
			formData,
			protectRequest({ hasFile: true, restApiKey: options.restApiKey }),
		);
	}
}
