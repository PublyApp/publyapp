import { IconArrowRight, IconCircleCheck } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '~/components/ui/button.variants';
import { StateView } from '~/components/ui/state-view';

import { queryParamKey, queryParamValue } from '@org/shared-ts/lib/constants';

export const ResetPasswordSuccess = () => {
	const { t } = useTranslation(['auth', 'common']);

	return (
		<div data-testid="reset-password-success">
			<StateView
				scale="page"
				tone="info"
				icon={<IconCircleCheck aria-hidden="true" />}
				title={t('password-reset-title')}
				description={t('password-reset-success-description')}
				actions={
					<Link
						to="/login"
						search={{
							[queryParamKey.login_page.redirect_cause]:
								queryParamValue.login_page.redirect_cause
									.password_reset_success,
						}}
						className={buttonVariants({ variant: 'default' })}
					>
						{t('back-to-sign-in')}
						<IconArrowRight aria-hidden="true" className="size-4" />
					</Link>
				}
			/>
		</div>
	);
};
