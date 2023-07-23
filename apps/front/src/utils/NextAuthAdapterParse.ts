import { Adapter, AdapterUser, AdapterSession } from 'next-auth/adapters';

import { initParseFront } from './initParseFront';

const convertUser = (user: Parse.User): AdapterUser => {
	return {
		id: user.id,
		email: user.getEmail(),
		emailVerified: user.get('emailVerified'),
	};
};

const convertSession = (session: Parse.Session): AdapterSession => {
	return {
		sessionToken: session.getSessionToken(),
		expires: session.get('expiresAt'),
		userId: session.get('user').id,
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
		linkAccount: async ({ provider, userId, ...authData }) => {
			const foundUser = await new Parse.Query(Parse.User).get(userId);
			await foundUser.linkWith(provider, { authData });
		},
		// TODO: unlinkAccount
		createSession: async ({ expires, sessionToken, userId }) => {
			const newSession = new Parse.Session();
			const user = await new Parse.Query(Parse.User).get(userId);
			newSession.set('user', user);
			newSession.set('sessionToken', sessionToken);
			newSession.set('expiresAt', expires);
			const session = await newSession.save();
			return convertSession(session);
		},
		getSessionAndUser: async (sessionToken) => {
			const foundSessionWithUser = await new Parse.Query(Parse.Session)
				.equalTo('sessionToken', sessionToken)
				.include('user')
				.first();
			const session = convertSession(foundSessionWithUser);
			const parseUser = foundSessionWithUser.get('user');
			const user = convertUser(parseUser);
			return { session, user };
		},
		updateSession: async ({ sessionToken, ...rest }) => {
			const foundSession = await new Parse.Query(Parse.Session).equalTo('sessionToken', sessionToken).first();

			// eslint-disable-next-line no-restricted-syntax
			for (const key of Object.keys(rest)) {
				foundSession.set(key, rest[key]);
			}

			const session = await foundSession.save();
			return convertSession(session);
		},
		deleteSession: async (sessionToken) => {
			const foundSession = await new Parse.Query(Parse.Session).equalTo('sessionToken', sessionToken).first();
			const session = await foundSession.destroy();
			return convertSession(session);
		},
	};
};
