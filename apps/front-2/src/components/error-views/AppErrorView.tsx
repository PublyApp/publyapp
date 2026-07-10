import type { ReactNode } from 'react';
import { StateView } from '~/components/ui/state-view';
import { cn } from '~/lib/utils';

type AppErrorViewProps = {
	icon: ReactNode;
	title: string;
	code?: string;
	description?: string;
	actions?: ReactNode;
	errorDetails?: ReactNode;
	diagnosticId?: string;
	testId?: string;
	/** Icon tint. Defaults to 'neutral' (e.g. 404/not-found). */
	tone?: 'neutral' | 'danger';
	/** Renders inside an existing page shell instead of a full-viewport main. */
	embedded?: boolean;
};

export const AppErrorView = ({
	icon,
	title,
	code,
	description,
	actions,
	errorDetails,
	diagnosticId,
	testId,
	tone = 'neutral',
	embedded = false,
}: AppErrorViewProps) => (
	<main
		className={cn(
			'mx-auto flex w-full max-w-lg flex-col items-center px-4 text-center',
			embedded
				? 'min-h-[50vh] justify-center py-8'
				: 'min-h-screen justify-center py-16',
		)}
		data-testid={testId}
	>
		<StateView
			icon={icon}
			tone={tone}
			scale="page"
			eyebrow={code}
			title={title}
			description={description}
			beforeActions={
				errorDetails ? (
					<div className="mt-3 w-full text-left text-sm text-muted-foreground">
						{errorDetails}
					</div>
				) : null
			}
			actions={actions}
			afterActions={
				diagnosticId ? (
					<div className="mt-3 w-full text-left text-xs text-muted-foreground">
						{diagnosticId}
					</div>
				) : null
			}
		/>
	</main>
);
