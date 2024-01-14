import type { QueryFunction } from '@tanstack/react-query';

import {
	runCreatePost,
	runGetPostById,
	type CreatePostFunctionParams,
	type GetPostByIdFunctionParams,
	// type GetPostByIdFunctionResult,
} from '@devist/shared/lib/parse/cloudRunners/post.runner';

import type { functionName } from '@/shared/lib/constants';
import type { IPostWithRelations } from '@/shared/types/db/post.types';

// ---- 1 --------------------------------------------------------------------------------

type CreatePostActionParams = CreatePostFunctionParams;

export const createPostAction = async (params: CreatePostActionParams) => {
	try {
		const post = await runCreatePost(params);
		return post.toJSON() as unknown as IPostWithRelations;
	} catch (error) {
		console.log('----- createPostAction error ----------', error);
		return Promise.reject(error);
	}
};

// ---- 2 --------------------------------------------------------------------------------

export type GetPostByIdQueryParams = GetPostByIdFunctionParams;
export type GetPostByIdActionResult = IPostWithRelations;

export const getPostByIdAction: QueryFunction<
	GetPostByIdActionResult,
	readonly [typeof functionName.getPost, GetPostByIdQueryParams]
> = async (context) => {
	try {
		const params = context.queryKey[1];

		const post = await runGetPostById(params);
		return post.toJSON() as unknown as IPostWithRelations;
	} catch (error) {
		console.log('----- getPostByIdAction error ----------', error);
		return Promise.reject(error);
	}
};

// ---- 3 --------------------------------------------------------------------------------

export const updatePostMutationAction = async () => {
	return null;
};
