// import { useState, useEffect } from 'react';
import { Container } from '@mui/material';

// import useFakeLoading from '@devist/ui-react/hooks/useFakeLoading';

// import { _jobs } from '@/front/_mock';

import AwesomeToolsList from './AwesomeToolsList';

//
// import NewsletterCareer from '../../newsletter/career';
// import CareerFilters from '../job/filters';
// import { CareerJobList } from '../job/list';

// ----------------------------------------------------------------------

const AwesomeToolsView = () => {
	// const [loading, setLoading] = useState(true);

	// useEffect(() => {
	//   const fakeLoading = async () => {
	//     await new Promise((resolve) => setTimeout(resolve, 500));
	//     setLoading(false);
	//   };
	//   fakeLoading();
	// }, []);
	// const loading = useFakeLoading();

	return (
		<>
			<Container>
				{/* <CareerFilters /> */}

				<AwesomeToolsList /* jobs={_jobs} loading={loading} */ />
			</Container>

			{/* <NewsletterCareer /> */}
		</>
	);
};

export default AwesomeToolsView;
