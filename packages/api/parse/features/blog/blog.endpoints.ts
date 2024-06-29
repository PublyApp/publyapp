import { functionName } from '@devist/shared/lib/constants';
import type { AppLocale } from '@devist/shared/lib/i18n/resources';

import type {
	AddSlugToBlogPostFunction,
	CreateBlogPostFunction,
	FindBlogPostFunction,
	FindBlogPostSlugFunction,
	GetBlogPostFunction,
	UpdateBlogPostFunction,
} from '@/server/resources/blog/blog.functions';

import BaseEndPoints, { type BaseEndPointsProps } from '../../BaseEndPoints';

// == create post
export type CreateBlogPostFunctionParams = {
	locale: AppLocale;
	title: string;
	description: string;
	content: string;
	slug: string;
	authorId?: string;
	coverId?: string;
};

// == updatePost
export type UpdateBlogPostFunctionParams = Partial<Omit<CreateBlogPostFunctionParams, 'locale'>> & {
	locale: AppLocale;
	published?: boolean;
};

export default class BlogPostEndPoints extends BaseEndPoints {
	constructor({ parseRestClient, apiPath }: BaseEndPointsProps) {
		super({ parseRestClient, apiPath });

		this.findBlogPostBoTable = this.findBlogPostBoTable.bind(this);
		this.findBlogPostFrontList = this.findBlogPostFrontList.bind(this);
		this.findBlogPostTag = this.findBlogPostTag.bind(this);
		this.getBlogPostDetailFront = this.getBlogPostDetailFront.bind(this);
		this.getRelatedBlogPostsFrontDetails = this.getRelatedBlogPostsFrontDetails.bind(this);
	}

	async findBlogPostBoTable(params: FindBlogPostFunction.BoTable.Params) {
		const posts = await this.parseRestClient.cloudRun<FindBlogPostFunction.BoTable.Return>(
			functionName.blog.findBlogPostBoTable,
			{
				params,
			},
		);

		return posts;
	}

	async findBlogPostFrontList(params: FindBlogPostFunction.FrontList.Params) {
		const posts = await this.parseRestClient.cloudRun<FindBlogPostFunction.FrontList.Return>(
			functionName.blog.findBlogPostFrontList,
			{ params },
		);
		return posts;
	}

	async createBlogPost(params: CreateBlogPostFunctionParams) {
		const post = await this.parseRestClient.cloudRun<CreateBlogPostFunction.Return>(functionName.blog.createBlogPost, {
			params,
		});
		return post;
	}

	async getBlogPostBoEditForm(params: GetBlogPostFunction.BoEdit.Params) {
		const post = await this.parseRestClient.cloudRun<
			GetBlogPostFunction.BoEdit.Return,
			GetBlogPostFunction.BoEdit.Params
		>(functionName.blog.getBlogPostBoEdit, { params });
		return post;
	}

	async updateBlogPost(params: UpdateBlogPostFunctionParams) {
		const post = await this.parseRestClient.cloudRun<UpdateBlogPostFunction.Return>(functionName.blog.updateBlogPost, {
			params,
		});

		return post;
	}

	async findBlogPostTag() {
		const tags = await this.parseRestClient.cloudRun<any[]>(functionName.blog.findBlogPostTag);
		return tags;
	}

	async getBlogPostDetailFront(params: GetBlogPostFunction.FrontView.Params) {
		// throw new Error('Method not implemented.');
		return this.parseRestClient.cloudRun<GetBlogPostFunction.FrontView.Return, GetBlogPostFunction.FrontView.Params>(
			functionName.blog.getBlogPostFrontDetails,
			{ params },
		);
	}

	async getRelatedBlogPostsFrontDetails(params: FindBlogPostFunction.FrontDetailsRelatedPosts.Params) {
		return this.parseRestClient.cloudRun<
			FindBlogPostFunction.FrontDetailsRelatedPosts.Return,
			FindBlogPostFunction.FrontDetailsRelatedPosts.Params
		>(functionName.blog.findBlogPostFrontDetailsRelatedPosts, { params });
	}

	async findBlogPostSlug(params: FindBlogPostSlugFunction.Params) {
		return this.parseRestClient.cloudRun<FindBlogPostSlugFunction.Return, FindBlogPostSlugFunction.Params>(
			functionName.blog.findBlogPostSlug,
			{ params },
		);
	}

	async addSlugToBlogPost(params: AddSlugToBlogPostFunction.Params) {
		return this.parseRestClient.cloudRun<AddSlugToBlogPostFunction.Return, AddSlugToBlogPostFunction.Params>(
			functionName.blog.addSlugToBlogPost,
			{ params },
		);
	}
}
