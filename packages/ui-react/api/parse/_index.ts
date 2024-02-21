import type ParseRestClient from '@devist/parse-rest-client/ParseRestClient';

import { PostEndPoints } from './post.endpoints';

export default class ParseApi {
	readonly parseRestClient: ParseRestClient;

	readonly posts: PostEndPoints;

	constructor({ parseRestClient }: { parseRestClient: ParseRestClient }) {
		this.parseRestClient = parseRestClient;

		// endpoints
		this.posts = new PostEndPoints(this.parseRestClient);
	}
}
