import { z } from 'zod';

import { functionName, roleSet } from '@devist/shared/lib/constants';
import { getCreatePostInputSchema, getUpdatePostInputSchema } from '@devist/shared/validations/post.validations';

import { parseFrom, type FunctionReturn } from '@/server/lib/parse';
import FileService from '@/server/resources/file/file.service';
import PostService from '@/server/resources/post/post.service';
import UserService from '@/server/resources/user/user.service';
import { getListParamsSchema } from '@/server/utils/validation.utils';

export type CreatePostFunctionReturn = FunctionReturn<typeof createPostFunction>;

const createPostFunction = parseFrom({
	requireUser: true,
	allowedRoles: roleSet.ABOVE_TENANT_EDITOR,
	action: async ({ req, t, user }) => {
		const createPostInputSchema = getCreatePostInputSchema(t);
		const { locale, title, description, content, slug, coverId, authorId } = createPostInputSchema.parse(req.params);

		const sessionToken = user.getSessionToken();

		const postService = new PostService({ sessionToken });
		const fileService = new FileService({ sessionToken });
		const userService = new UserService({ sessionToken });

		const coverPromise = fileService.getById(coverId || '', { select: [] });
		const authorPromise = userService.getById(authorId || '', { select: [] });

		const findPostWithSameSlugPromise = postService.getBySlug(slug, { select: [] });

		if (await findPostWithSameSlugPromise) {
			throw new Error('A post with the same slug already exists');
		}

		return postService.create({
			locale,
			title,
			description,
			content,
			slug,
			author: (await authorPromise) ?? user,
			cover: await coverPromise,
		});
	},
});

export type UpdatePostFunctionReturn = FunctionReturn<typeof updatePostFunction>;

const updatePostFunction = parseFrom({
	requireUser: true,
	allowedRoles: roleSet.ABOVE_TENANT_EDITOR,
	action: async ({ req, t, user }) => {
		const updatePostInputSchema = getUpdatePostInputSchema(t);
		const { locale, title, description, content, slug, authorId, objectId, published } = updatePostInputSchema.parse(
			req.params,
		);
		let coverId: string | undefined; // todo

		const sessionToken = user.getSessionToken();

		const postService = new PostService({ sessionToken });
		const userService = new UserService({ sessionToken });
		const fileService = new FileService({ sessionToken });

		const postPromise = postService.getById(objectId, { select: [] });
		const authorPromise = userService.getById(authorId || '', { select: [] });
		const coverPromise = fileService.getById(coverId || '', { select: [] });

		const post = await postPromise;

		if (!post) {
			throw new Error('(Post) not found');
		}

		return postService.update(post, {
			locale,
			title,
			description,
			content,
			slug,
			author: await authorPromise,
			cover: await coverPromise,
			published,
		});
	},
});

export type GetPostFunctionReturn = FunctionReturn<typeof getPostFunction>;

// type A =
// 	| {
// 			id: string;
// 			slug: undefined;
// 	  }
// 	| {
// 			id: undefined;
// 			slug: string;
// 	  };
const getPostFunction = parseFrom({
	requireUser: false,
	action: async ({ req, /* t,  */ user }) => {
		const postId = req.params.id;
		const sessionToken = user?.getSessionToken();

		const postService = new PostService({ sessionToken });

		const post = await postService.getById(postId, { select: [] });

		if (!post) {
			// eslint-disable-next-line @typescript-eslint/no-throw-literal
			throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Post not Found');
		}

		return post;
	},
});

export type FindPostFunctionReturn = FunctionReturn<typeof findPostFunction>;

const findPostFunctionParamsSchema = getListParamsSchema.and(
	z.discriminatedUnion('view', [
		z.object({
			view: z.literal('front-list'),
		}),
		z.object({
			view: z.literal('bo-table'),
			fromPublic: z.boolean().optional().default(true),
		}),
	]),
);

const findPostFunction = parseFrom({
	requireUser: false,
	action: async ({ req, user, locale }) => {
		const { page, pageSize, sorting, ...params } = findPostFunctionParamsSchema.parse(req.params);

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

		// const foundPosts = await postService.find({
		// 	page,
		// 	pageSize,
		// 	sorting,
		// 	locale,
		// 	fromPublic,
		// 	json: true,
		// 	include: ['author'],
		// });

		// return foundPosts;

		// const finalPosts = postAdapter.boPostsTable(foundPosts, { locale });

		// return finalPosts;
	},
});

Parse.Cloud.define(functionName.createPost, createPostFunction);
Parse.Cloud.define(functionName.updatePost, updatePostFunction);
Parse.Cloud.define(functionName.getPost, getPostFunction);
Parse.Cloud.define(functionName.findPost, findPostFunction);
