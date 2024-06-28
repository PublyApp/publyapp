import asyncJs from 'async';
import _ from 'lodash';

// import { newObjectId } from 'parse-server/lib/cryptoUtils.js';
// import dayjs from 'dayjs';
// import logger from '@/server/lib/logger';

import { USE_MASTER_KEY } from '@/server/lib/constants';
import { parseJob } from '@/server/lib/parse/utils';
import { jobName } from '@/shared/lib/constants';

import ParseBlogPost from './blogPost/blogPost.class';
import ParseBlogPostTag from './blogPostTag/blogPostTag.class';

// Parse.Cloud.job(
// 	jobName.blog.collectBlogPostTags,
// 	parseJob(async (_req) => {
// 		const query = new Parse.Query(ParseBlogPost).equalTo('published', true).select(['tags']);

// 		const tagsOperationsMapByName = new Map<
// 			string,
// 			{
// 				updateOne: {
// 					filter: { name: string };
// 					update: {
// 						$set: {
// 							_id?: string;
// 							postsCount: number;
// 							_created_at?: string;
// 							_updated_at?: string;
// 						};
// 					};
// 					upsert: true;
// 				};
// 			}
// 		>();

// 		const queriedTagNamesMap = new Map<string, { exists: boolean }>();
// 		const config = getInternalConfig();

// 		const q = asyncJs.queue(async ({ tagName }: { tagName: string }, _c) => {
// 			const tagMapItem = tagsOperationsMapByName.get(tagName);

// 			let isNewTag = true;

// 			const queriedTagName = queriedTagNamesMap.get(tagName);

// 			if (!queriedTagName) {
// 				const foundTagObject = await new Parse.Query(ParseBlogPostTag)
// 					.select(['name'])
// 					.equalTo('name', tagName)
// 					.first(USE_MASTER_KEY);

// 				if (!foundTagObject) {
// 					queriedTagNamesMap.set(tagName, { exists: false });
// 					isNewTag = true;
// 				} else {
// 					queriedTagNamesMap.set(tagName, { exists: true });
// 					isNewTag = false;
// 				}
// 			} else {
// 				isNewTag = !queriedTagName.exists;
// 			}

// 			const newPostsCount = (tagMapItem?.updateOne.update.$set.postsCount || 0) + 1;
// 			const objectId = isNewTag ? tagMapItem?.updateOne.update.$set._id || newObjectId(config.objectIdSize) : undefined;
// 			const createdAt = isNewTag ? tagMapItem?.updateOne.update.$set._created_at || dayjs().toISOString() : undefined;
// 			const updatedAt = tagMapItem?.updateOne.update.$set._updated_at || dayjs().toISOString();

// 			tagsOperationsMapByName.set(tagName, {
// 				updateOne: {
// 					filter: { name: tagName },
// 					update: {
// 						$set: {
// 							postsCount: newPostsCount,
// 							...(isNewTag
// 								? {
// 										_id: objectId,
// 										_created_at: createdAt,
// 									}
// 								: {}),
// 							_updated_at: updatedAt,
// 						},
// 					},
// 					upsert: true,
// 				},
// 			});
// 		}, 5);

// 		await query.eachBatch(async (posts) => {
// 			// eslint-disable-next-line @typescript-eslint/naming-convention
// 			const _tagNamesArray: string[] = [];
// 			// eslint-disable-next-line @typescript-eslint/naming-convention
// 			const _tagNamesSet = new Set<string>();

// 			posts.forEach((post) => {
// 				const tags = post.get('tags');
// 				tags?.forEach((tagName) => {
// 					_tagNamesArray.push(tagName);
// 					_tagNamesSet.add(tagName);
// 				});
// 			});

// 			const notYetQueriedTagsSet = new Set<string>();

// 			_tagNamesSet.forEach((_tagName) => {
// 				const queried = queriedTagNamesMap.has(_tagName);

// 				if (!queried) {
// 					notYetQueriedTagsSet.add(_tagName);
// 				}
// 			});

// 			const foundTags = await new Parse.Query(ParseBlogPostTag)
// 				.select(['name'])
// 				.containedIn('name', Array.from(notYetQueriedTagsSet))
// 				.findAll(USE_MASTER_KEY);

// 			foundTags.forEach((tag) => {
// 				// eslint-disable-next-line @typescript-eslint/naming-convention
// 				const _tagName = tag.get('name');

// 				queriedTagNamesMap.set(_tagName, { exists: true });
// 				notYetQueriedTagsSet.delete(_tagName);
// 			});

