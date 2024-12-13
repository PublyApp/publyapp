import React, { Suspense } from 'react';

import { Box, Button } from '@mantine/core';
import { useLoaderData } from 'react-router';

import { sleep } from '@/shared/utils/any.utils';

import type { Route } from './+types/HomePage';

export const meta = (_: Route.MetaArgs) => {
	return [{ title: 'New React Router App' }, { name: 'description', content: 'Welcome to React Router!' }];
};

const fn1 = async () => {
	return sleep(100, 'cool');
};

const fn2 = async () => {
	await sleep(100);
	throw new Error('Intentional error');
};

const fn3 = async () => {
	return sleep(100, 'very cool');
};

export const loader = async (_: Route.LoaderArgs) => {
	const p1 = fn1();
	const p2 = fn2();
	const p3 = fn3();

	return {
		p1,
		p2,
		p3,
	};
};

const DisplayData = ({ data }: { data: Promise<string> }) => {
	const display = React.use(data);
	return <Box>{display}</Box>;
};

const Composition = () => {
	const loaderData = useLoaderData<typeof loader>();

	return (
		<Suspense fallback={<h3>Loading...</h3>}>
			<DisplayData data={loaderData.p1} />
		</Suspense>
	);
};

const HomePage = ({ loaderData: _ }: Route.ComponentProps) => {
	return (
		<div>
			<h1>Hello!!</h1>
			<Button variant="primary">Hello</Button>
			<Composition />
		</div>
	);
};

export default HomePage;
