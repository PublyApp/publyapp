import type { ReactNode } from 'react';
import { Card } from '~/components/ui/card';

type AppErrorViewProps = {
	icon: ReactNode;
	title: string;
	code?: string;
	description?: string;
	actions?: ReactNode;
	errorDetails?: ReactNode;
	diagnosticId?: string;
	testId?: string;
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
}: AppErrorViewProps) => {
	return (
		<main className="mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-4 py-12">
			<Card className="w-full max-w-lg" data-testid={testId}>
				<div className="space-y-3 p-6 text-center">
					<div
						className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-border bg-muted text-3xl"
						aria-hidden="true"
					>
						{icon}
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
