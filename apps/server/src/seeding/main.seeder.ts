/* eslint-disable no-console */
import { faker } from '@faker-js/faker';

import { roleEnum } from '@devist/shared/lib/constants';

import { findRoleByCode } from '../lib/parse';

import { aiToolFactory } from './factories/aiTool.factory';
import { userFactory } from './factories/user.factory';
import { webHostFactory } from './factories/webHost.factory';

export type RunConfig = {
	// masterKey: string;
	usersNum: number;
	// postsNum: number;
	// reactionsNum: number;
	aiToolsNum: number;
	webHostsNum: number;
};

export const run = async ({
	/* masterKey, */ usersNum /* , postsNum, reactionsNum */,
	aiToolsNum,
	webHostsNum,
}: RunConfig) => {
	// Problem with PArse and MAster Key
	// Parse.masterKey = masterKey;

	// =================== USERS =======================//
	/* const users =  */
	await Promise.all(
		Array.from({ length: usersNum }).map(async () => {
			const iUser = await userFactory(faker);
			const createdUser = await iUser.save(null, { useMasterKey: true });

			// assign role to user
			const authorRole = await findRoleByCode(roleEnum.AUTHOR.code, true);
			authorRole?.getUsers().add(createdUser);
			await authorRole?.save(null, { useMasterKey: true });

			return createdUser;
		}),
	);

	console.info('users seeding done');

	// --------------------------------------------------------------------------------------//
	//                                       AI Tools                                       //
	// --------------------------------------------------------------------------------------//
	await Promise.all(
		Array.from({ length: aiToolsNum }).map(async () => {
			const iTool = await aiToolFactory(faker);
			const createdAITool = await iTool.save(null, { useMasterKey: true });
			return createdAITool;
		}),
	);

	console.info('AI tools seeding done');

	// --------------------------------------------------------------------------------------//
	//                                       Web hosts                                       //
	// --------------------------------------------------------------------------------------//
	await Promise.all(
		Array.from({ length: webHostsNum }).map(async () => {
			const webHost = await webHostFactory(faker);
			const createdWebHost = await webHost.save(null, { useMasterKey: true });
			return createdWebHost;
		}),
	);

	console.info('Web hosts seeding done');

	// const userIds = users.map((user) => {
	// 	return user.id;
	// });

	// set the UserFollows relation
	// await Promise.all(
	// 	userIds.map(async (userId) => {
	// 		const filteredIds = userIds.filter((id) => {
	// 			return id !== userId;
	// 		});
	// 		await prismaClient.user.update({
	// 			where: { id: userId },
	// 			data: {
	// 				followers: {
	// 					connect: faker.helpers.arrayElements(
	// 						filteredIds.map((id) => {
	// 							return { id };
	// 						}),
	// 					),
	// 				},
	// 			},
	// 		});
	// 	}),
	// );

	// =================== POSTS =======================//
	// const madePosts = Array.from({ length: postsNum }).map(() => {
	//   const post = postFactory(faker) as Post & { tags: any };
	//   post.userId = faker.helpers.arrayElement(userIds);
	//   // randomly set a value for now
	//   // TODO set the dateTime fields to a date after related user's creation
	//   // if (post.published) post.publishedAt = faker.datatype.datetime();
	//   // post.publishedAt = faker.datatype.datetime(); // default to now in schema

	//   // // ! connect to existing tags
	//   // post.tags = {
	//   //   connect: faker.helpers.arrayElements(tagIds.map((id) => ({ id }))).slice(0, 4),
	//   // };

	//   return post;
	// });

	// await prismaClient.post.createMany({ data: madePosts });
	// const posts = await prismaClient.post.findMany();
	// log.info("post seeding done");

	// const postsIds = posts.map((post) => post.id);

	// ==================== COMMENTS (ON POSTS) =======================//

	// =================== REACTIONS (TO POSTS) =======================//
	// const madeReactions = Array.from({ length: reactionsNum }).map(() => {
	//   const reaction = reactionFactory(faker);

	//   reaction.postId = faker.helpers.arrayElement(postsIds);
	//   // ! there should be only an unique combination of [postId, type, userId]
	//   // but we don't care for now
	//   reaction.userId = faker.helpers.arrayElement(userIds);

	//   return reaction;
	// });

	// await prismaClient.reaction.createMany({ data: madeReactions });
	// const reactions = await prismaClient.reaction.findMany();
	// log.info("reactions seeding done");

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	// const reactionsIds = reactions.map((reaction) => {
	// 	return reaction.id;
	// });

	// =================== TAGS =======================//
	// for ensuring that tag names are unique we use the hardcoded array below
	// const tagNames = ["React", "Prisma", "Midlleware", "General Coding", "HTML"];
	// const tagNames = [...new Set(faker.lorem.words(10).split(" "))];

	// const madeTags = tagNames.map((name) => {
	//   const tag = tagFactory(faker);
	//   tag.name = name;
	//   return tag;
	// });

	// await prismaClient.tag.createMany({ data: madeTags });
	// await Promise.all(madeTags.map(async (tag) => {
	//   await prismaClient.tag.create({
	//     data: {
	//       ...tag,
	//       posts: {
	//         connect: faker.helpers.arrayElements(postsIds.map((id) => ({ id }))),
	//       },
	//       followers: {
	//         connect: faker.helpers.arrayElements(userIds.map((id) => ({ id }))),
	//       },
	//     },
	//   });
	// }));
	// const tags = await prismaClient.tag.findMany();
	// log.info("tags seeding done");

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	// const tagIds = tags.map((post) => post.id);

	// prismaClient.post.create({ data: { tags: { connect: [{id: 'fef'}, {}] } } });
};
