import type { AppFile } from '@/shared/types/db/appFile.types';

import { functionName } from '../../constants';
import type { ParseAppFile } from '../classes/appFile.class';

import { cloudRunner } from './_cloudRunner';

// ---- 1 --------------------------------------------------------------------------------

export type CreateAppFileFolderFunctionParams = {
	folderName: string;
	parentFolderPath?: string;
};

export const runCreateAppFileFolder = cloudRunner<ParseAppFile, CreateAppFileFolderFunctionParams>(
	functionName.saveAppFileFolder,
);

// ---- 2 --------------------------------------------------------------------------------

export type UpdateAppFileFolderFunctionParams = {
	folderName: string;
	parentFolderPath: string;
	newFolderName?: string;
	newParentFolderPath?: string;
};

export const runUpdateAppFileFolder = cloudRunner<ParseAppFile, UpdateAppFileFolderFunctionParams>(
	functionName.saveAppFileFolder,
);

// ---- 3 --------------------------------------------------------------------------------

export type FindAppFileFunctionResult = {
	appFiles: AppFile[];
	meta: {
		totalCount: number;
		count: number;
		page: number;
		lastPage: number;
	};
};

export type FindAppFileFunctionParams = {
	page?: number;
	pageSize?: number;
	folderPath?: string;
	// sorting?: ColumnSort[];
};

export const runFindAppFile = cloudRunner<FindAppFileFunctionResult, FindAppFileFunctionParams>(
	functionName.findAppFile,
);
