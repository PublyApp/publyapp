import type ParseRestClient from '@org/parse-rest-client/ParseRestClient';

import AuthEndPoints from './features/auth/auth.endpoints';

export class ApiClient {
	private _parseRestClient!: ParseRestClient;

	private _auth!: AuthEndPoints;

	constructor({ parseRestClient }: { parseRestClient?: ParseRestClient } = {}) {
		if (parseRestClient) {
			this.setRestClient(parseRestClient);
		}
	}

	private checkClient() {
		if (!this._parseRestClient) {
			throw new Error('Must init with a REST client');
		}
	}

	setRestClient(parseRestClient: ParseRestClient) {
		this._parseRestClient = parseRestClient;

		// endpoints
		this._auth = new AuthEndPoints({ parseRestClient: this._parseRestClient });
	}

	public get parseRestClient() {
		this.checkClient();
		return this._parseRestClient;
	}

	public get auth() {
		this.checkClient();
		return this._auth;
	}
}

export const defaultApiClient = new ApiClient();
