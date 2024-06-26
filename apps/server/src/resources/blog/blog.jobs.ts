import { newObjectId } from 'parse-server/lib/cryptoUtils.js';

import asyncJs from 'async';
import dayjs from 'dayjs';
import _ from 'lodash';

import { USE_MASTER_KEY } from '@/server/lib/constants';
// import logger from '@/server/lib/logger';
import { getDatabase, getInternalConfig, parseJob } from '@/server/lib/parse/utils';
import { className, jobName } from '@/shared/lib/constants';

import ParseBlogPost from './blogPost/blogPost.class';
import ParseBlogPostTag from './blogPostTag/blogPostTag.class';

Parse.Cloud.job(
	jobName.blog.collectBlogPostTags,
	parseJob(async (_req) => {
		const query = new Parse.Query(ParseBlogPost).equalTo('published', true).select(['tags']);

		const tagsOperationsMapByName = new Map<
			string,
			{
				updateOne: {
					filter: { name: string };
					update: {
						$set: {
							_id?: string;
							postsCount: number;
							_created_at?: string;
							_updated_at?: string;
						};
					};
					upsert: true;
				};
			}
		>();

		const tagNamesSet = new Map<string, { exists: boolean }>();
		const config = getInternalConfig();

		const q = asyncJs.queue(async ({ tagName }: { tagName: string }, _c) => {
			const tagMapItem = tagsOperationsMapByName.get(tagName);

			let isNewTag = true;

			const queriedTagName = tagNamesSet.get(tagName);

			if (!queriedTagName) {
				const foundTagObject = await new Parse.Query(ParseBlogPostTag)
					.select(['name'])
					.equalTo('name', tagName)
					.first(USE_MASTER_KEY);

				if (!foundTagObject) {
					tagNamesSet.set(tagName, { exists: false });
					isNewTag = true;
				} else {
					tagNamesSet.set(tagName, { exists: true });
					isNewTag = false;
				}
			} else {
				isNewTag = !queriedTagName.exists;
			}

			const newPostsCount = (tagMapItem?.updateOne.update.$set.postsCount || 0) + 1;
			const objectId = isNewTag ? tagMapItem?.updateOne.update.$set._id || newObjectId(config.objectIdSize) : undefined;
			const createdAt = isNewTag ? tagMapItem?.updateOne.update.$set._created_at || dayjs().toISOString() : undefined;
			const updatedAt = tagMapItem?.updateOne.update.$set._updated_at || dayjs().toISOString();

			tagsOperationsMapByName.set(tagName, {
				updateOne: {
					filter: { name: tagName },
					update: {
						$set: {
							postsCount: newPostsCount,
							...(isNewTag
								? {
										_id: objectId,
										_created_at: createdAt,
									}
								: {}),
							_updated_at: updatedAt,
						},
					},
					upsert: true,
				},
			});
		}, 5);

		await query.eachBatch(async (posts) => {
			posts.forEach((post) => {
				const tags = post.get('tags');
				tags?.forEach((tagName) => {
					q.push({ tagName });
				});
			});
		}, USE_MASTER_KEY);

		await q.drain();

		const collection = getDatabase().collection(className.BLOG_POST_TAG);
		const chunkedOperations = _.chunk(Array.from(tagsOperationsMapByName.values()), 100);

		await asyncJs.eachOfLimit(chunkedOperations, 5, async (operationsChunk) => {
			await collection.bulkWrite(operationsChunk, { ordered: false });
		});
	}),
);
