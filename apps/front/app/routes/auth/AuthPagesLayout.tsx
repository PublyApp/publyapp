import { Flex } from '@mantine/core';
import { Outlet } from 'react-router';

const AuthPagesLayout = () => {
	return (
		<Flex h="100vh" justify="center" align="center">
			<Outlet />
		</Flex>
	);
};

export default AuthPagesLayout;
