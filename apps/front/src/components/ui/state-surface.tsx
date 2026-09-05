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
	/** Eyebrow line above the title (e.g. an error code). Omitted entirely
	 * when absent — the same omission rule the page-scale AppErrorView uses,
	 * so the inline and page scales read as the same family. */
	eyebrow?: string;
	title: string;
	description?: string;
	actions?: ReactNode;
	technicalIdentifier?: string;
	testId?: string;
};

export const StateSurface = ({
	icon: Icon = IconInbox,
	tone = 'neutral',
	eyebrow,
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
		eyebrow={eyebrow}
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
