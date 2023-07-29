import { AuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

// import { NextAuthAdapterParse } from '../../../../utils/NextAuthAdapterParse';
import { initParseFront } from '../../../../utils/initParseFront';
import { NextAuthAdapterParse } from '../../../../utils/NextAuthAdapterParse';

initParseFront();

export const authOptions: AuthOptions = {
	providers: [
		CredentialsProvider({
			name: 'Credentials',
			credentials: {
				username: { label: 'Username', type: 'text', placeholder: 'jsmith' },
				password: { label: 'Password', type: 'password' },
			},
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			async authorize(credentials, _req) {
				const user = await Parse.User.logIn(credentials.username, credentials.password);

				return {
					id: user.id,
				};
			},
		}),
	],
	adapter: NextAuthAdapterParse('http://localhost:6180/parse', 'aktiveo', undefined, 'local-master-key'),
};
