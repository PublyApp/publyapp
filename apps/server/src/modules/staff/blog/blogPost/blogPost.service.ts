import _ from 'lodash';

import { type IBlogPostSlug } from '@devist/shared/types/db/blogPostSlug.types';

import { env } from '@/server/lib/env';
import { toIsoString } from '@/server/lib/parse/parse.utils';
import { applyQueryOptions, applySkipAndLimit, applySorting } from '@/server/lib/parse/query.utils';
import type ParseUser from '@/server/modules/common/auth/user/user.class';
import ParseBlogPost from '@/server/modules/staff/blog/blogPost/blogPost.class';
import type ParseAppFile from '@/server/modules/tenant/file-manager/appFile/appFile.class';
import { className, DEFAULT_PAGE_SIZE, roleEnum } from '@/shared/lib/constants';
import { appLocales, defaultLocale, type AppLocale } from '@/shared/lib/i18n/resources';
import type { ListMeta, WithMeta } from '@/shared/types/any.types';
import type {
	IBlogPostWithParseRelations,
	IBlogPostWithRelations,
	TranslatedIBlogPostWithRelations,
} from '@/shared/types/db/blogPost.types';
import { urlStartWithProtocol } from '@/shared/utils/any.utils';

import ParseBlogPostSlug from '../blogPostSlug/blogPostSlug.class';
import BlogPostSlugService from '../blogPostSlug/blogPostSlug.service';

type Props = {
	sessionToken?: string;
	// headers?: Record<string, unknown>;
};

// type BlogPostUpdateInput = {
// 	objectId?: string;
// 	locale: AppLocale;
// 	title: string;
// 	slug: string;
// 	description: string;
// 	author: ParseUser;
// 	content: string;
// 	published?: boolean;
// };

type BlogPostCreateInput = {
	locale: string;
	title: string;
	slug: string;
	description: string;
	content: string;
	author: Parse.User;
	cover?: ParseAppFile;
	coverUrl?: string;
	publishDate?: Date;
	updateDate?: Date;
	tags?: string[];
};

type BlogPostUpdateInput = Partial<Omit<BlogPostCreateInput, 'locale' | 'slug'>> & {
	locale: string;
	published?: boolean;
	// post: ParseBlogPost;
};

type FindBlogPostInput = {
	page?: number;
	pageSize?: number;
	sorting?: { id: string; desc: boolean }[];
	locale?: AppLocale;
	json?: boolean;
	select?: string[];
	include?: string[];
	exclude?: string[];
	// sessionToken?: string;
	fromPublic?: boolean;
};

type FindBlogPostFrontListParams = Pick<FindBlogPostInput, 'page' | 'pageSize' | 'sorting' | 'locale'>;
type FindBlogPostBoTableParams = FindBlogPostFrontListParams & { fromPublic: boolean };

export default class BlogPostService {
	sessionToken?: string;

	// headers?: Record<string, unknown>;

	constructor({ sessionToken /* , headers */ }: Props) {
		this.sessionToken = sessionToken;
		// this.headers = headers;
	}

	async create(input: BlogPostCreateInput) {
		const { author, content, description, /* slug, */ title, cover, locale, coverUrl, publishDate, tags, updateDate } =
			input;

		const attributes: DeepPartial<IBlogPostWithParseRelations> = {
			// slug,
			translation: {
				[locale]: {
					title,
					description,
					content,
				},
			},
			author,
			cover,
			coverUrl,
			publishDate,
			tags,
			updateDate,
		}; /*  satisfies DeepPartial<IBlogPostWithParseRelations> */

		// create an mongo unique index and let mongo handle this
		// const postWithSameSlug = await new Parse.Query(ParseBlogPost)
		// 	.equalTo('slug', slug)
		// 	.first({ sessionToken: this.sessionToken });

		// if (postWithSameSlug) {
		// 	throw new Error('A (BlogPost) with the same (slug) already exists');
		// }

		const post = new ParseBlogPost(attributes);

		// set ACL
		const acl = new Parse.ACL();
		acl.setPublicReadAccess(false);
		// author can read and write
		acl.setReadAccess(author.id, true);
		acl.setWriteAccess(author.id, true);
		// admins can read and write
		acl.setRoleReadAccess(roleEnum.STAFF_ADMIN.name, true);

		post.setACL(acl);

		return post.save(null, { sessionToken: this.sessionToken });
	}

