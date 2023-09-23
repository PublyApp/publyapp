import Parse from 'parse';

import type { MutationFunction, QueryFunction } from '@tanstack/react-query';
import type { ColumnSort } from '@tanstack/react-table';

import type { AITool } from '@devist/shared/types/aiTool.types';
import { functionName } from '@devist/shared/utils/constants';

// --------------------------------------------------------------------------------------//
//                                                                                      //
//                                       QUERIES                                        //
//                                                                                      //
// --------------------------------------------------------------------------------------//
export type GetAIToolsQueryParams = {
	page?: number;
	pageSize?: number;
	sorting?: ColumnSort[];
};

// TODO: move this type right in the same file of the corresponding cloud function
export type GetAIToolsFunctionResult = {
	aiTools: AITool[];
	meta: {
		totalCount: number;
		count: number;
		page: number;
		lastPage: number;
	};
};

export const getAIToolsAction: QueryFunction<
	GetAIToolsFunctionResult,
	readonly [typeof functionName.getAITools, GetAIToolsQueryParams]
> = async (context) => {
	try {
		const params = context.queryKey[1];

		const result: GetAIToolsFunctionResult = await Parse.Cloud.run(functionName.getAITools, params);

		return result;
	} catch (error) {
		console.log('----- getAIToolsAction error ----------', error);
		return Promise.reject(error);
	}
};

export type GetInfiniteAIToolsQueryParams = {
	pageSize?: number;
};

export const getInfiniteAIToolsAction: QueryFunction<
	GetAIToolsFunctionResult,
	readonly [typeof functionName.getAITools, 'Infinite', GetInfiniteAIToolsQueryParams],
	{ page?: number }
> = async (context) => {
	try {
		const {
			pageParam,
			queryKey: { 2: params },
		} = context;

		const result: GetAIToolsFunctionResult = await Parse.Cloud.run(functionName.getAITools, {
			page: pageParam.page,
			...params,
		});

		return result;
	} catch (error) {
		console.log('----- getInfiniteAIToolsAction error ----------', error);
		return Promise.reject(error);
	}
};

// --------------------------------------------------------------------------------------//
//                                                                                      //
//                                      MUTATIONS                                       //
//                                                                                      //
// --------------------------------------------------------------------------------------//

export const createAIToolAction: MutationFunction = () => {
	try {
		const result = Parse.Cloud.run(functionName.createAITool);

		return result;
	} catch (error) {
		console.log('----- createAIToolAction error ----------', error);
		return Promise.reject(error);
	}
};
