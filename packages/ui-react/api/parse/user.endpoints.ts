import _ from 'lodash';

import type ParseRestClient from '@devist/parse-rest-client/ParseRestClient';
import type { IUser } from '@devist/shared/types/db/user.types';

import { defaultHttp, protectRequest } from '@/shared/lib/axios';
import { endPoint, functionName, PARSE_SESSION_TOKEN_HEADER_KEY } from '@/shared/lib/constants';

export default class UserEndPoints {
	constructor(private parseRestClient: ParseRestClient) {}

	// async findUser({ page }: FindUserParams) {
	// 	return this.parseRestClient.cloudRun<IUser[]>(functionName.findUser, {
	// 		params: { view: 'front-list', page },
	// 	});
	// }

	getUserAuthData = async () => {
		return this.parseRestClient.cloudRun(functionName.getUserAuthData);
	};

	/**
	 * login with username/email and password
	 */
	async passwordLogin(username: string, password: string) {
		const url = new URL(this.parseRestClient.parseServerUrl);

		return defaultHttp.post<IUser & { sessionToken: string }>(
			url.origin + endPoint.passwordLogin,
			{ username, password },
			_.merge(protectRequest({}), {
				'X-Parse-Revocable-Session': '1',
				[PARSE_SESSION_TOKEN_HEADER_KEY]: undefined,
			}),
		);
	}
}
