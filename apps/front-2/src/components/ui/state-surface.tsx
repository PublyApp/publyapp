import {
	IconAlertCircle,
	IconInbox,
	IconSearchOff,
	type TablerIcon,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { StateView } from '~/components/ui/state-view';

type StateSurfaceProps = {
	icon?: TablerIcon;
	tone?: 'danger' | 'neutral' | 'primary';
	title: string;
	description?: string;
	actions?: ReactNode;
	technicalIdentifier?: string;
	testId?: string;
};

export const StateSurface = ({
	icon: Icon = IconInbox,
	tone = 'neutral',
	title,
	description,
	actions,
	technicalIdentifier,
	testId,
}: StateSurfaceProps) => (
	<StateView
		icon={<Icon aria-hidden="true" />}
		tone={tone}
		scale="inline"
		title={title}
		belowTitle={
			technicalIdentifier ? (
				<p className="publy-state-technical-id">{technicalIdentifier}</p>
			) : null
		}
		description={description}
		actions={actions}
		testId={testId}
	/>
);

export const ErrorStateSurface = ({
	icon: Icon = IconAlertCircle,
	...props
}: Omit<StateSurfaceProps, 'tone'>) => (
	<StateSurface {...props} icon={Icon} tone="danger" />
);

export const NoMatchStateSurface = ({
	icon: Icon = IconSearchOff,
	...props
}: Omit<StateSurfaceProps, 'tone'>) => (
	<StateSurface {...props} icon={Icon} tone="primary" />
);
