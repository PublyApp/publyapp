// import { useApp } from '../../hooks/useApp';

import { useBreadcrumbs } from '../../hooks/useBreadcrumbs';

const Home = () => {
	const breadcrumbs = useBreadcrumbs();

	breadcrumbs([
		{
			link: 'contact',
			text: 'Contact',
		},
		{
			link: 'contact',
			text: 'Contact',
		},
	]);

	return <div>Home</div>;
};

export default Home;
