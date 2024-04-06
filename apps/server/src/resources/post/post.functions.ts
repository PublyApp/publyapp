import _ from 'lodash';

import { functionName, roleSet } from '@devist/shared/lib/constants';
import {
	getCreatePostInputSchema,
	getFindOnePostFunctionParamsSchema,
	getFindPostFunctionParamsSchema,
	getUpdatePostInputSchema,
} from '@devist/shared/validations/post/post.validations';

import ParsePost from '@/server/lib/parse/classes/post.class';
import { parseFrom, type FunctionReturn } from '@/server/lib/parse/utils';
import FileService from '@/server/resources/file/file.service';
import PostService from '@/server/resources/post/post.service';
import UserService from '@/server/resources/user/user.service';

// import { getListParamsSchema } from '@/server/utils/validation.utils';

export type CreatePostFunctionReturn = FunctionReturn<typeof createPostFunction>;

const createPostFunction = parseFrom({
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

		// const author = (await authorPromise) ?? (user.toJSON() as unknown as IUser);

		// TODO: return JSON objects instead of Parse Objects
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

const updatePostFunction = parseFrom({
	requireUser: true,
	allowedRoles: roleSet.ABOVE_TENANT_EDITOR,
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

// export type GetPostFunctionReturn = FunctionReturn<typeof getPostFunction>;
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace GetPostFunctionReturn {
	export type FrontView = ReturnType<typeof PostService.prototype.getPostDetailFront>;
	export type BoEditFormView = ReturnType<typeof PostService.prototype.getPostDetailBoEditForm>;
}

const getPostFunction = parseFrom({
	requireUser: false,
	action: async ({ req, user, t, z, locale }) => {
		const params = getFindOnePostFunctionParamsSchema(z).parse(req.params);

		const sessionToken = user?.getSessionToken();

		const postService = new PostService({ sessionToken });

		if (params.view === 'front-post-detail') {
			return postService.getPostDetailFront(params.slug, { locale, t });
		}

		if (params.view === 'bo-edit-form') {
			return postService.getPostDetailBoEditForm(params.id, { t });
		}

		return new Error('Invalid view');
	},
});

export type FindPostFunctionReturn = FunctionReturn<typeof findPostFunction>;

const findPostFunction = parseFrom({
	requireUser: false,
	action: async ({ req, user, locale, z }) => {
		const { page, pageSize, sorting, ...params } = getFindPostFunctionParamsSchema(z).parse(req.params);

		const sessionToken = user?.getSessionToken();
		const postService = new PostService({ sessionToken, headers: req.headers });

		if (params.view === 'front-list') {
			const posts = await postService.findPostFrontList({ page, pageSize, sorting, locale });
			return posts;
		}

		if (params.view === 'bo-table') {
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

const findPostTag = parseFrom({
	requireUser: false,
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
