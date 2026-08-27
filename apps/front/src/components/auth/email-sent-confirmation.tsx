import { IconArrowRight, IconMailCheck } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '~/components/ui/button.variants';

type EmailSentConfirmationProps = {
	title: string;
	description: ReactNode;
	hint?: string;
	testId?: string;
};

/**
 * Centered "check your email" confirmation shared by the verify-email sent
 * state (A3) and the reset-password request-sent state (A4) — same accent
 * icon-cluster + copy shape, different title/description per context.
 */
export const EmailSentConfirmation = ({
	title,
	description,
	hint,
	testId,
}: EmailSentConfirmationProps) => {
	const { t } = useTranslation('common');

	return (
		<div className="space-y-6 text-center" data-testid={testId}>
			<div
				className="publy-state-icon-cluster mx-auto"
				data-tone="primary"
				aria-hidden="true"
			>
				<div className="publy-state-icon" data-tone="primary">
					<IconMailCheck aria-hidden="true" className="size-7" />
				</div>
			</div>
			<div className="space-y-2">
				<h1 className="text-2xl font-semibold tracking-[-0.01em] text-foreground">
					{title}
				</h1>
				<p className="text-sm text-muted-foreground">{description}</p>
				{hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
			</div>
			<Link to="/" className={buttonVariants({ variant: 'default' })}>
				{t('go-to-home')}
				<IconArrowRight aria-hidden="true" className="size-4" />
			</Link>
		</div>
	);
};
