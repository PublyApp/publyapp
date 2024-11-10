import { faker } from '@faker-js/faker';
import asyncJs from 'async';

import { USE_MASTER_KEY } from '@/server/lib/constants';
import { functionName } from '@/shared/lib/constants';

import ParseUserProfile from '../userProfile/userProfile.class';

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
	const savedProfiles: ParseUserProfile[] = [];

	const BATCH_SAVE_LIMIT = 100;
	const q = asyncJs.queue(
		async ({
			objects,
		}: {
			objects: {
				user: ParseUser;
				profileData: {
					firstName: string;
					lastName: string;
				};
			}[];
		}) => {
			if (objects.length > BATCH_SAVE_LIMIT) {
				throw new Error('BATCH_SAVE_LIMIT exceeded');
			}

			const profilesDataMap = new Map<string, (typeof objects)[0]['profileData']>();
			const usersToSave: ParseUser[] = [];
			objects.forEach((e) => {
				profilesDataMap.set(e.user.getUsername() as never, e.profileData);
				usersToSave.push(e.user);
			});

			const usersResults = await Parse.Object.saveAll(usersToSave, { batchSize: BATCH_SAVE_LIMIT, useMasterKey: true });

			const profilesToSave: ParseUserProfile[] = [];
			usersResults.forEach((user) => {
				const profileData = profilesDataMap.get(user.getUsername() as never);

				const newProfile = new ParseUserProfile({
					username: user.getUsername(),
					firstName: profileData?.firstName,
					lastName: profileData?.lastName,
					user,
				});

				newProfile.set('seeded' as never, true as never);

				profilesToSave.push(newProfile);
				savedUsers.push(user);
			});

			const profilesResults = await Parse.Object.saveAll(profilesToSave, {
				batchSize: BATCH_SAVE_LIMIT,
				useMasterKey: true,
			});

			profilesResults.forEach((profile) => {
				savedProfiles.push(profile);
			});
		},
		5,
	);

	Array.from({ length: chunksNum }, (_, index) => {
		const isLastIndex = index === chunksNum - 1;

		let chunkItemsNum = chunkSize;

		if (isLastIndex) {
			chunkItemsNum = num - chunkSize * index;
		}

		const usersBatchGroup = Array.from({ length: chunkItemsNum }, () => {
			return userSeedFactory();
		});

		q.push({ objects: usersBatchGroup });

		return undefined;
	});

	if (q.length() > 0) {
		await q.drain();
	}

	return { savedUsers, savedProfiles };
};

export const cleanUsers = async () => {
	return Parse.Cloud.run(functionName.auth.removeSeededUsers, null, USE_MASTER_KEY);
};
