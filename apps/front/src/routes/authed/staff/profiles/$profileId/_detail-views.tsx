import { IconAlertCircle, IconSearchOff } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { View403 } from '~/components/error-views/View403';
import { Button } from '~/components/ui/button';
import { buttonVariants } from '~/components/ui/button.variants';
import { LoadingSpinner } from '~/components/ui/loading-spinner';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

// Extracted from the details route so the route file declares a single
// component (react-doctor `no-multi-component-file`).

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

const getFailureDescription = (
	failure: ReturnType<typeof toApiFailure>,
	fallback: string,
): string => {
	if (failure.kind === 'problem') {
		return failure.detail || fallback;
	}

	return fallback;
};

export const ProfileDetailsLoading = () => {
	const { t } = useTranslation('common');

	return (
		<div
			className="mx-auto flex min-h-[50vh] w-full items-center justify-center py-12"
			data-testid="staff-profile-details-loading"
		>
			<div className="flex items-center gap-3 text-sm text-muted-foreground">
				<LoadingSpinner />
				<span>{t('loading-staff-profile')}</span>
			</div>
		</div>
	);
};

const MissingProfileView = ({ error }: { error: unknown }) => {
	const { t } = useTranslation('common');
	const failure = toApiFailure(error);

	return (
		<AppErrorView
			icon={<IconSearchOff aria-hidden="true" className="size-7" />}
			code={t('error-404-code')}
			title={t('staff-profile-not-found')}
			description={getFailureDescription(
				failure,
				t('staff-profile-not-found-description'),
			)}
			testId="staff-profile-details-not-found"
			actions={
				<Link
					to="/staff/profiles"
					className={buttonVariants({ variant: 'outline' })}
				>
					{t('back-to-staff-profiles')}
				</Link>
			}
		/>
	);
};

export const ProfileDetailsError = ({
	error,
	onRetry,
}: {
	error: unknown;
	onRetry: () => void;
}) => {
	const { t } = useTranslation('common');

	if (
		isProblemStatus(error, 404) ||
		isProblemStatus(error, 400, MALFORMED_ID_TRANSLATION_KEY)
	) {
		return <MissingProfileView error={error} />;
	}

	if (isProblemStatus(error, 403)) {
		return <View403 />;
	}

	return (
		<AppErrorView
			icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
			code={t('error-500-code')}
			title={t('unable-to-load-staff-profile')}
			description={t('problem-loading-staff-profile-details')}
			testId="staff-profile-details-error"
			actions={
				<>
					<Button variant="default" onClick={onRetry} type="button">
						{t('try-again')}
					</Button>
					<Link
						to="/staff/profiles"
						className={buttonVariants({ variant: 'outline' })}
					>
						{t('back-to-staff-profiles')}
					</Link>
				</>
			}
		/>
	);
};
