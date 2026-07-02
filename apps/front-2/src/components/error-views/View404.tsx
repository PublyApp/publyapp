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
				<Button
					variant="primary"
					onPress={() => {
						window.location.assign('/');
					}}
				>
					Return home
				</Button>
			}
		/>
	);
};
