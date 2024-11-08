import { faker } from '@faker-js/faker';
import asyncJs from 'async';

import { USE_MASTER_KEY } from '@/server/lib/constants';
import { functionName } from '@/shared/lib/constants';

import ParseUser from './user.class';

export const userSeedFactory = () => {
	const firstName = faker.person.firstName();
	const lastName = faker.person.lastName();
	const username = faker.internet.userName({ firstName, lastName });
	const email = faker.internet.email({ firstName, lastName });

	const GENERIC_PASSWORD = '123456789@';
	// eslint-disable-next-line @typescript-eslint/naming-convention
	// const _hashed_password = hash(GENERIC_PASSWORD);

	const user = new ParseUser({
		username,
		email,
		password: GENERIC_PASSWORD,
	});

	user.set('seeded', true);

	const profileData = {
		firstName,
		lastName,
	};

	return { user, profileData };
};

export const createUsers = async ({ num }: { num: number }) => {
	const chunkSize = 100;
	const chunksNum = Math.floor(num / chunkSize) + 1;

	const savedUsers: ParseUser[] = [];

	const BATCH_SAVE_LIMIT = 100;
	const q = asyncJs.queue(async ({ users }: { users: ParseUser[] }) => {
		if (users.length > BATCH_SAVE_LIMIT) {
			throw new Error('BATCH_SAVE_LIMIT exceeded');
		}

		const results = await Parse.Object.saveAll(users, { batchSize: BATCH_SAVE_LIMIT, useMasterKey: true });
		savedUsers.push(...results);
	}, 5);

	// let dynamicNum = num;
	Array.from({ length: chunksNum }, (_, index) => {
		const isLastIndex = index === chunksNum - 1;

		let chunkItemsNum = chunkSize;

		if (isLastIndex) {
			chunkItemsNum = num - chunkSize * index;
		}

		const usersBatchGroup = Array.from({ length: chunkItemsNum }, () => {
			return userSeedFactory();
		});

		q.push({ users: usersBatchGroup });

		return undefined;
	});

	if (q.length() > 0) {
		await q.drain();
	}

	return savedUsers;
};

export const cleanUsers = async () => {
	return Parse.Cloud.run(functionName.auth.removeSeededUsers, null, USE_MASTER_KEY);
};
