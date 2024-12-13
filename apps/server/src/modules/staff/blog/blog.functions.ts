import _ from 'lodash';

import { className, DEFAULT_PAGE_SIZE, functionName, roleSet } from '@devist/shared/lib/constants';
import {
	getAddSlugToPostSchema,
	getCreateBlogPostInputSchema,
	getFindBlogPostFunctionBoTableParamsSchema,
	getGetBlogPostFunctionBackOfficeEditFormSchema,
	getGetBlogPostFunctionFrontDetailsViewSchema,
	getUpdateBlogPostInputSchema,
} from '@devist/shared/validations/blogPost/blogPost.validations';

import { parseFunctionEnhanced, type FunctionParams, type FunctionReturn } from '@/server/lib/parse/function.utils';
import { getDatabase } from '@/server/lib/parse/parse.utils';
import UserService from '@/server/modules/common/auth/user/user.service';
import BlogPostService from '@/server/modules/staff/blog/blogPost/blogPost.service';
import AppFileService from '@/server/modules/tenant/file-manager/appFile/appFile.service';
import { logger } from '@/shared/lib/winston';
import type { IBlogPostSlugWithRelations } from '@/shared/types/db/blogPostSlug.types';
import { getListParamsSchema } from '@/shared/utils/validation.utils';

import ParseBlogPostSlug from './blogPostSlug/blogPostSlug.class';
import BlogPostSlugService from './blogPostSlug/blogPostSlug.service';

export namespace CreateBlogPostFunction {
	export type Params = FunctionReturn<typeof createBlogPostFunction>;
	export type Return = FunctionReturn<typeof createBlogPostFunction>;
}

const createBlogPostFunction = parseFunctionEnhanced({
	requireUser: true,
	allowedRoles: roleSet.ABOVE_STAFF_EDITOR,
	validateParams: ({ params, z }) => {
		const createPostInputSchema = getCreateBlogPostInputSchema(z);
		return createPostInputSchema.parse(params);
	},
	action: async ({ user, t, params }) => {
		const { coverId, authorId, ...input } = params;

		const sessionToken = user.getSessionToken();

		const postService = new BlogPostService({ sessionToken });
		const slugService = new BlogPostSlugService({ sessionToken });
		const fileService = new AppFileService({ sessionToken, uploadAdapter: AppFileService.defaultUploadAdapter });
		const userService = new UserService({ sessionToken });

		const coverPromise = fileService.getById(coverId || '', { select: [] });
		const authorPromise = userService.getById(authorId || '', { select: [] });

		// const findPostWithSameSlugPromise = postService.getBySlug(input.slug, { select: [] });
		const foundSlug = await slugService.getSlugObject(input.slug);

		if (foundSlug) {
			throw new Error(t('slug-already-used'));
		}

		const post = await postService.create({
			...input,
			author: (await authorPromise) || user,
			cover: await coverPromise,
		});

		const newSlug = new ParseBlogPostSlug({ slug: input.slug, isCurrent: true });
		const slug = await slugService.assignSlugToPost({ post, slug: newSlug });

		// post.set('currentSlug', slug);
		// _.assign(post.attributes, { currentSlug: slug }); // otherwise the object will be converted into a pointer

		const finalPost = BlogPostService.toJSON(post);

		_.set(finalPost, 'currentSlug', BlogPostSlugService.toJSON(slug));

		return finalPost;
	},
});

export namespace UpdateBlogPostFunction {
	export type Params = FunctionParams<typeof updateBlogPostFunction>;
	export type Return = FunctionReturn<typeof updateBlogPostFunction>;
}

const updateBlogPostFunction = parseFunctionEnhanced({
	requireUser: true,
	allowedRoles: roleSet.ABOVE_STAFF_EDITOR,
	validateParams: ({ params, z }) => {
		const updatePostInputSchema = getUpdateBlogPostInputSchema(z);
		return updatePostInputSchema.parse(params);
	},
	action: async ({ user, t, params }) => {
		const { coverId, authorId, objectId, slug, ...input } = params;

		const sessionToken = user.getSessionToken();

		const postService = new BlogPostService({ sessionToken });
		const slugService = new BlogPostSlugService({ sessionToken });
		const userService = new UserService({ sessionToken });
		const fileService = new AppFileService({ sessionToken, uploadAdapter: AppFileService.defaultUploadAdapter });

		const postPromise = postService.getById(objectId, { select: ['author', 'translation'] });
		const authorPromise = userService.getById(authorId || '', { select: [] });
		const coverPromise = fileService.getById(coverId || '', { select: [] });

		const post = await postPromise;

		if (!post) {
			throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, t('item-not-found', { item: t('post') }));
		}

		if (slug) {
			const slugObject = await slugService.getOrCreateSlugForPost(slug, post, { setIsCurrent: true });

			if (slugObject === 'E_SLUG_ALREADY_USED') {
				throw new Error(t('slug-already-used'));
			}
		}

		const updatePostPromise = postService.update(post, {
			...input,
			author: await authorPromise,
			cover: await coverPromise,
		});

		// eslint-disable-next-line @typescript-eslint/naming-convention
		// const [updatedPost, _slugObject] = await Promise.all([updatePostPromise, slugPromise]);
		const updatedPost = await updatePostPromise;

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

		return post;
	},
});

