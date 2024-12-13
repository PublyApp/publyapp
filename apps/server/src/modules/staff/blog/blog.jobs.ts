import asyncJs from 'async';
import _ from 'lodash';

import { USE_MASTER_KEY } from '@/server/lib/constants';
import { parseJob } from '@/server/lib/parse/function.utils';
import { getDatabase } from '@/server/lib/parse/parse.utils';
import { className, jobName } from '@/shared/lib/constants';

import ParseBlogPost from './blogPost/blogPost.class';
import ParseBlogPostTag from './blogPostTag/blogPostTag.class';

Parse.Cloud.job(
	jobName.blog.collectBlogPostTags,
	parseJob(async (req) => {
		const startTime = performance.now();

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

		let chunkIndex = 0;

		staticTagNamesArray.forEach((tagName /* , cursor */) => {
			// setup
			if (!postsSaveChunks[chunkIndex]) {
				postsSaveChunks[chunkIndex] = [];
			}

			const foundTag = tagsMap.get(tagName);

			if (!foundTag) {
				return;
			}

			foundTag.set('postsCount', foundTag.get('postsCount') + 1);

			if (!addedToChunksTagNamesSet.has(tagName)) {
				postsSaveChunks[chunkIndex].push(foundTag);

				if (postsSaveChunks[chunkIndex].length >= chunkSaveSize) {
					chunkIndex += 1;
				}

				addedToChunksTagNamesSet.add(tagName);
			}
		});

		const q2 = asyncJs.queue(async ({ chunkSave }: { chunkSave: ParseBlogPostTag[] }) => {
			await Parse.Object.saveAll(chunkSave, { batchSize: 100, useMasterKey: true });
		}, 5);

		q2.push(
			postsSaveChunks.map((chunkSave) => {
				return { chunkSave };
			}),
		);

		if (q.length() > 0) {
			await q.drain();
		}

		const endTime = performance.now();

		const JobStatus = getDatabase().collection(className.JOB_STATUS);
		JobStatus.updateOne({ _id: req.jobId as never }, { $set: { execTime: endTime - startTime } });
	}),
);
