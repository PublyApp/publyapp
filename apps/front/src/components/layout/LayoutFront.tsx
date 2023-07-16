import { ReactNode } from 'react';

import DefaultLayoutFront from './DefaultLayoutFront';

type Props = {
	children: ReactNode;
};

const LayoutFront = ({ children }: Props) => {
	return <DefaultLayoutFront>{children}</DefaultLayoutFront>;
};

export default LayoutFront;
