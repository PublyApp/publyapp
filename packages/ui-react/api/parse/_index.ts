import type ParseRestClient from '@devist/parse-rest-client/ParseRestClient';

import { PostEndPoints } from './post.endpoints';
import UserEndPoints from './user.endpoints';

export default class ParseApi {
	readonly parseRestClient: ParseRestClient;

	readonly posts: PostEndPoints;

	readonly users: UserEndPoints;

	constructor({ parseRestClient }: { parseRestClient: ParseRestClient }) {
		this.parseRestClient = parseRestClient;

		// endpoints
		this.posts = new PostEndPoints(this.parseRestClient);
		this.users = new UserEndPoints(this.parseRestClient);
	}
}
