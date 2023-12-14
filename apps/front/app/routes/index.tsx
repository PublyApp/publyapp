import { Outlet } from '@remix-run/react';

const IndexLayout = (props: any) => {
	console.log('😀😀😀', props);
	return (
		<div>
			index layout gere
			<Outlet />
		</div>
	);
};

export default IndexLayout;