	async update(post: ParseBlogPost, input: BlogPostUpdateInput) {
		const {
			description,
			locale,
			// slug,
			title,
			content,
			published,
			author,
			cover,
			coverUrl,
			publishDate,
			tags,
			updateDate,
		} = input;

		const { sessionToken } = this;

		const acl = post.getACL();

		if (_.isNil(published)) {
			// do nothing
		} else if (acl) {
			acl.setPublicReadAccess(published);
			post.setACL(acl);
		}

		if (_.isNil(author)) {
			// do nothing
		} else if (author) {
			if (acl) {
				const formerAuthor = post.get('author') as unknown as ParseUser;

				if (formerAuthor.id !== author.id) {
					// give permission to the new author
					acl.setReadAccess(author.id, true);
					acl.setWriteAccess(author.id, true);

					// remove permission from the former author
					acl.setReadAccess(formerAuthor.id, false);
					acl.setWriteAccess(formerAuthor.id, false);
				}

				post.setACL(acl);
			}
		}

		const attributes: DeepPartial<IBlogPostWithParseRelations> = {
			// slug,
			published,
			author,
			cover,
			translation: {
				[locale]: {
					//
					title,
					description,
					content,
				},
			},
			coverUrl,
			publishDate,
			tags,
			updateDate,
		};

		if (attributes.translation?.[locale as never]) {
			post.set(`translation.${locale}` as never, attributes.translation[locale as never]);
		}

		const attrs = _.omitBy(attributes, (value, key) => {
			if (['translation'].includes(key)) return true;
			return _.isNil(value);
		});

		return post.save(attrs as never, { sessionToken });
	}

	async getById(objectId: string, options: { select?: string[]; include?: string[]; exclude?: string[] } = {}) {
		const query = new Parse.Query(ParseBlogPost).equalTo('objectId', objectId);

		applyQueryOptions(query, options);

		return query.first({ sessionToken: this.sessionToken });
	}

	async getBySlug(
		slug: string,
		options?:
			| undefined
			| {
					select?: string[];
					include?: string[];
					showPublishedOnly?: boolean;
					hideDeleted?: boolean;
					json?: false | undefined;
			  },
	): Promise<ParseBlogPost | undefined>;
	async getBySlug(
		slug: string,
		options: { select?: string[]; include?: string[]; showPublishedOnly?: boolean; hideDeleted?: boolean; json: true },
	): Promise<IBlogPostWithRelations | undefined>;
	async getBySlug(
		slug: string,
		options: {
			select?: string[];
			include?: string[];
			showPublishedOnly?: boolean;
			hideDeleted?: boolean;
			json?: boolean;
		} = {},
	) {
		// eslint-disable-next-line no-param-reassign
		options.showPublishedOnly = options.showPublishedOnly ?? true; // by default, only show published articles
		// eslint-disable-next-line no-param-reassign
		options.hideDeleted = options.hideDeleted ?? true; // by default, never show deleted articles

		const slugQuery = new Parse.Query(className.BLOG_POST_SLUG).equalTo('slug', slug);
		const postQuery = new Parse.Query(ParseBlogPost);

		slugQuery.include([
			'post',
			...(options.include?.map((include) => {
				return `post.${include}`;
			}) || []),
		]);

		if (options.showPublishedOnly) {
			postQuery.equalTo('published', true);
		}

		if (options.hideDeleted) {
			postQuery.notEqualTo('deleted' as never, true as never);
		}

		if (options.select) {
			slugQuery.select([
				'post',
				...(options.select.map((select) => {
					return `post.${select}`;
				}) || []),
			] as never);
		}

		// if (options.include) {
		// 	postQuery.include(options.include as never);
		// }

		slugQuery.matchesQuery('post', postQuery);

		// const result = postQuery.first({ sessionToken: this.sessionToken, json: options.json });
		const result = await slugQuery.first({ sessionToken: this.sessionToken, json: options.json });

		if (options.json) {
			const post: IBlogPostWithRelations | undefined = _.get(result, 'post');

			if (!_.isNil(post)) {
				_.assign(post, { slug });
			}

			return post as never;
			// return query.first({ sessionToken: this.sessionToken, json: options.json }) as never;
		}

		// return query.first({ sessionToken: this.sessionToken }) as never;
		const post: ParseBlogPost | undefined = result?.get('post');

		if (!_.isNil(post)) {
			// _.assign(post, { slug });
			post.set('fetchedSlug' as never, slug as never);
		}

		return post as never;
	}

