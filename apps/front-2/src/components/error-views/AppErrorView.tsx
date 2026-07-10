import type { ReactNode } from 'react';
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
	/** Icon/ghost-numeral tint. Defaults to 'neutral' (e.g. 404/not-found). */
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
}: AppErrorViewProps) => {
	const ghostNumeral = code?.match(/^\d+/)?.[0];

	return (
		<main
			className={cn(
				'mx-auto flex w-full max-w-lg flex-col items-center px-4 text-center',
				embedded
					? 'min-h-[50vh] justify-center py-8'
					: 'min-h-screen justify-center py-16',
			)}
			data-testid={testId}
		>
			<div className="publy-error-hero">
				{ghostNumeral ? (
					<span className="publy-error-ghost-numeral" aria-hidden="true">
						{ghostNumeral}
					</span>
				) : null}
				<div
					className="publy-state-icon-cluster"
					data-tone={tone}
					aria-hidden="true"
				>
					<div className="publy-state-icon" data-tone={tone}>
						{icon}
					</div>
				</div>
			</div>
			{code ? (
				<p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
					{code}
				</p>
			) : null}
			<h1 className="mt-3 text-3xl font-semibold leading-tight">{title}</h1>
			{description ? (
				<p className="mt-2 text-sm text-muted-foreground">{description}</p>
			) : null}
			{errorDetails ? (
				<div className="mt-3 w-full text-left text-sm text-muted-foreground">
					{errorDetails}
				</div>
			) : null}
			{actions ? (
				<div className="mt-8 w-full border-t border-border pt-6">
					<div className="flex w-full flex-wrap justify-center gap-2">
						{actions}
					</div>
				</div>
			) : null}
			{diagnosticId ? (
				<div className="mt-3 w-full border-t border-border pt-3 text-left text-xs text-muted-foreground">
					{diagnosticId}
				</div>
			) : null}
		</main>
	);
};
