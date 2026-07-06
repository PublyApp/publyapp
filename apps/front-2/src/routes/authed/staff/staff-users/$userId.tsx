import { Card } from '@heroui/react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { View403 } from '~/components/error-views/View403';
import {
	toStaffUserDetails,
	useStaffUserDetailsQuery,
} from '~/lib/query/staff-users';
import { shouldLogoutForFailure } from '~/routes/authed/layout';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

const MALFORMED_ID_TRANSLATION_KEY = 'malformed-id';

const formatDateTime = (
	value: Date | null | undefined,
	locale: string,
): string => {
	if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
		return '—';
	}

	return new Intl.DateTimeFormat(locale, {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(value);
};

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

const DetailItem = ({ label, value }: { label: string; value: string }) => (
	<div className="rounded-large border border-divider bg-content1 p-4">
		<p className="text-xs font-medium uppercase tracking-[0.2em] text-foreground-500">
			{label}
		</p>
		<p className="mt-2 text-sm font-medium text-foreground">{value}</p>
	</div>
);

const StaffUserDetailsLoading = () => (
	<div
		className="mx-auto flex min-h-[50vh] w-full max-w-5xl items-center justify-center px-4 py-12"
		data-testid="staff-user-details-loading"
	>
		<div className="flex items-center gap-3 text-sm text-foreground-500">
			<div className="h-2 w-2 rounded-full bg-primary" />
			<span>Loading staff user…</span>
		</div>
	</div>
);

const InvalidStaffUserView = ({ error }: { error: unknown }) => (
	<AppErrorView
		icon="!"
		code="400 — Bad Request"
		title="Invalid staff user link"
		description={getFailureDescription(
			error,
			'This staff user link is malformed or incomplete.',
		)}
		testId="staff-user-details-invalid"
	/>
);

const MissingStaffUserView = ({ error }: { error: unknown }) => (
	<AppErrorView
		icon="🔎"
		code="404 — Not Found"
		title="Staff user not found"
		description={getFailureDescription(
			error,
			'The requested staff user does not exist or is no longer available.',
		)}
		testId="staff-user-details-not-found"
	/>
);

const StaffUserDetailsError = ({ error }: { error: unknown }) => {
	if (isProblemStatus(error, 400, MALFORMED_ID_TRANSLATION_KEY)) {
		return <InvalidStaffUserView error={error} />;
	}

	if (isProblemStatus(error, 403)) {
		return <View403 />;
	}

	if (isProblemStatus(error, 404)) {
		return <MissingStaffUserView error={error} />;
	}

	return (
		<AppErrorView
			icon="!"
			code="500 — Server Error"
			title="Unable to load this staff user"
			description="There was a problem loading the staff user details."
			testId="staff-user-details-error"
		/>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/staff-users/$userId',
)({
	component: StaffUserDetailsPage,
});

function StaffUserDetailsPage() {
	const { userId } = Route.useParams();
	const { i18n } = useTranslation('common');

	const detailQuery = useStaffUserDetailsQuery(
		{ userId },
		{ enabled: userId.length > 0 },
	);

	if (detailQuery.isError && shouldLogoutForFailure(detailQuery.error)) {
		return <LogoutRedirect />;
	}

	if (detailQuery.isPending) {
		return <StaffUserDetailsLoading />;
	}

	if (detailQuery.isError) {
		return <StaffUserDetailsError error={detailQuery.error} />;
	}

	const details = toStaffUserDetails(detailQuery.data);
	if (!details) {
		return (
			<AppErrorView
				icon="🔎"
				code="404 — Not Found"
				title="Staff user not found"
				description="The staff user payload was empty."
				testId="staff-user-details-empty"
			/>
		);
	}

	return (
		<div
			className="mx-auto w-full max-w-5xl space-y-6 p-4"
			data-testid="staff-user-details-page"
		>
			<div className="space-y-4">
				<div className="space-y-2">
					<Link
						to="/staff/staff-users"
						className="text-sm text-foreground-500 underline-offset-4 hover:text-foreground hover:underline"
					>
						Back to staff users
					</Link>
					<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
						<div className="space-y-2">
							<p className="text-xs font-medium uppercase tracking-[0.2em] text-foreground-500">
								Staff user
							</p>
							<h1 className="text-3xl font-semibold tracking-tight text-foreground">
								{details.displayName}
							</h1>
							<p className="max-w-2xl text-sm text-foreground-500">
								{details.email || 'No email address available.'}
							</p>
						</div>
					</div>
				</div>

				<nav
					aria-label="Staff user sections"
					className="flex flex-wrap gap-2 border-b border-divider pb-2"
				>
					<span className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
						Basics
					</span>
					<span
						aria-disabled="true"
						className="rounded-full border border-divider px-4 py-2 text-sm text-foreground-500 opacity-70"
					>
						Profiles
					</span>
				</nav>
			</div>

			<div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
				<Card className="space-y-4 p-5">
					<div className="space-y-1">
						<p className="text-lg font-semibold text-foreground">Basics</p>
						<p className="text-sm text-foreground-500">
							Read-only staff account details for this user.
						</p>
					</div>

					<div className="grid gap-4 md:grid-cols-2">
						<DetailItem
							label="Email"
							value={details.email || 'No email address'}
						/>
						<DetailItem
							label="Account level"
							value={details.accountLevel ?? '—'}
						/>
						<DetailItem label="Status" value={details.status ?? '—'} />
						<DetailItem label="User ID" value={details.id} />
					</div>
				</Card>

				<Card className="space-y-4 p-5">
					<div className="space-y-1">
						<p className="text-lg font-semibold text-foreground">Activity</p>
						<p className="text-sm text-foreground-500">
							Lifecycle timestamps from the staff user record.
						</p>
					</div>

					<div className="grid gap-4">
						{details.createdAt ? (
							<DetailItem
								label="Created"
								value={formatDateTime(details.createdAt, i18n.language)}
							/>
						) : null}
						{details.updatedAt ? (
							<DetailItem
								label="Updated"
								value={formatDateTime(details.updatedAt, i18n.language)}
							/>
						) : null}
						{!details.createdAt && !details.updatedAt ? (
							<div className="rounded-large border border-divider bg-content1 p-4 text-sm text-foreground-500">
								No timestamps are available for this staff user yet.
							</div>
						) : null}
					</div>
				</Card>
			</div>
		</div>
	);
}
