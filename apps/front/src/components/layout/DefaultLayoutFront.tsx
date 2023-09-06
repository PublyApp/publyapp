import { ReactNode } from 'react';

import HeaderOne from '../HeaderOne';

type Props = {
	children: ReactNode;
};

const DefaultLayoutFront = ({ children }: Props) => {
	return (
		<>
			<HeaderOne />
			{children}
		</>
	);
};

export default DefaultLayoutFront;
