import type ParseRestClient from '@devist/parse-rest-client/ParseRestClient';

import type {
	CreatePostFunctionReturn,
	FindPostFunction,
	// FindPostFunctionReturn,
	GetPostFunction,
	UpdatePostFunctionReturn,
} from '@/server/resources/post/post.functions';
import { functionName } from '@/shared/lib/constants';
import type { AppLocale } from '@/shared/lib/i18n/resources';

// == findPost
// export type FindPostFunctionParams = {
// 	page?: number;
// 	pageSize?: number;
// 	view?: 'bo-table' | 'front-list';
// 	// no sorting yet
// };
// export type FindPostFunctionResult = FindPostFunctionReturn;

// == createPost
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

// == getPost
export type GetPostByIdFunctionParams = {
	id: string;
};
// export type GetPostBySlugFunctionParams = {
// 	slug: string;
// };
// export type GetPostFunctionResult = GetPostFunctionReturn;

// == updatePost
export type UpdatePostFunctionParams = Partial<Omit<CreatePostFunctionParams, 'locale'>> & {
	locale: AppLocale;
	published?: boolean;
};
export type UpdatePostFunctionResult = UpdatePostFunctionReturn;

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
		const post = await this.parseRestClient.cloudRun<CreatePostFunctionResult>(functionName.createPost, { params });
		return post;
	}

	async getPostById(params: GetPostFunction.BoEdit.Params) {
		const post = await this.parseRestClient.cloudRun<GetPostFunction.BoEdit.Return, GetPostFunction.BoEdit.Params>(
			functionName.getPost,
			{ params },
		);
		return post;
	}

	async updatePost(params: UpdatePostFunctionParams) {
		const post = await this.parseRestClient.cloudRun<UpdatePostFunctionResult>(functionName.updatePost, { params });

		return post;
	}

	async findPostTag() {
		const tags = await this.parseRestClient.cloudRun<any>(functionName.findPostTag);
		return tags;
	}

	getPostDetailFront(params: GetPostFunction.FrontView.Params) {
		return this.parseRestClient.cloudRun<GetPostFunction.FrontView.Return, GetPostFunction.FrontView.Params>(
			functionName.getPost,
			{ params },
		);
	}
}
