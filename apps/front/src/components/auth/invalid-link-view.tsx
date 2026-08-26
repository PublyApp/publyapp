import { IconLinkOff } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '~/components/ui/button.variants';
import { StateView } from '~/components/ui/state-view';

type InvalidLinkViewProps = {
	/** One-line, context-specific reason (verify-email vs reset-password). */
	description: string;
	/**
	 * Primary CTA destination — the screen that can issue a fresh link. Omit
	 * for contexts where the recipient can't self-serve a new link (e.g. an
	 * invitation, which only a workspace admin can reissue) — "Back to login"
	 * then renders alone as the primary action.
	 */
	requestNewLinkHref?: string;
	/** Icon override — defaults to the dead-link glyph shared by verify-email/reset-password. */
	icon?: ReactNode;
	title?: string;
	testId?: string;
};

/**
 * Shared A6 "invalid or expired link" composition, reused by the verify-email
 * and reset-password token landings, and the accept-invitation invalid state.
 * Flat state-view family — no card, no backing disc (owner decision R3-1).
 */
export const InvalidLinkView = ({
	description,
	requestNewLinkHref,
	icon,
	title,
	testId = 'auth-invalid-link-view',
}: InvalidLinkViewProps) => {
	const { t } = useTranslation('common');

	return (
		<div data-testid={testId}>
			<StateView
				icon={icon ?? <IconLinkOff aria-hidden="true" className="size-7" />}
				tone="danger"
				scale="page"
				title={title ?? t('invalid-link-title')}
				description={description}
				actions={
					<>
						{requestNewLinkHref ? (
							<Link
								to={requestNewLinkHref}
								className={buttonVariants({ variant: 'default' })}
							>
								{t('request-a-new-link')}
							</Link>
						) : null}
						<Link
							to="/login"
							className={buttonVariants({
								variant: requestNewLinkHref ? 'outline' : 'default',
							})}
						>
							{t('back-to-login')}
						</Link>
					</>
				}
			/>
		</div>
	);
};