const getBlogPostFunctionFrontDetailsView = parseFunctionEnhanced({
	// requireUser: true,
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
	action: async ({ params: _params, locale, user, t }) => {
		const MAX_PAGE_SIZE = 25;
		const { page, pageSize = MAX_PAGE_SIZE, sorting } = _params;
		const sessionToken = user?.getSessionToken();
		const postService = new BlogPostService({ sessionToken });

		if (pageSize > MAX_PAGE_SIZE) {
			throw new Error(t('max-page-size-exceeded', { max: MAX_PAGE_SIZE }));
		}

		const posts = await postService.findBlogPostFrontList({ page, pageSize, sorting, locale });
		return posts;
	},
});

const findBlogPostTag = parseFunctionEnhanced({
	action: async (/* { locale, req, t, user } */) => {
		logger.warn('TODO: implement this function');
		return [];
	},
});

export namespace FindBlogPostSlugFunction {
	export type Params = FunctionParams<typeof findBlogPostSlug>;
	export type Return = FunctionReturn<typeof findBlogPostSlug>;
}

const findBlogPostSlug = parseFunctionEnhanced({
	requireUser: true,
	allowedRoles: roleSet.ABOVE_STAFF_USER,
	validateParams: ({ params, z }) => {
		const schema = z.object({
			postId: z.string(),
			searchTerm: z.string().optional(),
			page: z.number().optional(),
			pageSize: z.number().optional(),
		});

		return schema.parse(params);
	},
	action: async ({ params, user }) => {
		const { postId, searchTerm, page = 0, pageSize = DEFAULT_PAGE_SIZE } = params;
		const postService = new BlogPostService({ sessionToken: user?.getSessionToken() });
		const slugs = await postService.findSlugsForBlogPostById(postId, {
			json: true,
			searchTerm,
			page,
			pageSize,
			select: ['slug', 'isCurrent'],
		});
		return slugs;
	},
});

export namespace AddSlugToBlogPostFunction {
	export type Params = FunctionParams<typeof addSlugToBlogPost>;
	export type Return = FunctionReturn<typeof addSlugToBlogPost>;
}

const addSlugToBlogPost = parseFunctionEnhanced({
	requireUser: true,
	allowedRoles: roleSet.ABOVE_STAFF_EDITOR,
	validateParams: ({ params, z }) => {
		const schema = getAddSlugToPostSchema(z);

		return schema.parse(params);
	},
	action: async ({ params, user, t }) => {
		const { slug, postId } = params;

		const sessionToken = user.getSessionToken();

		const postService = new BlogPostService({ sessionToken });
		const slugService = new BlogPostSlugService({ sessionToken });

		const slugObject = await slugService.getSlugObject(slug);

		if (slugObject) {
			throw new Error(t('slug-already-used'));
		}

		const post = await postService.getById(postId, { select: [] });

		if (!post) {
			throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, t('item-not-found', { item: t('post') }));
		}

		const newSlug = new ParseBlogPostSlug({ slug });
		const savedSlug = await slugService.assignSlugToPost({ post, slug: newSlug });

		const finalSlug = BlogPostSlugService.toJSON(savedSlug);
		return finalSlug as IBlogPostSlugWithRelations;
	},
});

const removeSeededBlogPosts = parseFunctionEnhanced({
	requireMasterKey: true,
	action: async () => {
		const BlogPost = getDatabase().collection(className.BLOG_POST);

		const result = await BlogPost.deleteMany({ seeded: true });

		return result;
	},
});

export namespace SetBlogPostCurrentSlugFunction {
	export type Params = FunctionParams<typeof setBlogPostCurrentSlug>;
	export type Return = FunctionReturn<typeof setBlogPostCurrentSlug>;
}

const setBlogPostCurrentSlug = parseFunctionEnhanced({
	requireUser: true,
	allowedRoles: roleSet.ABOVE_STAFF_EDITOR,
	validateParams: ({ params, z }) => {
		const schema = z.object({
			slugId: z.string().min(1),
			postId: z.string().min(1),
		});
		return schema.parse(params);
	},
	action: async ({ req, params, t }) => {
		const sessionToken = req.user?.getSessionToken();
		const { postId, slugId } = params;

		const slugService = new BlogPostSlugService({ sessionToken });
		const postService = new BlogPostService({ sessionToken });

		const getSlugPromise = slugService.getSlugObjectById(slugId, { select: ['post', 'isCurrent'] });
		const getPostPromise = postService.getById(postId, { select: [] });

		const [post, slug] = await Promise.all([getPostPromise, getSlugPromise]);

		if (!post) {
			throw new Error(t('item-not-found', { item: t('post') }));
		}

		if (!slug) {
			throw new Error(t('item-not-found', { item: 'Slug' }));
		}

		const slugPost = slug.get('post');

		if (!slugPost) {
			// there should be no problem
		} else if (post.id !== slugPost.id) {
			throw new Error(t('slug-linked-to-another-post'));
		}

		if (slug.get('isCurrent') === true) {
			await slugService.unsetCurrentSlugsForBlogPost(post, { notContainedIn: [slug.id] });
			return slug;
		}

		await slugService.unsetCurrentSlugsForBlogPost(post);

		slug.set('isCurrent', true);
		const savedSlug = await slug.save(null, { sessionToken });

		return savedSlug;
	},
});

