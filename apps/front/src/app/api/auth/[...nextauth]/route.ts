import NextAuth from 'next-auth';

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
	providers: [],
	adapter: NextAuthAdapterParse(),
});