// 			const notFoundTagsSet = notYetQueriedTagsSet;
// 			notFoundTagsSet.forEach((_tagName) => {
// 				queriedTagNamesMap.set(_tagName, { exists: false });
// 			});

// 			_tagNamesArray.forEach((tagName) => {
// 				q.push({ tagName });
// 			});
// 		}, USE_MASTER_KEY);

// 		if (q.length() > 0) {
// 			await q.drain();
// 		}

// 		const collection = getDatabase().collection(className.BLOG_POST_TAG);
// 		const chunkedOperations = _.chunk(Array.from(tagsOperationsMapByName.values()), 100);

// 		await asyncJs.eachOfLimit(chunkedOperations, 5, async (operationsChunk) => {
// 			await collection.bulkWrite(operationsChunk, { ordered: false });
// 		});
// 	}),
// );
// class ArrayCollection<T> {
// 	items: T[] = [];

// 	// eslint-disable-next-line class-methods-use-this, @typescript-eslint/no-unused-vars
// 	onPush(_e: T) {}

// 	push(e: T) {
// 		this.onPush(e);
// 		this.items.push(e);
// 	}
// }

Parse.Cloud.job(
	jobName.blog.collectBlogPostTags,
	parseJob(async (_req) => {
		const query = new Parse.Query(ParseBlogPost).equalTo('published', true).select(['tags']);

		const EACH_BATCH_LIMIT = 100;

		const dynamicTagNamesArray: string[] = [];
		const staticTagNamesArray: string[] = [];
		const tagsMap = new Map<string, ParseBlogPostTag>();

		const FIND_TAG_LIMIT = 100;
		const q = asyncJs.queue(async ({ tagNames }: { tagNames: string[] }) => {
			if (tagNames.length > FIND_TAG_LIMIT) {
				throw new Error('FIND_TAG_LIMIT exceeded');
			}

			const tagNamesSet = new Set(tagNames);

			const tags = await new Parse.Query(ParseBlogPostTag)
				.select(['name'])
				.containedIn('name', tagNames)
				.limit(FIND_TAG_LIMIT)
				.find(USE_MASTER_KEY);

			// const notFoundTagNames: string[] = [];
			tags.forEach((tag) => {
				// eslint-disable-next-line @typescript-eslint/naming-convention
				const _tagName = tag.get('name');
				tag.set('postsCount', 0); // initialize for later
				tagsMap.set(_tagName, tag);
				tagNamesSet.delete(_tagName);
			});

			const notFoundTagNames = tagNamesSet;
			notFoundTagNames.forEach((tagName) => {
				const newTag = new ParseBlogPostTag({ name: tagName, postsCount: 0 });
				tagsMap.set(tagName, newTag);
			});
		}, 5);

		const addToQueue = () => {
			const chunkSize = 100;

			while (!_.isEmpty(dynamicTagNamesArray)) {
				const removedElements = dynamicTagNamesArray.splice(0, chunkSize);
				q.push({ tagNames: removedElements });
			}
		};

		await query.eachBatch(
			(posts) => {
				// ---
				posts.forEach((post) => {
					post.get('tags')?.forEach((tagName) => {
						staticTagNamesArray.push(tagName);

						const notYetQueriedTagName = !tagsMap.has(tagName);

						if (notYetQueriedTagName) {
							dynamicTagNamesArray.push(tagName);
						}

						if (dynamicTagNamesArray.length >= 100) {
							addToQueue();
						}
					});
				});
			},
			{ useMasterKey: true, batchSize: EACH_BATCH_LIMIT },
		);

		addToQueue();

		if (q.length() > 0) {
			await q.drain();
		}

		const chunkSaveSize = 100;
		const postsSaveChunks: ParseBlogPostTag[][] = [];
		const addedToChunksTagNamesSet = new Set<string>();

		let cursor = 0;
		const chunkIndex = Math.floor(cursor / chunkSaveSize);
		const chunkItemIndex = cursor - chunkIndex * chunkSaveSize;

		staticTagNamesArray.forEach((tagName) => {
			const foundTag = tagsMap.get(tagName);

			if (!foundTag) {
				return;
			}

			foundTag.set('postsCount', foundTag.get('postsCount') + 1);

			if (!addedToChunksTagNamesSet.has(tagName)) {
				postsSaveChunks[chunkIndex][chunkItemIndex] = foundTag;
				addedToChunksTagNamesSet.add(tagName);
				cursor += 1;
			}
		});

		asyncJs.eachLimit(postsSaveChunks, 5, async (chunkSave) => {
			await Parse.Object.saveAll(chunkSave);
		});
	}),
);
