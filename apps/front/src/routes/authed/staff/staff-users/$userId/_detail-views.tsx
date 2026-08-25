import { IconAlertCircle } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { buttonVariants } from '~/components/ui/button.variants';

export const StaffUserDetailsLoading = () => {
	const { t } = useTranslation(['staff-users', 'common']);

	return (
		<div className="mx-auto flex min-h-[50vh] w-full max-w-5xl items-center justify-center px-4 py-12">
			<div className="flex items-center gap-3 text-sm text-muted-foreground">
				<div className="h-2 w-2 rounded-full bg-primary" />
				<span>{t('loading-staff-user')}</span>
			</div>
		</div>
	);
};

export const StaffUserDetailsEmptyPayload = () => {
	const { t } = useTranslation(['staff-users', 'common']);

	return (
		<AppErrorView
			icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
			code={t('common:error-404-code')}
			title={t('staff-user-not-found-title')}
			description={t('staff-user-payload-empty')}
			testId="staff-user-details-empty"
			actions={
				<Link
					to="/staff/staff-users"
					className={buttonVariants({ variant: 'outline' })}
				>
					{t('back-to-staff-users')}
				</Link>
			}
		/>
	);
};
