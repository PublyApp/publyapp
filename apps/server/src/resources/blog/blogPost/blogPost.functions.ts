import _ from 'lodash';

import { functionName, roleSet } from '@devist/shared/lib/constants';
import {
	getCreateBlogPostInputSchema,
	getFindBlogPostFunctionBoTableParamsSchema,
	getGetBlogPostFunctionBackOfficeEditFormSchema,
	getGetBlogPostFunctionFrontDetailsViewSchema,
	getUpdateBlogPostInputSchema,
} from '@devist/shared/validations/blogPost/blogPost.validations';

import ParseBlogPost from '@/server/lib/parse/classes/blogPost.class';
import { parseFunctionEnhanced, type FunctionParams, type FunctionReturn } from '@/server/lib/parse/utils';
import UserService from '@/server/resources/auth/user/user.service';
import BlogPostService from '@/server/resources/blog/blogPost/blogPost.service';
import FileService from '@/server/resources/file-manager/file/file.service';
import { getListParamsSchema } from '@/shared/utils/validation.utils';

export namespace CreateBlogPostFunction {
	export type Params = FunctionReturn<typeof createBlogPostFunction>;
	export type Return = FunctionReturn<typeof createBlogPostFunction>;
}

const createBlogPostFunction = parseFunctionEnhanced({
	requireUser: true,
	allowedRoles: roleSet.ABOVE_TENANT_EDITOR,
	action: async ({ req, user, z }) => {
		const createPostInputSchema = getCreateBlogPostInputSchema(z);
		const { coverId, authorId, ...input } = createPostInputSchema.parse(req.params);

		const sessionToken = user.getSessionToken();

		const postService = new BlogPostService({ sessionToken });
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

		const finalPost = BlogPostService.toJSON(post);
		return finalPost;
	},
});

export namespace UpdateBlogPostFunction {
	export type Params = FunctionParams<typeof updateBlogPostFunction>;
	export type Return = FunctionReturn<typeof updateBlogPostFunction>;
}

const updateBlogPostFunction = parseFunctionEnhanced({
	requireUser: true,
	// allowedRoles: roleSet.ABOVE_TENANT_EDITOR,
	action: async ({ req, user, z, t }) => {
		const updatePostInputSchema = getUpdateBlogPostInputSchema(z);
		const params = updatePostInputSchema.parse(req.params);
		const { coverId, authorId, objectId, ...input } = params;

		const sessionToken = user.getSessionToken();

		const postService = new BlogPostService({ sessionToken });
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

		const finalPost = BlogPostService.toJSON(updatedPost);
		return finalPost;
	},
});

export namespace GetBlogPostFunction {
	export namespace FrontView {
		export type Params = FunctionParams<typeof getBlogPostFunctionFrontDetailsView>;
		export type Return = FunctionReturn<typeof getBlogPostFunctionFrontDetailsView>;
		// export type Status = 'POST_NOT_FOUND' | 'POST_NOT_TRANSLATED';
	}

	export namespace BoEdit {
		export type Params = FunctionParams<typeof getBlogPostFunctionBoEditForm>;
		export type Return = FunctionReturn<typeof getBlogPostFunctionBoEditForm>;
	}
}

const getBlogPostFunctionBoEditForm = parseFunctionEnhanced({
	validateParams: ({ params, z }) => {
		return getGetBlogPostFunctionBackOfficeEditFormSchema(z).parse(params);
	},
	action: async ({ user, t, params }) => {
		const sessionToken = user?.getSessionToken();

		const postService = new BlogPostService({ sessionToken });

		const post = await postService.getOneBlogPostBoEdit(params.id);

		if (!post) {
			throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, t('item-not-found', { item: t('post') }));
		}

		return BlogPostService.toJSON(post);
	},
});

