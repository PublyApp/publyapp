import type ParseRestClient from '@org/parse-rest-client/ParseRestClient';

import AuthEndPoints from './features/auth/auth.endpoints';

import TenantEndPoints from './features/tenant/tenant.endpoints';

export class ApiClient {
	private _parseRestClient!: ParseRestClient;

	private _auth!: AuthEndPoints;

	private _tenant!: TenantEndPoints;

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
		this._tenant = new TenantEndPoints({
			parseRestClient: this._parseRestClient,
		});
	}

	public get parseRestClient() {
		this.checkClient();
		return this._parseRestClient;
	}

	public get auth() {
		this.checkClient();
		return this._auth;
	}

	public get tenant() {
		this.checkClient();
		return this._tenant;
	}
}

export const defaultApiClient = new ApiClient();
