import type ParseRestClient from '@devist/parse-rest-client/ParseRestClient';

import type {
	CreatePostFunction,
	FindPostFunction,
	GetPostFunction,
	UpdatePostFunction,
} from '@/server/resources/post/post.functions';
import { functionName } from '@/shared/lib/constants';
import type { AppLocale } from '@/shared/lib/i18n/resources';

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

export default class PostEndPoints {
	constructor(private parseRestClient: ParseRestClient) {
		this.findPostBoTable = this.findPostBoTable.bind(this);
		this.findPostFrontList = this.findPostFrontList.bind(this);
		this.findPostTag = this.findPostTag.bind(this);
		this.getPostDetailFront = this.getPostDetailFront.bind(this);
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

	getPostDetailFront(params: GetPostFunction.FrontView.Params) {
		return this.parseRestClient.cloudRun<GetPostFunction.FrontView.Return, GetPostFunction.FrontView.Params>(
			functionName.getPostFrontDetails,
			{ params },
		);
	}
}
