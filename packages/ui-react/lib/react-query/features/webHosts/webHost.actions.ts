import Parse from 'parse';

import type { MutationFunction, QueryFunction } from '@tanstack/react-query';
import type { ColumnSort } from '@tanstack/react-table';

import { functionName } from '@devist/shared/lib/constants';
import type { ParseWebHost } from '@devist/shared/lib/parse/classes/webHost.class';
import type { WebHost } from '@devist/shared/types/db/webHost.types';
import type { SaveWebHostInput } from '@devist/shared/validations/webHost.validations';

// --------------------------------------------------------------------------------------//
//                                                                                      //
//                                       QUERIES                                        //
//                                                                                      //
// --------------------------------------------------------------------------------------//
export type FindWebHostQueryParams = {
	page?: number;
	pageSize?: number;
	sorting?: ColumnSort[];
};

// TODO: move this type right in the same file of the corresponding cloud function ? maybe ?
export type FindWebHostFunctionResult = {
	webHosts: WebHost[];
	meta: {
		totalCount: number;
		count: number;
		page: number;
		lastPage: number;
	};
};

export const findWebHostAction: QueryFunction<
	FindWebHostFunctionResult,
	readonly [typeof functionName.findWebHost, FindWebHostQueryParams]
> = async (context) => {
	try {
		const params = context.queryKey[1];

		const result: FindWebHostFunctionResult = await Parse.Cloud.run(functionName.findWebHost, params);

		return result;
	} catch (error) {
		console.log('----- FindWebHostAction error ----------', error);
		return Promise.reject(error);
	}
};

// --------------------------------------------------------------------------------------//
//                                                                                      //
//                                      MUTATIONS                                       //
//                                                                                      //
// --------------------------------------------------------------------------------------//

export const saveWebHostAction: MutationFunction<ParseWebHost, SaveWebHostInput> = async (data) => {
	try {
		const result = (await Parse.Cloud.run(functionName.saveWebHost, data)) as ParseWebHost;

		return result;
	} catch (error) {
		console.log('----- saveWebHostAction error ----------', error);
		return Promise.reject(error);
	}
};
