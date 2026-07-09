import { IconLock } from '@tabler/icons-react';
import { Button } from '~/components/ui/button';

import { AppErrorView } from './AppErrorView';

export const View403 = () => {
	return (
		<AppErrorView
			icon={<IconLock aria-hidden="true" className="size-7" />}
			code="403 — Forbidden"
			title="You don't have access"
			description="Your account does not have permission to view this resource."
			testId="view-403"
			actions={
				<Button
					onClick={() => {
						window.location.assign('/');
					}}
				>
					Return home
				</Button>
			}
		/>
	);
};
