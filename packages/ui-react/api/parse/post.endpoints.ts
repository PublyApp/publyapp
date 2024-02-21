import type ParseRestClient from '@devist/parse-rest-client/ParseRestClient';

import { functionName } from '@/shared/lib/constants';
import type { IPostWithRelations } from '@/shared/types/db/post.types';

type FindPostParams = {
	page: number;
	pagesize?: number;
	// no sorting yet
};

export class PostEndPoints {
	constructor(private parseRestClient: ParseRestClient) {}

	async findPost({ page }: FindPostParams) {
		return this.parseRestClient.cloudRun<IPostWithRelations[]>(functionName.findPost, {
			params: { view: 'front-list', page },
		});
	}
}
