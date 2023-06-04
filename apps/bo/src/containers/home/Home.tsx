import { useEffect } from 'react';

import { useApp } from '../../hooks/useApp';

const Home = () => {
	const { setBreadcrumbs } = useApp();

	useEffect(() => {
		setBreadcrumbs([
			{
				link: 'contact',
				text: 'Contact',
			},
			{
				link: 'contact',
				text: 'Contact',
			},
		]);
	}, [setBreadcrumbs]);

	return <div>Home</div>;
};

export default Home;
