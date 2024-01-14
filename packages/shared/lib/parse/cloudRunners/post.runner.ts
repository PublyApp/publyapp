import { functionName } from '../../constants';
import type { ParsePost } from '../classes/post.class';

import { cloudRunner } from './_cloudRunner';

// ---- 1 --------------------------------------------------------------------------------

export type CreatePostFunctionParams = {
	locale: string;
	title: string;
	description: string;
	content: string;
	slug: string;
	authorId?: string;
	coverId?: string;
};

export type CreatePostFunctionResult = ParsePost;

export const runCreatePost = cloudRunner<CreatePostFunctionResult, CreatePostFunctionParams>(functionName.createPost);

// ---- 2 --------------------------------------------------------------------------------

export type GetPostByIdFunctionParams = {
	id: string;
};

export type GetPostByIdFunctionResult = ParsePost;

export const runGetPostById = cloudRunner<GetPostByIdFunctionResult, GetPostByIdFunctionParams>(functionName.getPost);
