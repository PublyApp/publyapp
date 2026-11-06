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
	tone?: 'info' | 'neutral' | 'warning' | 'danger' | 'primary';
	ariaLive?: 'polite' | 'assertive' | 'off';
	role?: 'alert' | 'status';
	title: string;
	description?: string;
	actions?: ReactNode;
	/** `empty` (the default) is the ShopKart OS empty-collection shape; the
	 * error surface is the same family, tinted by tone. */
	presentation?: 'status' | 'empty';
	testId?: string;
};

export const StateSurface = ({
	icon: Icon = IconInbox,
	tone = 'neutral',
	ariaLive,
	role,
	title,
	description,
	actions,
	presentation = 'empty',
	testId,
}: StateSurfaceProps) => (
	<StateView
		icon={<Icon aria-hidden="true" />}
		tone={tone}
		scale="inline"
		ariaLive={ariaLive}
		role={role ?? (presentation === 'empty' ? 'status' : undefined)}
		title={title}
		description={description}
		actions={actions}
		presentation={presentation}
		testId={testId}
	/>
);

export const ErrorStateSurface = ({
	icon: Icon = IconAlertCircle,
	tone = 'danger',
	ariaLive = 'assertive',
	role = 'alert',
	...props
}: StateSurfaceProps) => (
	<StateSurface
		{...props}
		ariaLive={ariaLive}
		role={role}
		icon={Icon}
		presentation="status"
		tone={tone}
	/>
);

export const NoMatchStateSurface = ({
	icon: Icon = IconSearchOff,
	...props
}: Omit<StateSurfaceProps, 'tone'>) => (
	<StateSurface {...props} icon={Icon} tone="neutral" />
);
