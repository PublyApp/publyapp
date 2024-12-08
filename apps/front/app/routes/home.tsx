import { Welcome } from '../welcome/welcome';

import type { Route } from './+types/home';

export const meta = (_: Route.MetaArgs) => {
	return [{ title: 'New React Router App' }, { name: 'description', content: 'Welcome to React Router!' }];
};

const Home = () => {
	return <Welcome />;
};

export default Home;
