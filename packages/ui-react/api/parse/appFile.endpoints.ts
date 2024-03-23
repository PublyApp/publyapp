import type ParseRestClient from 'packages/parse-rest-client/ParseRestClient';

import {
	type CreateAppFileFunctionReturn,
	type FindAppFileFunctionReturn,
} from '@/server/resources/appFile/appFile.functions';
import { defaultHttp, protectRequest } from '@/shared/lib/axios';
import { endPoint, functionName } from '@/shared/lib/constants';
import type { AppFile } from '@/shared/types/db/appFile.types';

export type FindAppFileFunctionParams = {
	page?: number;
	pageSize?: number;
	folderPath?: string;
};

export type CreateAppFileFolderFunctionParams = {
	folderName: string;
	parentFolderPath?: string;
};

export default class AppFileEndPoints {
	constructor(private parseRestClient: ParseRestClient) {}

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

		const url = new URL(this.parseRestClient.parseServerUrl);

		return defaultHttp.post<AppFile>(
			url.origin + endPoint.uploadSingleFile,
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

		const url = new URL(this.parseRestClient.parseServerUrl);

		return defaultHttp.post<AppFile[]>(
			url.origin + endPoint.uploadManyFiles,
			formData,
			protectRequest({ hasFile: true, restApiKey: options.restApiKey }),
		);
	}
}
