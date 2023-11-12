import type { QueryFunction } from '@tanstack/react-query';

import { functionName } from '@devist/shared/lib/constants';
import type { AppFile } from '@devist/shared/types/appFile.types';

// import type { ParseAppFile} from '@devist/shared/lib/parse/classes/appFile.class';

export type FindAppFileFunctionResult = {
	appFiles: AppFile[];
	meta: {
		totalCount: number;
		count: number;
		page: number;
		lastPage: number;
	};
};

export type FindAppFileQueryParams = {
	page?: number;
	pageSize?: number;
	folderPath?: string;
	// sorting?: ColumnSort[];
};

export const findAppFileAction: QueryFunction<
	FindAppFileFunctionResult,
	readonly [typeof functionName.findAppFile, FindAppFileQueryParams]
> = async (context) => {
	try {
		const params = context.queryKey[1];

		const result: FindAppFileFunctionResult = await Parse.Cloud.run(functionName.findAppFile, params);

		return result;
	} catch (error) {
		console.log('----- FindAppFileAction error ----------', error);
		return Promise.reject(error);
	}
};
