import { type ReactNode } from 'react';

type Props = { children?: ReactNode };

const PageTitle = ({ children }: Props) => {
	return <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50 mb-6">{children}</h1>;
};

export default PageTitle;
