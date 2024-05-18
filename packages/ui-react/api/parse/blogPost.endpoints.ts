import type {
	CreatePostFunction,
	FindPostFunction,
	GetPostFunction,
	UpdatePostFunction,
} from '@/server/resources/blogPost/blogPost.functions';
import { functionName } from '@/shared/lib/constants';
import type { AppLocale } from '@/shared/lib/i18n/resources';

import BaseEndPoints, { type BaseEndPointsProps } from './_base.endpoints';

// == create post
export type CreatePostFunctionParams = {
	locale: AppLocale;
	title: string;
	description: string;
	content: string;
	slug: string;
	authorId?: string;
	coverId?: string;
};

// == updatePost
export type UpdatePostFunctionParams = Partial<Omit<CreatePostFunctionParams, 'locale'>> & {
	locale: AppLocale;
	published?: boolean;
};

export default class BlogPostEndPoints extends BaseEndPoints {
	constructor({ parseRestClient, apiPath }: BaseEndPointsProps) {
		super({ parseRestClient, apiPath });

		this.findPostBoTable = this.findPostBoTable.bind(this);
		this.findPostFrontList = this.findPostFrontList.bind(this);
		this.findPostTag = this.findPostTag.bind(this);
		this.getPostDetailFront = this.getPostDetailFront.bind(this);
		this.getRelatedPostsFrontDetails = this.getRelatedPostsFrontDetails.bind(this);
	}

	async findPostBoTable(params: FindPostFunction.BoTable.Params) {
		const posts = await this.parseRestClient.cloudRun<FindPostFunction.BoTable.Return>(functionName.findPostBoTable, {
			params,
		});

		return posts;
	}

	async findPostFrontList(params: FindPostFunction.FrontList.Params) {
		const posts = await this.parseRestClient.cloudRun<FindPostFunction.FrontList.Return>(
			functionName.findPostFrontList,
			{ params },
		);
		return posts;
	}

	async createPost(params: CreatePostFunctionParams) {
		const post = await this.parseRestClient.cloudRun<CreatePostFunction.Return>(functionName.createPost, { params });
		return post;
	}

	async getPostBoEditForm(params: GetPostFunction.BoEdit.Params) {
		const post = await this.parseRestClient.cloudRun<GetPostFunction.BoEdit.Return, GetPostFunction.BoEdit.Params>(
			functionName.getPostBoEdit,
			{ params },
		);
		return post;
	}

	async updatePost(params: UpdatePostFunctionParams) {
		const post = await this.parseRestClient.cloudRun<UpdatePostFunction.Return>(functionName.updatePost, { params });

		return post;
	}

	async findPostTag() {
		const tags = await this.parseRestClient.cloudRun<any>(functionName.findPostTag);
		return tags;
	}

	async getPostDetailFront(params: GetPostFunction.FrontView.Params) {
		// throw new Error('Method not implemented.');
		return this.parseRestClient.cloudRun<GetPostFunction.FrontView.Return, GetPostFunction.FrontView.Params>(
			functionName.getPostFrontDetails,
			{ params },
		);
	}

	async getRelatedPostsFrontDetails(params: FindPostFunction.FrontDetailsRelatedPosts.Params) {
		return this.parseRestClient.cloudRun<
			FindPostFunction.FrontDetailsRelatedPosts.Return,
			FindPostFunction.FrontDetailsRelatedPosts.Params
		>(functionName.findPostFrontDetailsRelatedPosts, { params });
	}
}