	async find(params: Omit<FindBlogPostInput, 'json'> & { json: true }): Promise<IBlogPostWithRelations[]>;
	async find(params: Omit<FindBlogPostInput, 'json'> & { json?: false | undefined }): Promise<ParseBlogPost[]>;
	async find({
		page = 1,
		pageSize = DEFAULT_PAGE_SIZE,
		sorting = [],
		locale,
		select,
		include,
		exclude,
		// ===
		json = false,
		fromPublic = true,
	}: FindBlogPostInput) {
		const query = new Parse.Query(ParseBlogPost).notEqualTo('deleted' as never, true as never);

		applySkipAndLimit(query, { type: 'page', page, pageSize });

		if (sorting && !_.isEmpty(sorting)) {
			applySorting(query, sorting);
		}

		// locale filter
		if (locale) {
			query.exists(`translation.${locale}` as never);
		}

		applyQueryOptions(query, { exclude, include, select });

		let sessionToken;

		if (fromPublic) {
			// hide non published
			query.equalTo('published', true);
			// hide deleted
			query.notEqualTo('deleted' as never, true as never);
		} else {
			sessionToken = this.sessionToken;
		}

		query.descending(['createdAt']);

		const posts = await query.find({
			sessionToken,
			// json,
			/* , context: { headers: this.headers, fromPublic } */
		});

		if (json) {
			const jsonBlogPosts = posts.map((post) => {
				return BlogPostService.toJSON(post);
			});

			return jsonBlogPosts;
		}

		return posts;

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
		// return postService.aggregate(pipeline);
	}

	static getExcludedTranslations(locale: AppLocale) {
		const excludedTranslations: string[] = [];

		appLocales.forEach((iLocale) => {
			if (iLocale === locale) return;
			excludedTranslations.push(`translation.${iLocale}`);
		});

		return excludedTranslations;
	}

	async findBlogPostBoTable({
		page,
		pageSize,
		sorting,
		locale = defaultLocale,
		fromPublic,
	}: FindBlogPostBoTableParams) {
		const include = ['author'];
		// const exclude = [...BlogPostService.getExcludedTranslations(locale as never), `translation.${locale}.content`];
		const select = [`translation.${locale}.title`, 'tags', 'viewCount', 'published'];

		const posts = await this.find({
			page,
			pageSize,
			sorting,
			locale,
			include,
			select,
			/* exclude, */ json: true,
			fromPublic,
		});

		const finalBlogPosts = posts.map((_post) => {
			const post = BlogPostService.toTranslatedIBlogPost(_post, locale);
			return post;
		});

		return finalBlogPosts;
	}

