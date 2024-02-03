import { functionName } from '@/shared/lib/constants';
import type { IPostWithRelations } from '@/shared/types/db/post.types';

import { parseApi } from '../client';

export const findPost = async ({ pageNum }: { pageNum: number }) => {
	return parseApi.cloudRun<IPostWithRelations[]>(functionName.findPost, { params: { pageNum } });
};
