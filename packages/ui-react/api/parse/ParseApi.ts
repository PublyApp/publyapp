import type ParseRestClient from '@devist/parse-rest-client/ParseRestClient';

import AppFileEndPoints from './appFile.endpoints';
import { PostEndPoints } from './post.endpoints';
import UserEndPoints from './user.endpoints';

export class ParseApi {
	private _parseRestClient!: ParseRestClient;

	private _posts!: PostEndPoints;

	private _users!: UserEndPoints;

	private _appFiles!: AppFileEndPoints;

	constructor({ parseRestClient }: { parseRestClient?: ParseRestClient } = {}) {
		if (parseRestClient) {
			this.setRestClient(parseRestClient);
		}
	}

	setRestClient(parseRestClient: ParseRestClient) {
		this._parseRestClient = parseRestClient;

		// endpoints
		this._users = new UserEndPoints(this._parseRestClient);
		this._posts = new PostEndPoints(this._parseRestClient);
		this._appFiles = new AppFileEndPoints(this._parseRestClient);
	}

	public get parseRestClient() {
		return this._parseRestClient;
	}

	public get users() {
		return this._users;
	}

	public get posts() {
		return this._posts;
	}

	public get appFiles() {
		return this._appFiles;
	}
}

const parseApi = new ParseApi();

export default parseApi;
