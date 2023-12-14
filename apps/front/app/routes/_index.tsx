import { redirect, type ActionFunction } from '@remix-run/node';

// import type { MetaFunction } from '@remix-run/node';

// import AwesomeToolsView from '@/front/containers/awesomeTools/AwesomeToolsView';

// // https://remix.run/docs/en/main/route/meta
// export const meta: MetaFunction = () => {
// 	return [{ title: 'Remix Starter' }, { name: 'description', content: 'Welcome to remix!' }];
// };

export const loader: ActionFunction = async () => {
	return redirect('/awesome-tools', 301);
};

// https://remix.run/docs/en/main/file-conventions/routes#basic-routes
const Index = () => {
	return null;
};

export default Index;
