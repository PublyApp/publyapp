import { functionName, roleSet } from '@devist/shared/lib/constants';
import { getCreatePostInputSchema, getUpdatePostInputSchema } from '@devist/shared/validations/post.validations';

import { USE_MASTER_KEY } from '@/server/lib/constants';
import { parseFrom, type FunctionReturn } from '@/server/lib/parse';
import FileService from '@/server/services/file.service';
import PostService from '@/server/services/post.service';
import UserService from '@/server/services/user.service';
import { ParsePost } from '@/shared/lib/parse/classes/post.class';

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

		const coverPromise = fileService.getById(coverId || '');
		const authorPromise = userService.getById(authorId || '');

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

		const postPromise = postService.getById(objectId);
		const authorPromise = userService.getById(authorId || '');
		const coverPromise = fileService.getById(coverId || '');

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

		const post = await postService.getById(postId);

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
	action: async (/* { req, t,  user } */) => {
		// const { page, pageSize, sorting } = req.params;

		// const sessionToken = user?.getSessionToken();

		// const postService = new PostService({ sessionToken });

		// const limit = pageSize || 10;
		// const skip = (page || 1) - 1;

		// const sortingOperations: Record<string, 1 | -1> = {};

		// if (sorting && !_.isEmpty(sorting)) {
		// 	for (const element of sorting) {
		// 		sortingOperations[element.id] = element.desc ? -1 : 1;
		// 	}
		// }

		// const pipeline: PipelineStage[] = [
		// 	{
		// 		$match: {},
		// 	},
		// 	...(sorting && !_.isEmpty(sorting) ? [{ $sort: sortingOperations }] : []),
		// 	{ $skip: skip },
		// 	{ $limit: limit },
		// 	{ $project: { _id: 1 } },
		// ];

		// throw new Error('Not implemented yet');

		// return postService.aggregate(pipeline);
		const posts = await new Parse.Query(ParsePost).find(USE_MASTER_KEY);
		return posts;
	},
});

Parse.Cloud.define(functionName.createPost, createPostFunction);
Parse.Cloud.define(functionName.updatePost, updatePostFunction);
Parse.Cloud.define(functionName.getPost, getPostFunction);
Parse.Cloud.define(functionName.findPost, findPostFunction);
