import { type ReactNode } from 'react';

type Props = {
	children?: ReactNode;
	// width?: 'full' | 'large' | 'boxed';
};

const DashboardContainer = ({ children /* , width = 'full'  */ }: Props) => {
	return <div className="p-4 sm:px-6 sm:pb-10 sm:pt-10 lg:px-10 lg:pt-7">{children}</div>;
};

export default DashboardContainer;
