import type ParseRestClient from 'packages/parse-rest-client/ParseRestClient';

import { functionName } from '@/shared/lib/constants';

export default class UserEndPoints {
	constructor(private parseRestClient: ParseRestClient) {}

	// async findUser({ page }: FindUserParams) {
	// 	return this.parseRestClient.cloudRun<IUser[]>(functionName.findUser, {
	// 		params: { view: 'front-list', page },
	// 	});
	// }

	async getUserAuthData() {
		return this.parseRestClient.cloudRun(functionName.getUserAuthData);
	}
}
