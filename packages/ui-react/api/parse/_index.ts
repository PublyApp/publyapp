import type ParseRestClient from '@devist/parse-rest-client/ParseRestClient';

import AppFileEndPoints from './appFile.endpoints';
import { PostEndPoints } from './post.endpoints';
import UserEndPoints from './user.endpoints';

export default class ParseApi {
	readonly parseRestClient: ParseRestClient;

	readonly posts: PostEndPoints;

	readonly users: UserEndPoints;

	readonly appFiles: AppFileEndPoints;

	constructor({ parseRestClient }: { parseRestClient: ParseRestClient }) {
		this.parseRestClient = parseRestClient;

		// endpoints
		this.users = new UserEndPoints(this.parseRestClient);
		this.posts = new PostEndPoints(this.parseRestClient);
		this.appFiles = new AppFileEndPoints(this.parseRestClient);
	}
}