	async findBlogPostFrontList({
		page,
		pageSize = DEFAULT_PAGE_SIZE,
		sorting,
		locale = defaultLocale,
	}: FindBlogPostFrontListParams) {
		const include = ['author', 'cover'];
		// const exclude = BlogPostService.getExcludedTranslations(locale as never);
		const select = [
			'slug',
			'tags',
			`translation.${locale}.title`,
			`translation.${locale}.description`,
			'viewCount',
			'publishDate',
			'author',

			'cover',
			'cover.url',
			'cover.provider',

			'author.firstName',
			'author.lastName',
		];

		const posts = await this.find({
			page,
			pageSize,
			sorting,
			locale,
			include,
			// exclude,
			select,
			// json: true,
			fromPublic: true,
		});

		const slugsMapByPostId = await this.findCurrentSlugsForBlogPosts({ posts });

		const finalBlogPosts = posts.map((_post) => {
			const postJson = BlogPostService.toJSON(_post);

			const post = BlogPostService.toTranslatedIBlogPost(postJson, locale);

			const coverUrl = _.get(post, 'cover.url');

			if (coverUrl) {
				// if (coverUrl.startsWith('http://'))
				if (!urlStartWithProtocol(coverUrl)) {
					_.set(post, 'cover.url', env.SERVER_URL + coverUrl);
				}
			}

			const currentSlug = slugsMapByPostId.get(post.objectId)?.get('slug') || 'no-slug';
			_.set(post, 'currentSlug', currentSlug);

			return post;
		});

		return finalBlogPosts;
	}

	async findCurrentSlugsForBlogPosts({ posts }: { posts: ParseBlogPost[] }) {
		const currentSlugsQuery = new Parse.Query(ParseBlogPostSlug)
			.containedIn('post', posts)
			.equalTo('isCurrent', true)
			.select(['slug', 'post']);

		const slugsMapByPostId = new Map<string, ParseBlogPostSlug>();

		const BATCH_SIZE = 100;

		await currentSlugsQuery.eachBatch(
			async (slugs) => {
				slugs.forEach((slug) => {
					const postId = slug.get('post')?.id || '';
					slugsMapByPostId.set(postId, slug);
				});
			},
			{ sessionToken: this.sessionToken, batchSize: BATCH_SIZE },
		);

		return slugsMapByPostId;
	}

	// // I expect this function to be only for public usage (for now)
	// // eslint-disable-next-line class-methods-use-this
	// async findMostViewedTags() {
	// 	// const pipeline: Parse.PipelineStage[] = [
	// 	// 	{ $unwind: '$tags' },
	// 	// 	{ $group: { _id: '$tags', count: { $sum: 1 } } },
	// 	// 	{ $project: { _id: 0, tag: '$_id', count: '$count' } },
	// 	// ];
	// 	const pipeline: Parse.PipelineStage[] = [
	// 		{
	// 			$match: {
	// 				tags: { $exists: true },
	// 				published: true,
	// 			},
	// 		},
	// 		{ $unwind: '$tags' },
	// 		{
	// 			$group: {
	// 				_id: '$tags',
	// 				tag: { $first: '$tags' }, // Get the first tag from the array
	// 				viewCount: { $sum: '$viewCount' },
	// 				postCount: { $sum: 1 },
	// 			},
	// 		},

	// 		{ $sort: { viewCount: -1 } }, // Sort by viewCount in descending order

	// 		{ $project: { _id: 0, tag: '$tag', viewCount: '$viewCount', postCount: '$postCount' } }, // Remove unnecessary field
	// 	];

	// 	const query = new Parse.Query(ParseBlogPost);

	// 	const results = await query.aggregate(pipeline);
	// 	return results;
	// }

	async deleteById(objectId: string) {
		const query = new Parse.Query(ParseBlogPost).equalTo('objectId', objectId);
		const post = await query.first({ sessionToken: this.sessionToken });

		// todo: add error message if no post was found
		post?.set('deleted' as never, true as never);

		return post?.save(null, { sessionToken: this.sessionToken });
	}

