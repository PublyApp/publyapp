import _ from 'lodash';

import { functionName, roleSet } from '@devist/shared/lib/constants';
import {
	findOnePostView,
	findPostView,
	getCreatePostInputSchema,
	getFindOnePostFunctionParamsSchema,
	getFindPostFunctionParamsSchema,
	getUpdatePostInputSchema,
} from '@devist/shared/validations/post/post.validations';

import ParsePost from '@/server/lib/parse/classes/post.class';
import { parseFunctionEnhanced, type FunctionReturn } from '@/server/lib/parse/utils';
import FileService from '@/server/resources/file/file.service';
import PostService from '@/server/resources/post/post.service';
import UserService from '@/server/resources/user/user.service';

export type CreatePostFunctionReturn = FunctionReturn<typeof createPostFunction>;

const createPostFunction = parseFunctionEnhanced({
	requireUser: true,
	allowedRoles: roleSet.ABOVE_TENANT_EDITOR,
	action: async ({ req, user, z }) => {
		const createPostInputSchema = getCreatePostInputSchema(z);
		const { coverId, authorId, ...input } = createPostInputSchema.parse(req.params);

		const sessionToken = user.getSessionToken();

		const postService = new PostService({ sessionToken });
		const fileService = new FileService({ sessionToken, uploadAdapter: FileService.defaultUploadAdapter });
		const userService = new UserService({ sessionToken });

		const coverPromise = fileService.getById(coverId || '', { select: [] });
		const authorPromise = userService.getById(authorId || '', { select: [] });

		const findPostWithSameSlugPromise = postService.getBySlug(input.slug, { select: [] });

		if (await findPostWithSameSlugPromise) {
			throw new Error('A post with the same slug already exists');
		}

		const post = await postService.create({
			...input,
			author: (await authorPromise) || user,
			cover: await coverPromise,
		});

		const finalPost = PostService.toJSON(post);
		return finalPost;
	},
});

export type UpdatePostFunctionReturn = FunctionReturn<typeof updatePostFunction>;

const updatePostFunction = parseFunctionEnhanced({
	requireUser: true,
	// allowedRoles: roleSet.ABOVE_TENANT_EDITOR,
	action: async ({ req, user, z, t }) => {
		const updatePostInputSchema = getUpdatePostInputSchema(z);
		const params = updatePostInputSchema.parse(req.params);
		const { coverId, authorId, objectId, ...input } = params;

		const sessionToken = user.getSessionToken();

		const postService = new PostService({ sessionToken });
		const userService = new UserService({ sessionToken });
		const fileService = new FileService({ sessionToken, uploadAdapter: FileService.defaultUploadAdapter });

		const postPromise = postService.getById(objectId, { select: ['author', 'translation'] });
		const authorPromise = userService.getById(authorId || '', { select: [] });
		const coverPromise = fileService.getById(coverId || '', { select: [] });

		const post = await postPromise;

		if (!post) {
			throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, t('item-not-found', { item: t('post') }));
		}

		const updatedPost = await postService.update(post, {
			...input,
			author: await authorPromise,
			cover: await coverPromise,
		});

		const finalPost = PostService.toJSON(updatedPost);
		return finalPost;
	},
});

export namespace GetPostFunction {
	export namespace FrontView {
		export type Params = {
			view: typeof findOnePostView.frontDetail;
			slug: string;
		};
		export type Return = FunctionReturn<typeof PostService.prototype.getOnePostFront>;
	}
	export namespace BoEdit {
		export type Params = {
			view: typeof findOnePostView.boEditForm;
			id: string;
		};
		export type Return = FunctionReturn<typeof PostService.prototype.getOnePostBoEdit>;
	}
}

const getPostFunction = parseFunctionEnhanced({
	validateParams: ({ params, z }) => {
		return getFindOnePostFunctionParamsSchema(z).parse(params);
	},
	action: async ({ user, t, locale, params }) => {
		const sessionToken = user?.getSessionToken();

		const postService = new PostService({ sessionToken });

		if (params.view === findOnePostView.frontDetail) {
			const post = await postService.getOnePostFront(params.slug, { locale });

			if (!post) {
				throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, t('item-not-found', { item: t('post') }));
			}

			return PostService.toJSON(post);
		}

		if (params.view === findOnePostView.boEditForm) {
			const post = await postService.getOnePostBoEdit(params.id);

			if (!post) {
				throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, t('item-not-found', { item: t('post') }));
			}

			return PostService.toJSON(post);
		}

		throw new Error(t('item-is-invalid', { item: 'view' }));
	},
});

// export type FindPostFunctionReturn = FunctionReturn<typeof findPostFunction>;
export namespace FindPostFunction {
	export namespace FrontList {
		export type Params = {
			view: typeof findPostView.frontList;
			page: number;
			pageSize: number;
			sorting: { id: string; desc: boolean }[];
		};
		export type Return = FunctionReturn<typeof PostService.prototype.findPostFrontList>;
	}
	export namespace BoTable {
		export type Params = {
			view: typeof findPostView.boTable;
			page: number;
			pageSize: number;
			sorting: { id: string; desc: boolean }[];
			fromPublic: boolean;
		};
		export type Return = FunctionReturn<typeof PostService.prototype.findPostBoTable>;
	}
}

const findPostFunction = parseFunctionEnhanced({
	validateParams: ({ params, z }) => {
		return getFindPostFunctionParamsSchema(z).parse(params);
	},
	action: async ({ req, user, locale, params: _params }) => {
		const { page, pageSize, sorting, ...params } = _params; /* getFindPostFunctionParamsSchema(z).parse(req.params); */

		const sessionToken = user?.getSessionToken();
		const postService = new PostService({ sessionToken, headers: req.headers });

		if (params.view === findPostView.frontList) {
			const posts = await postService.findPostFrontList({ page, pageSize, sorting, locale });
			return posts;
		}

		if (params.view === findPostView.boTable) {
			const posts = await postService.findPostBoTable({
				page,
				pageSize,
				sorting,
				locale,
				fromPublic: params.fromPublic,
			});
			return posts;
		}

		return [];
	},
});

const findPostTag = parseFunctionEnhanced({
	action: async (/* { locale, req, t, user } */) => {
		const pipeline: Parse.PipelineStage[] = [
			{ $unwind: '$tags' },
			{ $group: { _id: '$tags', postsCount: { $sum: 1 } } },
			{ $project: { _id: 0, tag: '$_id', postsCount: '$postsCount' } },
		];

		const query = new Parse.Query(ParsePost);

		// { tag: string, postsCount: number }[]
		const results = await query.aggregate(pipeline);
		return results;
	},
});

Parse.Cloud.define(functionName.createPost, createPostFunction);
Parse.Cloud.define(functionName.updatePost, updatePostFunction);
Parse.Cloud.define(functionName.getPost, getPostFunction);
Parse.Cloud.define(functionName.findPost, findPostFunction);
Parse.Cloud.define(functionName.findPostTag, findPostTag);
