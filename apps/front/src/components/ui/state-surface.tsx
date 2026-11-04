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
	/** Eyebrow line above the title (e.g. an error code). Omitted entirely
	 * when absent — the same omission rule the page-scale AppErrorView uses,
	 * so the inline and page scales read as the same family. */
	eyebrow?: string;
	title: string;
	description?: string;
	actions?: ReactNode;
	technicalIdentifier?: string;
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
	eyebrow,
	title,
	description,
	actions,
	technicalIdentifier,
	presentation = 'empty',
	testId,
}: StateSurfaceProps) => (
	<StateView
		icon={<Icon aria-hidden="true" />}
		tone={tone}
		scale="inline"
		ariaLive={ariaLive}
		role={role}
		eyebrow={eyebrow}
		title={title}
		belowTitle={
			technicalIdentifier ? (
				<p className="publy-state-technical-id">{technicalIdentifier}</p>
			) : null
		}
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
