import { IconArrowRight, IconMailCheck } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '~/components/ui/button.variants';
import { StateView } from '~/components/ui/state-view';

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
		<div data-testid={testId}>
			<StateView
				scale="page"
				tone="info"
				icon={<IconMailCheck aria-hidden="true" />}
				title={title}
				description={description}
				beforeActions={
					hint ? (
						<p className="mt-1 text-xs text-muted-foreground">{hint}</p>
					) : null
				}
				actions={
					<Link to="/" className={buttonVariants({ variant: 'default' })}>
						{t('go-to-home')}
						<IconArrowRight aria-hidden="true" className="size-4" />
					</Link>
				}
			/>
		</div>
	);
};
