import type { Route } from '../+types/HomePage';

export const meta = (_: Route.MetaArgs) => {
	return [{ title: 'New React Router App' }, { name: 'description', content: 'Welcome to React Router!' }];
};

const HomePage = ({ loaderData: _ }: Route.ComponentProps) => {
	return (
		<div>
			<h1>🏠🏠🏠 Home page</h1>
		</div>
	);
};

export default HomePage;
