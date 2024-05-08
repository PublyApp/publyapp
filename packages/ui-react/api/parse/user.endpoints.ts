import _ from 'lodash';

import type { IUser } from '@devist/shared/types/db/user.types';

import { defaultHttp, protectRequest } from '@/shared/lib/axios';
import { endPoint, functionName, PARSE_SESSION_TOKEN_HEADER_KEY } from '@/shared/lib/constants';

import BaseEndPoints from './_base.endpoints';

export default class UserEndPoints extends BaseEndPoints {
	// constructor({ parseRestClient, apiPath}: BaseEndPointsProps) {}

	getUserAuthData = async () => {
		return this.parseRestClient.cloudRun(functionName.getUserAuthData);
	};

	/**
	 * login with username/email and password
	 */
	async passwordLogin(username: string, password: string) {
		console.log(this.parseRestClient.serverUrl, endPoint.api(this.apiPath).auth.passwordLogin);
		return defaultHttp.post<IUser & { sessionToken: string }>(
			this.parseRestClient.serverUrl + endPoint.api(this.apiPath).auth.passwordLogin,
			{ username, password },
			_.merge(protectRequest({}), {
				'X-Parse-Revocable-Session': '1',
				[PARSE_SESSION_TOKEN_HEADER_KEY]: undefined,
			}),
		);
	}
}
