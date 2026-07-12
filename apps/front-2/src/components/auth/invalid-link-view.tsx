import { IconLinkOff } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '~/components/ui/button';
import { StateView } from '~/components/ui/state-view';

type InvalidLinkViewProps = {
	/** One-line, context-specific reason (verify-email vs reset-password). */
	description: string;
	/** Primary CTA destination — the screen that can issue a fresh link. */
	requestNewLinkHref: string;
	testId?: string;
};

/**
 * Shared A6 "invalid or expired link" composition, reused by the verify-email
 * and reset-password token landings (and accept-invitation next packet).
 * Flat state-view family — no card, no backing disc (owner decision R3-1).
 */
export const InvalidLinkView = ({
	description,
	requestNewLinkHref,
	testId = 'auth-invalid-link-view',
}: InvalidLinkViewProps) => {
	const { t } = useTranslation('common');

	return (
		<div data-testid={testId}>
			<StateView
				icon={<IconLinkOff aria-hidden="true" className="size-7" />}
				tone="danger"
				scale="page"
				title={t('invalid-link-title')}
				description={description}
				actions={
					<>
						<Link
							to={requestNewLinkHref}
							className={buttonVariants({ variant: 'default' })}
						>
							{t('request-a-new-link')}
						</Link>
						<Link
							to="/login"
							className={buttonVariants({ variant: 'outline' })}
						>
							{t('back-to-login')}
						</Link>
					</>
				}
			/>
		</div>
	);
};

export default InvalidLinkView;
