import { useEffect } from 'react';

import { Typography, Button } from '@mui/material';
import { useQuery } from '@tanstack/react-query';

import { useApp } from '../../hooks/useApp';

const helloAction = async () => {
	try {
		return Parse.Cloud.run('hello') as any;
	} catch (error) {
		return Promise.reject(error);
	}
};

const Home = () => {
	const { setBreadcrumbs } = useApp();

	const { data, refetch: sayHello } = useQuery({ queryKey: ['sayHello'], queryFn: helloAction, enabled: false });

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

	return (
		<div>
			<Typography variant="h1">Home</Typography>

			<Button
				variant="contained"
				onClick={() => {
					sayHello();
				}}
			>
				Say Hello
			</Button>

			<pre>{JSON.stringify(data, null, 2)}</pre>
		</div>
	);
};

export default Home;
