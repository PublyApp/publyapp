import { Button } from '@heroui/react';
import { AppErrorView } from './AppErrorView';

export const View404 = () => {
	return (
		<AppErrorView
			icon="🔎"
			code="404 — Not Found"
			title="Page not found"
			description="The page you requested does not exist."
			testId="view-404"
			actions={
				<Button as="a" href="/" color="primary" variant="solid">
					Return home
				</Button>
			}
		/>
	);
};
