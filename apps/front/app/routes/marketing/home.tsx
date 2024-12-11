import type { Route } from './+types/Home';

export const meta = (_: Route.MetaArgs) => {
	return [{ title: 'New React Router App' }, { name: 'description', content: 'Welcome to React Router!' }];
};

const Home = () => {
	return <h1>Hello!!</h1>;
};

export default Home;
