import { useTranslation } from 'react-i18next';

import type { Route } from './+types/HomePage';

export const meta = (_: Route.MetaArgs) => {
	return [{ title: 'New React Router App' }, { name: 'description', content: 'Welcome to React Router!' }];
};

const HomePage = ({ loaderData: _ }: Route.ComponentProps) => {
	const { t } = useTranslation();
	return (
		<div>
			<h1>{t('hello')}!!</h1>
			<h2>The product is coming soon!</h2>
			{/* <Button variant="primary">Hello</Button> */}
			{/* <Composition /> */}
		</div>
	);
};

export default HomePage;
