import { IconAlertCircle } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { View403 } from '~/components/error-views/View403';
import { Button } from '~/components/ui/button';
import { buttonVariants } from '~/components/ui/button.variants';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

const MALFORMED_ID_TRANSLATION_KEY = 'malformed-id';

const isProblemStatus = (
	error: unknown,
	status: number,
	translationKey?: string,
): boolean => {
	const failure = toApiFailure(error);

	if (failure.kind !== 'problem' || failure.status !== status) {
		return false;
	}

	return (
		translationKey === undefined || failure.translationKey === translationKey
	);
};

const getFailureDescription = (error: unknown, fallback: string): string => {
	const failure = toApiFailure(error);

	if (failure.kind === 'problem' && failure.detail) {
		return failure.detail;
	}

	return fallback;
};

/** Error branches of the staff user details page: not-found / malformed id,
 * forbidden, and generic load failure. Extracted so the route component
 * stays under the giant-component threshold. */
export const StaffUserErrorViews = ({
	error,
	onRetry,
}: {
	error: unknown;
	onRetry: () => void;
}) => {
	const { t } = useTranslation(['staff-users', 'common']);

	if (
		isProblemStatus(error, 404) ||
		isProblemStatus(error, 400, MALFORMED_ID_TRANSLATION_KEY)
	) {
		return (
			<AppErrorView
				icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
				code={t('common:error-404-code')}
				title={t('staff-user-not-found-title')}
				description={getFailureDescription(
					error,
					t('staff-user-not-found-description'),
				)}
				testId="staff-user-details-not-found"
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
	}

	if (isProblemStatus(error, 403)) {
		return <View403 />;
	}

	return (
		<AppErrorView
			icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
			code={t('common:error-500-code')}
			title={t('unable-to-load-staff-user')}
			description={t('problem-loading-staff-user-details')}
			testId="staff-user-details-error"
			actions={
				<>
					<Button variant="default" onClick={() => onRetry()} type="button">
						{t('common:try-again')}
					</Button>
					<Link
						to="/staff/staff-users"
						className={buttonVariants({ variant: 'outline' })}
					>
						{t('back-to-staff-users')}
					</Link>
				</>
			}
		/>
	);
};
