import Parse from 'parse';

import type { MutationFunction } from '@tanstack/react-query';

import type { ParseWebHost } from '@devist/shared/parse/classes/webHost.class';
import { functionName } from '@devist/shared/utils/constants';
import type { CreateWebHostInput } from '@devist/shared/validations/webHost.validations';

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
