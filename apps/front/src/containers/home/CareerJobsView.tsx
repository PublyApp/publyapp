'use client';

/* eslint-disable no-promise-executor-return */
import { useEffect, useState } from 'react';

import Container from '@mui/material/Container';

import { _jobs } from '@front/_mock';
import MainLayout from '@front/layouts/main/MainLayout';

import CareerJobList from './CareerJobList';

//
// import NewsletterCareer from '../../newsletter/career';
// import CareerFilters from '../job/filters';
// import { CareerJobList } from '../job/list';

// ----------------------------------------------------------------------

const CareerJobsView = () => {
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const fakeLoading = async () => {
			await new Promise((resolve) => {
				return setTimeout(resolve, 500);
			});
			setLoading(false);
		};

		fakeLoading();
	}, []);

	return (
		<MainLayout>
			<Container>
				{/* <CareerFilters /> */}
				{/* <Typography variant="h1">Hello</Typography> */}

				<CareerJobList jobs={_jobs} loading={loading} />
			</Container>

			{/* <NewsletterCareer /> */}
		</MainLayout>
	);
};

export default CareerJobsView;
