import { Button } from '@heroui/react';
import { LockKeyhole } from 'lucide-react';

import { AppErrorView } from './AppErrorView';

export const View403 = () => {
	return (
		<AppErrorView
			icon={<LockKeyhole aria-hidden="true" className="size-7" />}
			code="403 — Forbidden"
			title="You don't have access"
			description="Your account does not have permission to view this resource."
			testId="view-403"
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
