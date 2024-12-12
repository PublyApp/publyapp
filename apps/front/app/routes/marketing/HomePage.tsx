import { Button } from '@mantine/core';

import type { Route } from './+types/HomePage';

export const meta = (_: Route.MetaArgs) => {
	return [{ title: 'New React Router App' }, { name: 'description', content: 'Welcome to React Router!' }];
};

const HomePage = () => {
	return (
		<div>
			<h1>Hello!!</h1>
			<Button variant="primary">Hello</Button>
		</div>
	);
};

export default HomePage;
