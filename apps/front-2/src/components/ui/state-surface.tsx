import {
	IconAlertCircle,
	IconInbox,
	IconSearchOff,
	type TablerIcon,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';

type StateSurfaceProps = {
	icon?: TablerIcon;
	title: string;
	description?: string;
	actions?: ReactNode;
	testId?: string;
};

export const StateSurface = ({
	icon: Icon = IconInbox,
	title,
	description,
	actions,
	testId,
}: StateSurfaceProps) => (
	<div className="publy-state-surface" data-testid={testId}>
		<div className="publy-state-icon">
			<Icon aria-hidden="true" className="size-5" />
		</div>
		<div>
			<div className="publy-type-section-title">{title}</div>
			{description ? (
				<p className="publy-type-helper mt-1">{description}</p>
			) : null}
		</div>
		{actions ? <div className="publy-action-cluster">{actions}</div> : null}
	</div>
);

export const ErrorStateSurface = (props: Omit<StateSurfaceProps, 'icon'>) => (
	<StateSurface {...props} icon={IconAlertCircle} />
);

export const NoMatchStateSurface = (props: Omit<StateSurfaceProps, 'icon'>) => (
	<StateSurface {...props} icon={IconSearchOff} />
);