// const updateBlogPostAuthorPointers = parseFunctionEnhanced({
// 	requireMasterKey: true,
// 	action: async () => {
// 		const fetchData = async (collection: Collection, pageSize: number, nextCursor?: string | null | undefined) => {
// 			let query = {};

// 			if (nextCursor) {
// 				query = { _id: { $gt: nextCursor } };
// 			}

// 			const options = {
// 				limit: pageSize,
// 				sort: { _id: 1 },
// 			};

// 			const data = await collection.find(query, options as never).toArray();

// 			let newNextCursor = null;

// 			if (data.length > 0) {
// 				newNextCursor = data[data.length - 1]._id.toString();
// 			}

// 			return { data, nextCursor: newNextCursor };
// 		};

// 		const database = getDatabase();
// 		const BlogPostCollection = database.collection(className.BLOG_POST);

// 		let nextCursor: string | null | undefined;
// 		// eslint-disable-next-line @typescript-eslint/no-explicit-any
// 		let data: Record<string, any>[] = [];

// 		do {
// 			// eslint-disable-next-line no-await-in-loop, @typescript-eslint/no-use-before-define
// 			const res = await fetchData(BlogPostCollection, 100, nextCursor);
// 			nextCursor = res.nextCursor;
// 			data = res.data;

// 			const userIds: string[] = [];

// 			data.forEach((e) => {
// 				// eslint-disable-next-line @typescript-eslint/naming-convention
// 				const _p_author = _.get(e, '_p_author');

// 				if (!_.isString(_p_author)) {
// 					return;
// 				}

// 				// eslint-disable-next-line @typescript-eslint/naming-convention
// 				const [_className, id] = _p_author.split('$');

// 				if (!className || !id) {
// 					return;
// 				}

// 				if (_className === className.USER) {
// 					userIds.push(id);
// 				}
// 			});

// 			const userObjects = userIds.map((id) => {
// 				const userObject = new ParseUser();
// 				userObject.id = id;
// 				return userObject;
// 			});

// 			// eslint-disable-next-line no-await-in-loop
// 			const profiles = await new Parse.Query(ParseUserProfile).containedIn('user', userObjects).findAll(USE_MASTER_KEY);

// 			const profilesMapByUserId = new Map<string, ParseUserProfile>();
// 			profiles.forEach((p) => {
// 				const user = p.get('user');

// 				if (!user) {
// 					return;
// 				}

// 				profilesMapByUserId.set(`${className.USER}$${user.id}`, p);
// 			});

// 			const operations: AnyBulkWriteOperation[] = [];
// 			data.forEach((d) => {
// 				const id = _.get(d, '_id');
// 				// eslint-disable-next-line @typescript-eslint/naming-convention
// 				const _p_author = _.get(d, '_p_author');

// 				const profile = profilesMapByUserId.get(_p_author);

// 				if (!profile) {
// 					return;
// 				}

// 				operations.push({
// 					updateOne: {
// 						filter: { _id: id },
// 						update: {
// 							$set: {
// 								_p_author: `${className.USER}$${profile.id}`,
// 							},
// 						},
// 					},
// 				});
// 			});

// 			if (!_.isEmpty(operations)) {
// 				// eslint-disable-next-line no-await-in-loop
// 				await BlogPostCollection.bulkWrite(operations);
// 			}
// 		} while (!_.isNil(nextCursor));
// 	},
// });

Parse.Cloud.define(functionName.blog.createBlogPost, createBlogPostFunction);
Parse.Cloud.define(functionName.blog.updateBlogPost, updateBlogPostFunction);
Parse.Cloud.define(functionName.blog.findBlogPostTag, findBlogPostTag);

Parse.Cloud.define(functionName.blog.findBlogPostBoTable, findPostFunctionBoTable);
Parse.Cloud.define(functionName.blog.findBlogPostFrontList, findPostFunctionFrontList);
Parse.Cloud.define(functionName.blog.findBlogPostFrontDetailsRelatedPosts, finBlogPostFrontDetailsRelatedPosts);

Parse.Cloud.define(functionName.blog.getBlogPostFrontDetails, getBlogPostFunctionFrontDetailsView);
Parse.Cloud.define(functionName.blog.getBlogPostBoEdit, getBlogPostFunctionBoEditForm);

Parse.Cloud.define(functionName.blog.findBlogPostSlug, findBlogPostSlug);
Parse.Cloud.define(functionName.blog.addSlugToBlogPost, addSlugToBlogPost);
Parse.Cloud.define(functionName.blog.setBlogPostCurrentSlug, setBlogPostCurrentSlug);

Parse.Cloud.define(functionName.blog.removeSeededBlogPosts, removeSeededBlogPosts);
// Parse.Cloud.define(functionName.blog.updateBlogPostAuthorPointers, updateBlogPostAuthorPointers);
