import type {
	CreatePostFunctionReturn,
	FindPostFunctionReturn,
	GetPostFunctionReturn,
} from '@/server/resources/post/post.functions';

import { functionName } from '../../constants';
import type { AppLocale } from '../../i18n/resources';

import { cloudRunner } from './_cloudRunner';

// ---- 1 --------------------------------------------------------------------------------

export type CreatePostFunctionParams = {
	locale: AppLocale;
	title: string;
	description: string;
	content: string;
	slug: string;
	authorId?: string;
	coverId?: string;
};

export type CreatePostFunctionResult = CreatePostFunctionReturn;

export const runCreatePost = cloudRunner<CreatePostFunctionResult, CreatePostFunctionParams>(functionName.createPost);

// ---- 2 --------------------------------------------------------------------------------

export type GetPostByIdFunctionParams = {
	id: string;
};

export type GetPostByIdFunctionResult = GetPostFunctionReturn;

export const runGetPostById = cloudRunner<GetPostByIdFunctionResult, GetPostByIdFunctionParams>(functionName.getPost);

// ---- 3 --------------------------------------------------------------------------------

export type FinPostFunctionParams = {
	page?: number;
};

export type FindPostFunctionResult = FindPostFunctionReturn;

export const runFindPost = cloudRunner<FindPostFunctionResult, FinPostFunctionParams>(functionName.findPost);
