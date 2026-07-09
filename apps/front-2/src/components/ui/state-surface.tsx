import {
	IconAlertCircle,
	IconInbox,
	IconSearchOff,
	type TablerIcon,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';

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
	<div className="publy-state-surface" data-tone={tone} data-testid={testId}>
		<div className="publy-state-icon" data-tone={tone}>
			<Icon aria-hidden="true" className="publy-state-icon-glyph" />
		</div>
		<div>
			<div className="publy-type-section-title">{title}</div>
			{technicalIdentifier ? (
				<p className="publy-state-technical-id">{technicalIdentifier}</p>
			) : null}
			{description ? (
				<p className="publy-type-helper mt-1">{description}</p>
			) : null}
		</div>
		{actions ? <div className="publy-action-cluster">{actions}</div> : null}
	</div>
);

export const ErrorStateSurface = (
	props: Omit<StateSurfaceProps, 'icon' | 'tone'>,
) => <StateSurface {...props} icon={IconAlertCircle} tone="danger" />;

export const NoMatchStateSurface = (
	props: Omit<StateSurfaceProps, 'icon' | 'tone'>,
) => <StateSurface {...props} icon={IconSearchOff} tone="neutral" />;
