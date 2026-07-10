import type { ReactNode } from 'react';
import { Card } from '~/components/ui/card';
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
	/** Wash/ring/glyph-tile color. Defaults to 'neutral' (e.g. 404/not-found). */
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
				'mx-auto flex w-full max-w-4xl items-center justify-center px-4',
				embedded ? 'min-h-[50vh] py-8' : 'min-h-screen py-12',
			)}
		>
			<Card className="w-full max-w-lg" data-testid={testId}>
				<div className="space-y-3 p-6 text-center">
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
							<span className="publy-state-icon-wash" />
							<span className="publy-state-icon-ring publy-state-icon-ring--outer" />
							<span className="publy-state-icon-ring publy-state-icon-ring--inner" />
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
					<h1 className="text-3xl font-semibold leading-tight">{title}</h1>
					{description ? (
						<p className="text-sm text-muted-foreground">{description}</p>
					) : null}
					{errorDetails ? (
						<div className="text-left text-sm text-muted-foreground">
							{errorDetails}
						</div>
					) : null}
				</div>
				{actions ? (
					<div className="w-full border-t border-border px-6 py-4">
						<div className="flex w-full justify-center gap-2">{actions}</div>
					</div>
				) : null}
				{diagnosticId ? (
					<div className="border-t border-border px-6 pb-5 pt-2 text-left text-xs text-muted-foreground">
						{diagnosticId}
					</div>
				) : null}
			</Card>
		</main>
	);
};
