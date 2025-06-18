import { View500 } from '@/front/components/error';
import { Outlet } from 'react-router';

const PageLayout = () => {
	return <Outlet />;
};

export default PageLayout;

export const ErrorBoundary = () => {
	return <View500 withLayout={false} />;
};
