import { type ReactNode } from 'react';

type Props = {
	children?: ReactNode;
	width?: 'full' | 'large' | 'boxed';
};

const DashboardContainer = ({ children, width = 'full' }: Props) => {
	console.log('width', width);
	return <div>{children}</div>;
};

export default DashboardContainer;