	static async searchBlogPostTag(searchQuery: string) {
		const query = new Parse.Query(ParseBlogPost);

		const pipeline: Parse.PipelineStage[] = [
			{
				$search: {
					index: 'default',
					autocomplete: {
						query: searchQuery,
						path: 'tags',
						fuzzy: {
							maxEdits: 2,
							maxExpansions: 100,
						},
						tokenOrder: 'any',
					},
				},
			},
			{
				$project: {
					tags: {
						$filter: {
							input: '$tags',
							as: 'item',
							cond: {
								$regexMatch: {
									input: '$$item',
									regex: new RegExp(searchQuery, 'i'),
								},
							},
						},
					},
				},
			},
			{
				$unwind: '$tags',
			},
			{
				$group: {
					_id: '$tags',
				},
			},
			// { $limit: 5 },
			// { $skip: 0 },
			{
				$project: {
					_id: 0,
					name: '$_id',
				},
			},
		];

		return query.aggregate(pipeline);
	}

	static toJSON(post: ParseBlogPost) {
		const finalBlogPost = post.toJSON();

		_.unset(finalBlogPost, 'author.__type');
		_.unset(finalBlogPost, 'cover.__type');
		_.unset(finalBlogPost, 'currentSlug.__type');
		_.set(finalBlogPost, 'publishDate', toIsoString(finalBlogPost.publishDate));
		_.set(finalBlogPost, 'updateDate', toIsoString(finalBlogPost.updateDate));

		return finalBlogPost as unknown as IBlogPostWithRelations;
	}

	async getOneBlogPostFront(slug: string, { locale }: { locale: AppLocale }) {
		// const MORE_POSTS_COUNT = 4;
		const include = ['author', 'cover'];
		const select = [
			// 'author',
			'author.firstName',
			'author.lastName',

			// 'cover',
			'cover.url',

			'tags',
			// // 'cover.url',

			`translation.${locale}`,
			// 'translation',
		];

		const post = (await this.getBySlug(slug, { include, select, json: true })) as IBlogPostWithRelations;

		if (!post) {
			return {
				status: 'E_NOT_FOUND' as const,
				post: undefined,
			};
		}

		const translation = post.translation?.[locale];

		const coverUrl = _.get(post, 'cover.url');

		if (coverUrl) {
			if (!urlStartWithProtocol(coverUrl)) {
				_.set(post, 'cover.url', env.SERVER_URL + coverUrl);
			}
		}

		if (!translation) {
			// return 'TRANSLATION_NOT_FOUND' as const;
			const fallBackLocale = locale === 'en' ? 'fr' : 'en';

			const fallBackBlogPost = await this.getById(post.objectId, {
				select: [
					//
					`translation.${fallBackLocale}.title`,
					`translation.${fallBackLocale}.description`,
				],
			});

			const jsonFallBackBlogPost = BlogPostService.toJSON(fallBackBlogPost!);
			_.assign(post, jsonFallBackBlogPost, {
				// url: env.FRONT_URL + FRONT_PATH_NAMES.posts.details(slug, fallBackLocale),
				slug,
			});
			const fallBackTranslation = BlogPostService.toTranslatedIBlogPost(post, fallBackLocale);

			return {
				status: 'E_NOT_TRANSLATED' as const,
				post: fallBackTranslation,
			};
		}

		const finalBlogPost = BlogPostService.toTranslatedIBlogPost(post, locale);

		return {
			status: 'SUCCESS' as const,
			post: finalBlogPost,
		};
	}

	async getOneBlogPostBoEdit(id: string) {
		const include = ['author', 'cover'];
		const exclude = ['cover.formats'];
		// const select = [
		// 	'author',
		// 	'cover',
		// 	'tags',
		// 	// 'cover.url',

		// 	'translation',
		// ];

		const post = await this.getById(id, { include, exclude /* , select */ });

		if (!post) {
			// throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, t('item-not-found', { item: t('post') }));
			return undefined;
		}

		const currentSlug = await new Parse.Query(ParseBlogPostSlug)
			.equalTo('post', post)
			.equalTo('isCurrent', true as never)
			.select(['slug'])
			.first({ sessionToken: this.sessionToken });

		const finalPost = BlogPostService.toJSON(post);

		if (currentSlug) {
			_.set(finalPost, 'currentSlug', BlogPostSlugService.toJSON(currentSlug));
		}

		return finalPost;

		// post.set('currentSlug', currentSlug);
		// _.set(post.attributes, 'currentSlug', currentSlug); // otherwise the object will be converted into a pointer

		// return post;
	}

