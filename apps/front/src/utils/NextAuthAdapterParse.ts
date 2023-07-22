import { Adapter, AdapterUser } from 'next-auth/adapters';

import { initParseFront } from './initParseFront';

const convertUser = (user: Parse.User): AdapterUser => {
	return {
		id: user.id,
		email: user.getEmail(),
		emailVerified: user.get('emailVerified'),
	};
};

export const NextAuthAdapterParse = (): Adapter => {
	initParseFront();

	return {
		createUser: async (attributes) => {
			const userToSave = new Parse.User(attributes);
			const user = await userToSave.save();
			return convertUser(user);
		},
		getUser: async (id) => {
			const user = await new Parse.Query(Parse.User).get(id);
			return convertUser(user);
		},
		getUserByEmail: async (email) => {
			const user = await new Parse.Query(Parse.User).equalTo('email', email).first();
			return convertUser(user);
		},
		getUserByAccount: async ({ provider, providerAccountId }) => {
			const user = await new Parse.Query(Parse.User).equalTo(`authData.${provider}.id`, providerAccountId).first();
			return convertUser(user);
		},
		updateUser: async ({ id, ...attributes }) => {
			if (!id) throw new Error('[updateUser] Missing id');
			const foundUser = await new Parse.Query(Parse.User).get(id);

			// eslint-disable-next-line no-restricted-syntax
			for (const key of Object.keys(attributes)) {
				foundUser.set(key, attributes[key]);
			}

			const user = await foundUser.save(/* null, { useMasterKey: true } */);
			return convertUser(user);
		},
		deleteUser: async (userId) => {
			const foundUser = await new Parse.Query(Parse.User).get(userId);
			foundUser.set('deleted', true);
			const user = await foundUser.save();
			return convertUser(user);
		},
		linkAccount: async (account) => {
			// return AdapterAccount
		},
	};
};
