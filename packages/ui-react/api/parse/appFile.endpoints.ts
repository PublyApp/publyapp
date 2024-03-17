import type ParseRestClient from 'packages/parse-rest-client/ParseRestClient';

import {
	type CreateAppFileFunctionReturn,
	type FindAppFileFunctionReturn,
} from '@/server/resources/appFile/appFile.functions';
import { functionName } from '@/shared/lib/constants';

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
}
