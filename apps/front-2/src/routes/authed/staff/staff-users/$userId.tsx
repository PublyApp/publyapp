import { IconAlertCircle, IconSearchOff } from '@tabler/icons-react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { View403 } from '~/components/error-views/View403';
import { Card } from '~/components/ui/card';
import {
	DetailRow,
	MetadataCard,
	PageHeader,
	StatusPill,
} from '~/components/ui/product-page';
import {
	toAssignedStaffProfiles,
	toStaffUserDetails,
	useStaffUserDetailsQuery,
	useStaffUserProfilesQuery,
} from '~/lib/query/staff-users';
import { shouldLogoutForFailure } from '~/routes/authed/layout';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

const MALFORMED_ID_TRANSLATION_KEY = 'malformed-id';
const DATE_TIME_FORMAT_OPTIONS = {
	dateStyle: 'medium',
	timeStyle: 'short',
} as const;

const formatDateTime = (
	value: Date | null | undefined,
	locale: string,
): string => {
	if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
		return '—';
	}

	return value.toLocaleString(locale, DATE_TIME_FORMAT_OPTIONS);
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

const getAssignedProfilesErrorDescription = (error: unknown): string => {
	if (isProblemStatus(error, 400, MALFORMED_ID_TRANSLATION_KEY)) {
		return getFailureDescription(
			error,
			'This staff user link is malformed or incomplete.',
		);
	}

	if (isProblemStatus(error, 403)) {
		return 'You do not have permission to view assigned profiles.';
	}

	if (isProblemStatus(error, 404)) {
		return getFailureDescription(
			error,
			'Assigned profiles are not available for this staff user.',
		);
	}

	return 'There was a problem loading assigned profiles.';
};

const AssignedProfilesSection = ({
	profilesQuery,
	profiles,
}: {
	profilesQuery: ReturnType<typeof useStaffUserProfilesQuery>;
	profiles: ReturnType<typeof toAssignedStaffProfiles>;
}) => {
	return (
		<Card
			id="staff-user-profiles"
			className="space-y-4 p-5"
			data-testid="staff-user-profiles-section"
		>
			<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
				<div className="space-y-1">
					<p className="text-lg font-semibold text-foreground">
						Assigned profiles
					</p>
					<p className="text-sm text-foreground-500">
						Read-only assigned profiles for this staff user.
					</p>
				</div>
				<div className="rounded-large border border-divider bg-content1 p-4">
					<p className="text-xs font-medium uppercase tracking-[0.2em] text-foreground-500">
						Assigned
					</p>
					<p className="mt-2 text-2xl font-semibold text-foreground">
						{profiles.length} assigned
					</p>
				</div>
			</div>

			{profilesQuery.isPending ? (
				<div
					className="flex items-center gap-3 rounded-large border border-divider bg-content1 p-4 text-sm text-foreground-500"
					data-testid="staff-user-profiles-loading"
				>
					<LoadingSpinner />
					<span>Loading assigned profiles…</span>
				</div>
			) : null}

			{profilesQuery.isError ? (
				<div
					className="rounded-large border border-divider bg-content1 p-4"
					data-testid="staff-user-profiles-error"
				>
					<p className="text-sm font-medium text-foreground">
						Unable to load assigned profiles
					</p>
					<p className="mt-2 text-sm text-foreground-500">
						{getAssignedProfilesErrorDescription(profilesQuery.error)}
					</p>
				</div>
			) : null}

			{!profilesQuery.isPending &&
			!profilesQuery.isError &&
			profiles.length === 0 ? (
				<div className="rounded-large border border-dashed border-divider bg-content1 p-4 text-sm text-foreground-500">
					This staff user does not have any assigned profiles.
				</div>
			) : null}

			{!profilesQuery.isPending &&
			!profilesQuery.isError &&
			profiles.length > 0 ? (
				<div className="space-y-3">
					{profiles.map((profile) => (
						<div
							key={profile.id}
							className="rounded-large border border-divider bg-content1 p-4"
						>
							<Link
								to="/staff/profiles/$profileId"
								params={{ profileId: profile.id }}
								className="font-medium text-foreground underline-offset-4 hover:underline"
							>
								{profile.name}
							</Link>
							<p className="mt-2 text-sm text-foreground-500">
								{profile.description ?? 'No description provided.'}
							</p>
						</div>
					))}
				</div>
			) : null}
		</Card>
	);
};

const LoadingSpinner = () => (
	<span
		role="status"
		aria-label="Loading"
		className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground"
	/>
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
		icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
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
		icon={<IconSearchOff aria-hidden="true" className="size-7" />}
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
			icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
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
	const profilesQuery = useStaffUserProfilesQuery(
		{ userId },
		{ enabled: userId.length > 0 },
	);

	if (
		(detailQuery.isError && shouldLogoutForFailure(detailQuery.error)) ||
		(profilesQuery.isError && shouldLogoutForFailure(profilesQuery.error))
	) {
		return <LogoutRedirect />;
	}

	if (detailQuery.isPending) {
		return <StaffUserDetailsLoading />;
	}

	if (detailQuery.isError) {
		return <StaffUserDetailsError error={detailQuery.error} />;
	}

	const details = toStaffUserDetails(detailQuery.data);
	const profiles = toAssignedStaffProfiles(profilesQuery.data);
	if (!details) {
		return (
			<AppErrorView
				icon={<IconSearchOff aria-hidden="true" className="size-7" />}
				code="404 — Not Found"
				title="Staff user not found"
				description="The staff user payload was empty."
				testId="staff-user-details-empty"
			/>
		);
	}

	return (
		<div className="space-y-4" data-testid="staff-user-details-page">
			<Link to="/staff/staff-users" className="publy-back-link">
				Back to staff users
			</Link>
			<PageHeader
				title={details.displayName}
				description={details.email || 'No email address'}
				actions={
					<StatusPill tone="primary">{details.status ?? '—'}</StatusPill>
				}
			/>
			<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
				<MetadataCard title="Account">
					<DetailRow label="Name" value={details.displayName} />
					<DetailRow
						label="Email"
						value={details.email || 'No email address'}
					/>
					<DetailRow label="Level" value={details.accountLevel ?? '—'} />
					<DetailRow label="Status" value={details.status ?? '—'} />
				</MetadataCard>
				<div className="space-y-4">
					<MetadataCard title="Activity">
						{details.createdAt ? (
							<DetailRow
								label="Created"
								value={formatDateTime(details.createdAt, i18n.language)}
							/>
						) : null}
						{details.updatedAt ? (
							<DetailRow
								label="Updated"
								value={formatDateTime(details.updatedAt, i18n.language)}
							/>
						) : null}
						{!details.createdAt && !details.updatedAt ? (
							<div className="rounded-large border border-divider bg-content1 p-4 text-sm text-foreground-500">
								No timestamps are available for this staff user yet.
							</div>
						) : null}
					</MetadataCard>
					<AssignedProfilesSection
						profilesQuery={profilesQuery}
						profiles={profiles}
					/>
				</div>
			</div>
		</div>
	);
}
