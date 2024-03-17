import { queryOptions, type QueryFunctionContext } from '@tanstack/react-query';

// import {
// 	// runCreatePost,
// 	// runFindPost,
// 	// runGetPostById,
// 	// type CreatePostFunctionParams,
// 	// type FindPostFunctionResult,
// 	// type FinPostFunctionParams,
// 	// type GetPostByIdFunctionParams,
// } from '@devist/shared/lib/parse/cloudRunners/post.runner';

import { functionName } from '@/shared/lib/constants';
import type { AppLocale } from '@/shared/lib/i18n/resources';
import type ParseApi from '@/ui-react/api/parse/ParseApi';
import type {
	CreatePostFunctionParams,
	FindPostFunctionParams,
	GetPostByIdFunctionParams,
	UpdatePostFunctionParams,
} from '@/ui-react/api/parse/post.endpoints';

// == createPost ==================
export type CreatePostActionParams = CreatePostFunctionParams;

// == getPostById ===================
export type GetPostByIdQueryParams = GetPostByIdFunctionParams;

// == findPost =================
export type FindPostQueryParams = FindPostFunctionParams & { locale: AppLocale };

// == updatePost ===================
export type UpdatePostActionParams = UpdatePostFunctionParams;

export default class PostActions {
	constructor(private parseApi: ParseApi) {
		this.createPostAction = this.createPostAction.bind(this);
		this.findPostAction = this.findPostAction.bind(this);

		this.getPostByIdQuery = this.getPostByIdQuery.bind(this);
		this.getPostByIdAction = this.getPostByIdAction.bind(this);

		this.updatePostAction = this.updatePostAction.bind(this);
	}

	// == createPost ==================

	static readonly createPostMutationKeyBase = functionName.createPost;

	async createPostAction(params: CreatePostActionParams) {
		try {
			const post = await this.parseApi.posts.createPost(params);
			return post;
		} catch (error) {
			console.log('----- createPostAction error ----------', error);
			return Promise.reject(error);
		}
	}

	// === findPost =================

	static readonly findPostQueryKeyBase = functionName.findPost;

	findPostQuery(params: FindPostQueryParams) {
		return queryOptions({
			queryKey: [PostActions.findPostQueryKeyBase, params] as const,
			queryFn: this.findPostAction,
		});
	}

	async findPostAction(context: QueryFunctionContext<readonly [typeof functionName.findPost, FindPostQueryParams]>) {
		try {
			const params = context.queryKey[1];
			const posts = this.parseApi.posts.findPost(params);
			return await posts;
		} catch (error) {
			console.log('----- findPostAction error ----------', error);
			return Promise.reject(error);
		}
	}

	// == getPostById ===================
	static readonly getPostQueryKeyBase = functionName.getPost;

	getPostByIdQuery(params: GetPostByIdQueryParams) {
		return queryOptions({
			queryKey: [PostActions.getPostQueryKeyBase, params] as const,
			queryFn: this.getPostByIdAction,
		});
	}

	async getPostByIdAction(
		context: QueryFunctionContext<readonly [typeof PostActions.getPostQueryKeyBase, GetPostByIdQueryParams]>,
	) {
		try {
			const params = context.queryKey[1];

			// const post = await runGetPostById(params);
			const post = await this.parseApi.posts.getPostById(params);
			return post;
		} catch (error) {
			console.log('----- getPostByIdAction error ----------', error);
			return Promise.reject(error);
		}
	}

	// == updatePost ===================
	static readonly updatePostMutationKeyBase = functionName.updatePost;

	async updatePostAction(params: UpdatePostActionParams) {
		try {
			const post = await this.parseApi.posts.updatePost(params);
			return post;
		} catch (error) {
			console.log('----- updatePostAction error ----------', error);
			return Promise.reject(error);
		}
	}
}
