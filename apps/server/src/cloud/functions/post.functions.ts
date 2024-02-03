import { functionName, roleSet } from '@devist/shared/lib/constants';
import { getCreatePostInputSchema, getUpdatePostInputSchema } from '@devist/shared/validations/post.validations';

import { parseFrom, type FunctionReturn } from '@/server/lib/parse';
import FileService from '@/server/services/file.service';
import PostService from '@/server/services/post.service';
import UserService from '@/server/services/user.service';
import { getListParamsSchema } from '@/server/utils/validation.utils';

export type CreatePostFunctionReturn = FunctionReturn<typeof createPostFunction>;

const createPostFunction = parseFrom({
	requireUser: true,
	allowedRoles: roleSet.ABOVE_AUTHOR,
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
	allowedRoles: roleSet.ABOVE_AUTHOR,
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

const findPostFunction = parseFrom({
	requireUser: false,
	action: async ({ req, user, locale }) => {
		const { page, pageSize, sorting } = getListParamsSchema.parse(req.params);

		const sessionToken = user?.getSessionToken();
		const postService = new PostService({ sessionToken });

		const posts = await postService.find({ page, pageSize, sorting, locale });
		return posts;
	},
});

Parse.Cloud.define(functionName.createPost, createPostFunction);
Parse.Cloud.define(functionName.updatePost, updatePostFunction);
Parse.Cloud.define(functionName.getPost, getPostFunction);
Parse.Cloud.define(functionName.findPost, findPostFunction);