const getBlogPostFunctionFrontDetailsView = parseFunctionEnhanced({
	validateParams: ({ params, z }) => {
		return getGetBlogPostFunctionFrontDetailsViewSchema(z).parse(params);
	},
	action: async ({ user, locale, params }) => {
		const sessionToken = user?.getSessionToken();

		const postService = new BlogPostService({ sessionToken });

		const post = await postService.getOneBlogPostFront(params.slug, { locale });

		return post;
	},
});

export namespace FindBlogPostFunction {
	export namespace FrontList {
		export type Params = FunctionParams<typeof findPostFunctionFrontList>;
		export type Return = FunctionReturn<typeof findPostFunctionFrontList>;
	}

	export namespace BoTable {
		export type Params = FunctionParams<typeof findPostFunctionBoTable>;
		export type Return = FunctionReturn<typeof findPostFunctionBoTable>;
	}

	export namespace FrontDetailsRelatedPosts {
		export type Params = FunctionParams<typeof finBlogPostFrontDetailsRelatedPosts>;
		export type Return = FunctionReturn<typeof finBlogPostFrontDetailsRelatedPosts>;
	}
}

const finBlogPostFrontDetailsRelatedPosts = parseFunctionEnhanced({
	validateParams: ({ params, z }) => {
		return getGetBlogPostFunctionFrontDetailsViewSchema(z).parse(params);
	},
	action: async ({ locale, params }) => {
		const postService = new BlogPostService({});

		const post = await postService.getBySlug(params.slug, {
			select: ['relatedPosts', 'tags'],
			include: ['relatedPosts'],
		});

		const relatedPosts = await postService.findRelatedBlogPostsFrontDetails(post, { locale });

		return relatedPosts;
	},
});

const findPostFunctionBoTable = parseFunctionEnhanced({
	validateParams: ({ params, z }) => {
		return getFindBlogPostFunctionBoTableParamsSchema(z).parse(params);
	},
	action: async ({ user, locale, params: _params }) => {
		const { page, pageSize, sorting, ...params } = _params;

		const sessionToken = user?.getSessionToken();
		const postService = new BlogPostService({ sessionToken });

		const posts = await postService.findBlogPostBoTable({
			page,
			pageSize,
			sorting,
			locale,
			fromPublic: params.fromPublic,
		});
		return posts;
	},
});

const findPostFunctionFrontList = parseFunctionEnhanced({
	validateParams: ({ params, z }) => {
		return getListParamsSchema(z).parse(params);
	},
	action: async ({ params: _params, locale, user }) => {
		const { page, pageSize, sorting } = _params;
		const sessionToken = user?.getSessionToken();
		const postService = new BlogPostService({ sessionToken });

		const posts = await postService.findBlogPostFrontList({ page, pageSize, sorting, locale });
		return posts;
		// }
	},
});

const findBlogPostTag = parseFunctionEnhanced({
	action: async (/* { locale, req, t, user } */) => {
		const pipeline: Parse.PipelineStage[] = [
			{ $unwind: '$tags' },
			{ $group: { _id: '$tags', postsCount: { $sum: 1 } } },
			{ $project: { _id: 0, tag: '$_id', postsCount: '$postsCount' } },
		];

		const query = new Parse.Query(ParseBlogPost);

		// { tag: string, postsCount: number }[]
		const results = await query.aggregate(pipeline);
		return results;
	},
});

Parse.Cloud.define(functionName.createBlogPost, createBlogPostFunction);
Parse.Cloud.define(functionName.updateBlogPost, updateBlogPostFunction);
Parse.Cloud.define(functionName.findBlogPostTag, findBlogPostTag);

Parse.Cloud.define(functionName.findBlogPostBoTable, findPostFunctionBoTable);
Parse.Cloud.define(functionName.findBlogPostFrontList, findPostFunctionFrontList);
Parse.Cloud.define(functionName.findBlogPostFrontDetailsRelatedPosts, finBlogPostFrontDetailsRelatedPosts);

Parse.Cloud.define(functionName.getBlogPostFrontDetails, getBlogPostFunctionFrontDetailsView);
Parse.Cloud.define(functionName.getBlogPostBoEdit, getBlogPostFunctionBoEditForm);
