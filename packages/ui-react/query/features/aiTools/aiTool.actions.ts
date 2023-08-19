import { QueryFunction } from '@tanstack/react-query';

import { AITool } from '@aktiveo/shared/types/aiTool.types';
import { functionName } from '@aktiveo/shared/utils/constants';

// --------------------------------------------------------------------------------------//
//                                                                                      //
//                                       QUERIES                                        //
//                                                                                      //
// --------------------------------------------------------------------------------------//
export type GetAIToolsQueryParams = {
	page: number;
	pageSize: number;
};

// TODO: move this type right in the same file of the corresponding cloud function
export type GetAIToolsFunctionResult = {
	aiTools: AITool[];
	meta: {
		totalCount: number;
		count: number;
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

// --------------------------------------------------------------------------------------//
//                                                                                      //
//                                      MUTATIONS                                       //
//                                                                                      //
// --------------------------------------------------------------------------------------//
