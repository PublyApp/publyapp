import { ButtonGroup, Card, CardBody, CardFooter } from '@heroui/react';
import type { ReactNode } from 'react';

type AppErrorViewProps = {
	icon: string;
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
				<CardBody className="space-y-3 text-center">
					<div
						className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-divider bg-content1 text-3xl"
						aria-hidden="true"
					>
						{icon}
					</div>
					{code ? (
						<p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
							{code}
						</p>
					) : null}
					<h1 className="text-3xl font-semibold leading-tight">{title}</h1>
					{description ? (
						<p className="text-sm text-foreground-500">{description}</p>
					) : null}
					{errorDetails ? (
						<div className="text-left text-sm text-foreground-500">
							{errorDetails}
						</div>
					) : null}
				</CardBody>
				{actions ? (
					<CardFooter>
						<ButtonGroup
							className="w-full justify-center"
							orientation="horizontal"
						>
							{actions}
						</ButtonGroup>
					</CardFooter>
				) : null}
				{diagnosticId ? (
					<div className="border-t border-divider px-6 pb-5 pt-2 text-left text-xs text-foreground-400">
						{diagnosticId}
					</div>
				) : null}
			</Card>
		</main>
	);
};
