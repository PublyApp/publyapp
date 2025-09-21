import { Outlet } from 'react-router';
import { View500 } from '@/front/components/error';

const PageLayout = () => {
	return <Outlet />;
};

export default PageLayout;

export const ErrorBoundary = () => {
	return <View500 withLayout={false} />;
};
