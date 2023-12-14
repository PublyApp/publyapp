// import { Link, Typography } from '@mui/material';
import type { MetaFunction } from '@remix-run/node';

import AwesomeToolsView from '@/front/containers/awesomeTools/AwesomeToolsView';

// import { Link as RemixLink } from '@remix-run/react';

// https://remix.run/docs/en/main/route/meta
export const meta: MetaFunction = () => {
	return [{ title: 'Remix Starter' }, { name: 'description', content: 'Welcome to remix!' }];
};

// https://remix.run/docs/en/main/file-conventions/routes#basic-routes
const Index = () => {
	return (
		<>
			{/* <Typography variant="h4" component="h1" gutterBottom>
				Material UI Remix in TypeScript example
			</Typography>
			<Link to="/about" color="secondary" component={RemixLink}>
				Go to the about page
			</Link> */}
			{/* <p>lol</p> */}
			<AwesomeToolsView />
		</>
	);
};

export default Index;
