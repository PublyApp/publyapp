import { Container } from '@mantine/core';

import Header from './parts/Header';

type Props = {
	children: React.ReactNode;
};

const MarketingLayout = ({ children }: Props) => {
	return (
		<>
			<Header />
			<Container size="xl">{children}</Container>
		</>
	);
};

export default MarketingLayout;