	async findRelatedBlogPostsFrontDetails(
		post: ParseBlogPost | undefined,
		options?: { locale?: AppLocale; fromPublic?: boolean },
	) {
		const defaultOptions = { locale: defaultLocale, fromPublic: true };
		const { fromPublic, locale } = { ...defaultOptions, ...options };

		const relatedBlogPosts = (post?.get('relatedPosts') as ParseBlogPost[] | undefined) ?? [];
		let remainingBlogPostsCount = 4 - relatedBlogPosts.length;
		const tags = post?.attributes.tags;

		const applyCommonConstraints = (query: Parse.Query) => {
			query
				.addDescending('publishDate')
				.addDescending('createdAt')
				.equalTo('published', true)
				.exists(`translation.${locale}` as never)
				.include(['author', 'cover'])
				.select([
					//
					`translation.${locale}.title`,
					'slug',

					'author',
					'author.firstName',
					'author.lastName',

					'cover',
					'cover.url',
				]);
		};

		const getLatestBlogPostsQuery = (iBlogPost: typeof post, iRemainingBlogPostsCount: number) => {
			const query = new Parse.Query(ParseBlogPost).limit(iRemainingBlogPostsCount);
			applyCommonConstraints(query);

			if (iBlogPost) {
				query.notEqualTo('objectId', iBlogPost.id);
			}

			return query;
		};

		if (remainingBlogPostsCount > 0) {
			if (tags && !_.isEmpty(tags)) {
				const relatedBlogPostsByTagsQuery = new Parse.Query(ParseBlogPost)
					.containedIn('tags', tags as never)
					.notEqualTo('objectId', post.id);
				applyCommonConstraints(relatedBlogPostsByTagsQuery);

				// if (post) {
				// 	relatedBlogPostsByTagsQuery.notEqualTo('objectId', post.id)
				// }

				const relatedBlogPostsByTagsCount = await relatedBlogPostsByTagsQuery.count({
					sessionToken: fromPublic ? undefined : this.sessionToken,
				});

				// TODO: add select and includes
				const relatedBlogPostsByTagsPromise = relatedBlogPostsByTagsQuery
					// .select([
					// 	//
					// 	`translation.${locale}`,
					// ] as never)
					.limit(remainingBlogPostsCount)
					.find({
						// json: true,
						sessionToken: fromPublic ? undefined : this.sessionToken,
					});

				if (relatedBlogPostsByTagsCount < remainingBlogPostsCount) {
					// eslint-disable-next-line operator-assignment
					remainingBlogPostsCount = remainingBlogPostsCount - relatedBlogPostsByTagsCount;

					const latestBlogPostsQuery = getLatestBlogPostsQuery(post, remainingBlogPostsCount);
					latestBlogPostsQuery.notContainedIn('tags', tags as never);

					const latestBlogPostsPromise = latestBlogPostsQuery.find({
						// json: true,
						sessionToken: fromPublic ? undefined : this.sessionToken,
					});

					const [relatedBlogPostsByTags, latestBlogPosts] = await Promise.all([
						relatedBlogPostsByTagsPromise,
						latestBlogPostsPromise,
					]);

					relatedBlogPosts.push(...relatedBlogPostsByTags, ...(latestBlogPosts as []));
				}
			} else {
				const latestBlogPostsQuery = getLatestBlogPostsQuery(post, remainingBlogPostsCount);

				const latestBlogPosts = await latestBlogPostsQuery.find({
					// json: true,
					sessionToken: fromPublic ? undefined : this.sessionToken,
				});
				relatedBlogPosts.push(...latestBlogPosts);
			}
		}

		const slugsMapByPostId = await this.findCurrentSlugsForBlogPosts({ posts: relatedBlogPosts });

		const finalBlogPosts = relatedBlogPosts.map((relatedBlogPost) => {
			const iBlogPost = BlogPostService.toTranslatedIBlogPost(BlogPostService.toJSON(relatedBlogPost), locale);
			const coverUrl = _.get(iBlogPost, 'cover.url');

			if (coverUrl) {
				if (!urlStartWithProtocol(coverUrl)) {
					_.set(iBlogPost, 'cover.url', env.SERVER_URL + coverUrl);
				}
			}

			const currentSlug = slugsMapByPostId.get(iBlogPost.objectId)?.get('slug') || 'no-slug';
			_.set(iBlogPost, 'currentSlug', currentSlug);

			return iBlogPost;
		});

		return finalBlogPosts;
	}

