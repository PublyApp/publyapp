import { ReactNode } from 'react';

import HeaderOne from '../header/HeaderOne';

type Props = {
	children: ReactNode;
};

const DefaultLayout = ({ children }: Props) => {
	return (
		<>
			<HeaderOne />
			{children}
		</>
	);
};

export default DefaultLayout;
