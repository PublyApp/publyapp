import type ParseRestClient from '@devist/parse-rest-client/ParseRestClient';

import AppFileEndPoints from './features/appFile.endpoints';
import BlogPostEndPoints from './features/blogPost.endpoints';
import UserEndPoints from './features/user.endpoints';

const defaultProps = {
	apiPath: '/api',
};

export class ParseApi {
	private _parseRestClient!: ParseRestClient;

	private _blogPosts!: BlogPostEndPoints;

	private _users!: UserEndPoints;

	private _appFiles!: AppFileEndPoints;

	public apiPath: string;

	constructor({
		parseRestClient,
		apiPath = defaultProps.apiPath,
	}: { parseRestClient?: ParseRestClient; apiPath?: string } = defaultProps) {
		if (parseRestClient) {
			this.setRestClient(parseRestClient);
		}

		this.apiPath = apiPath;
	}

	private checkClient() {
		if (!this._parseRestClient) {
			throw new Error('Must init with a REST client');
		}
	}

	setRestClient(parseRestClient: ParseRestClient) {
		this._parseRestClient = parseRestClient;

		// endpoints
		this._users = new UserEndPoints({ parseRestClient: this._parseRestClient, apiPath: this.apiPath });
		this._blogPosts = new BlogPostEndPoints({ parseRestClient: this._parseRestClient, apiPath: this.apiPath });
		this._appFiles = new AppFileEndPoints({ parseRestClient: this._parseRestClient, apiPath: this.apiPath });
	}

	public get parseRestClient() {
		this.checkClient();
		return this._parseRestClient;
	}

	public get users() {
		this.checkClient();
		return this._users;
	}

	public get blogPosts() {
		this.checkClient();
		return this._blogPosts;
	}

	public get appFiles() {
		this.checkClient();
		return this._appFiles;
	}
}

const parseApi = new ParseApi();

export default parseApi;