	static toTranslatedIBlogPost(post: IBlogPostWithRelations, locale: AppLocale): TranslatedIBlogPostWithRelations {
		const translation = post.translation?.[locale] ?? {};

		const finalBlogPost = _.assign({} as TranslatedIBlogPostWithRelations, post, translation, { locale });

		return finalBlogPost;
	}

	// normally we use this only in the BO dashboard

	findSlugsForBlogPostById(
		postId: string,
		options: { json: true; searchTerm?: string; page?: number; pageSize?: number; select?: string[] },
	): Promise<WithMeta<{ slugs: IBlogPostSlug[] }>>;
	findSlugsForBlogPostById(
		postId: string,
		options: { json?: false | undefined; searchTerm?: string; page?: number; pageSize?: number; select?: string[] },
	): Promise<WithMeta<{ slugs: ParseBlogPostSlug[] }>>;
	async findSlugsForBlogPostById(
		postId: string,
		options: { json?: boolean; searchTerm?: string; page?: number; pageSize?: number; select?: string[] },
	) {
		const postObject = new ParseBlogPost({ objectId: postId });
		const query = new Parse.Query(ParseBlogPostSlug).equalTo('post' as never, postObject as never);

		applyQueryOptions(query, options);

		const page = options.page ?? 0;
		const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;

		applySkipAndLimit(query, { type: 'page', page, pageSize });

		if (options.searchTerm) {
			const pipeline: Parse.PipelineStage[] = [
				{
					$search: {
						index: 'default',
						autocomplete: {
							query: options.searchTerm,
							path: 'slug',
						},
					},
				},
				{
					$match: {
						_p_post: `${className.BLOG_POST}$${postId}`,
					},
				},
				{
					$project: {
						_id: 1,
					},
				},
			];
			const ids = await new Parse.Query(className.BLOG_POST_SLUG).aggregate(pipeline);
			query.containedIn('objectId', ids);
		}

		const totalCountPromise = query.count({ sessionToken: this.sessionToken });
		const slugsPromise = query.find({ sessionToken: this.sessionToken, json: options.json });

		const [totalCount, slugs] = await Promise.all([totalCountPromise, slugsPromise]);

		const count = slugs.length;

		// getMetaFromSkipAndLimit({ results, count, page, pageSize });
		const meta: ListMeta = {
			count,
			page,
			pageSize,
			totalCount,
			totalPages: Math.floor(totalCount / (count || 1)),
		};

		if (options.json) {
			// eslint-disable-next-line @typescript-eslint/naming-convention
			const _slugs = slugs as unknown as IBlogPostSlug[];

			return { slugs: _slugs, meta };
		}

		return { slugs, meta };
	}
}

// const getMetaFromSkipAndLimit = ({ results, totalCount, skip, pageSize }: { results: any[]; count: number; page: number; pageSize: number; }): ListMeta => {
// 	return {
// 		page,
// 		pageSize,
// 		totalCount,
// 	}
// }
