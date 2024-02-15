import { functionName } from '@/shared/lib/constants';
import type { IPostWithRelations } from '@/shared/types/db/post.types';

import { parseApi } from '../client';

type FindPostParams = {
	page: number;
	pagesize?: number;
	// no sorting yet
};

export const findPost = async ({ page }: FindPostParams) => {
	return parseApi.cloudRun<IPostWithRelations[]>(functionName.findPost, { params: { view: 'front-list', page } });
};
