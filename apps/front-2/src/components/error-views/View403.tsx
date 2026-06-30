import { Button } from '@heroui/react';

import { AppErrorView } from './AppErrorView';

export const View403 = () => {
	return (
		<AppErrorView
			icon="⛔"
			code="403 — Forbidden"
			title="You don't have access"
			description="Your account does not have permission to view this resource."
			testId="view-403"
			actions={
				<Button as="a" href="/" color="primary" variant="solid">
					Return home
				</Button>
			}
		/>
	);
};
