import { IconSearchOff } from '@tabler/icons-react';
import { Button } from '~/components/ui/button';

import { AppErrorView } from './AppErrorView';

export const View404 = () => {
	return (
		<AppErrorView
			icon={<IconSearchOff aria-hidden="true" className="size-7" />}
			code="404 — Not Found"
			title="Page not found"
			description="The page you requested does not exist."
			testId="view-404"
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
