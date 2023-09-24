import Parse from 'parse';

import type { MutationFunction, QueryFunction } from '@tanstack/react-query';
import type { ColumnSort } from '@tanstack/react-table';

import type { ParseWebHost } from '@devist/shared/parse/classes/webHost.class';
import type { WebHost } from '@devist/shared/types/webHost.types';
import { functionName } from '@devist/shared/utils/constants';
import type { CreateWebHostInput } from '@devist/shared/validations/webHost.validations';

// --------------------------------------------------------------------------------------//
//                                                                                      //
//                                       QUERIES                                        //
//                                                                                      //
// --------------------------------------------------------------------------------------//
export type GetWebHostsQueryParams = {
	page?: number;
	pageSize?: number;
	sorting?: ColumnSort[];
};

// TODO: move this type right in the same file of the corresponding cloud function
export type GetWebHostsFunctionResult = {
	webHosts: WebHost[];
	meta: {
		totalCount: number;
		count: number;
		page: number;
		lastPage: number;
	};
};

export const getWebHostsAction: QueryFunction<
	GetWebHostsFunctionResult,
	readonly [typeof functionName.getWebHosts, GetWebHostsQueryParams]
> = async (context) => {
	try {
		const params = context.queryKey[1];

		const result: GetWebHostsFunctionResult = await Parse.Cloud.run(functionName.getWebHosts, params);

		return result;
	} catch (error) {
		console.log('----- getWebHostsAction error ----------', error);
		return Promise.reject(error);
	}
};

// --------------------------------------------------------------------------------------//
//                                                                                      //
//                                      MUTATIONS                                       //
//                                                                                      //
// --------------------------------------------------------------------------------------//

export const createWebHostAction: MutationFunction<ParseWebHost, CreateWebHostInput> = async (data) => {
	try {
		const result = (await Parse.Cloud.run(functionName.createWebHost, data)) as ParseWebHost;

		return result;
	} catch (error) {
		console.log('----- createWebHostAction error ----------', error);
		return Promise.reject(error);
	}
};
