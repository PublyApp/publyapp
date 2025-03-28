import Hero from '../../components/ui/template/Hero';
import { Navigation } from '../../components/ui/template/Navbar';

import type { Route } from './+types/HomePage';

export const meta = (_: Route.MetaArgs) => {
	return [{ title: 'New React Router App' }, { name: 'description', content: 'Welcome to React Router!' }];
};

const HomePage = ({ loaderData: _ }: Route.ComponentProps) => {
	return (
		<div>
			<Navigation />
			<Hero />
		</div>
	);
};

export default HomePage;
