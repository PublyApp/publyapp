import NextAuth from 'next-auth';
import EmailProvider from 'next-auth/providers/email';

import { NextAuthAdapterParse } from '../../../../utils/NextAuthAdapterParse';
// import GithubProvider from 'next-auth/providers/github';

// export const authOptions = {
// 	// Configure one or more authentication providers
// 	providers: [
// 		// GithubProvider({
// 		// 	clientId: process.env.GITHUB_ID,
// 		// 	clientSecret: process.env.GITHUB_SECRET,
// 		// }),
// 		// ...add more providers here
// 	],
// };
export default NextAuth({
	providers: [
		EmailProvider({
			server: process.env.EMAIL_SERVER,
			from: process.env.EMAIL_FROM,
		}),
	],
	adapter: NextAuthAdapterParse('http://localhost:6180/parse', 'aktiveo', undefined, 'local-master-key'),
});
