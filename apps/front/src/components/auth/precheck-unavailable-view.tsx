import { IconAlertCircle } from '@tabler/icons-react';
import { useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { StateView } from '~/components/ui/state-view';

/**
 * Shared by every anonymous token precheck (accept-invitation, verify-email,
 * reset-password): rendered when the precheck server function could not
 * reach the API (network blip, 5xx) — DISTINCT from the link actually being
 * invalid/expired (`InvalidLinkView`). Retrying re-runs the route loader,
 * which re-issues the precheck (users-auth-r6-F1).
 */
export const PrecheckUnavailableView = ({
	testId = 'auth-precheck-unavailable-view',
}: {
	testId?: string;
}) => {
	const { t } = useTranslation('common');
	const router = useRouter();

	return (
		<div data-testid={testId}>
			<StateView
				icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
				tone="danger"
				scale="page"
				title={t('auth-precheck-unavailable-title')}
				description={t('auth-precheck-unavailable-description')}
				actions={
					<Button
						type="button"
						variant="default"
						onClick={() => void router.invalidate()}
					>
						{t('try-again')}
					</Button>
				}
			/>
		</div>
	);
};
