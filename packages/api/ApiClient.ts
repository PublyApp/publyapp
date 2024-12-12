import type ParseRestClient from '@devist/parse-rest-client/ParseRestClient';

import AuthEndPoints from './features/auth/auth.endpoints';
import BlogEndPoints from './features/blog/blog.endpoints';
import FileManagerEndPoints from './features/file-manager/fileManager.endpoints';

export class ParseApi {
	private _parseRestClient!: ParseRestClient;

	private _blog!: BlogEndPoints;

	private _auth!: AuthEndPoints;

	private _fileManager!: FileManagerEndPoints;

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
		this._blog = new BlogEndPoints({ parseRestClient: this._parseRestClient });
		this._fileManager = new FileManagerEndPoints({
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

	public get blog() {
		this.checkClient();
		return this._blog;
	}

	public get fileManager() {
		this.checkClient();
		return this._fileManager;
	}
}

const parseApi = new ParseApi();

export default parseApi;
