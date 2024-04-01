import type ParseRestClient from '@devist/parse-rest-client/ParseRestClient';

import i18n from '@/ui-react/lib/i18n';

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

	private checkClient() {
		if (!this._parseRestClient) {
			throw new Error(i18n.t('must-init-parse-api') || 'must-init-parse-api');
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
		this.checkClient();
		return this._parseRestClient;
	}

	public get users() {
		this.checkClient();
		return this._users;
	}

	public get posts() {
		this.checkClient();
		return this._posts;
	}

	public get appFiles() {
		this.checkClient();
		return this._appFiles;
	}
}

const parseApi = new ParseApi();

export default parseApi;
