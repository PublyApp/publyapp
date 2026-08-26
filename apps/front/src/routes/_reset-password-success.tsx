import { IconCircleCheck, IconArrowRight } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '~/components/ui/button.variants';

import { queryParamKey, queryParamValue } from '@org/shared-ts/lib/constants';

export const ResetPasswordSuccess = () => {
	const { t } = useTranslation(['auth', 'common']);

	return (
		<div className="space-y-6 text-center" data-testid="reset-password-success">
			<div
				className="publy-state-icon-cluster mx-auto"
				data-tone="primary"
				aria-hidden="true"
			>
				<div className="publy-state-icon" data-tone="primary">
					<IconCircleCheck aria-hidden="true" className="size-7" />
				</div>
			</div>
			<div className="space-y-2">
				<h1 className="text-2xl font-semibold tracking-[-0.01em] text-foreground">
					{t('password-reset-title')}
				</h1>
				<p className="text-sm text-muted-foreground">
					{t('password-reset-success-description')}
				</p>
			</div>
			<Link
				to="/login"
				search={{
					[queryParamKey.login_page.redirect_cause]:
						queryParamValue.login_page.redirect_cause.password_reset_success,
				}}
				className={buttonVariants({ variant: 'default' })}
			>
				{t('back-to-sign-in')}
				<IconArrowRight aria-hidden="true" className="size-4" />
			</Link>
		</div>
	);
};
