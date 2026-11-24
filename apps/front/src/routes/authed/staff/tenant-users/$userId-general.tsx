import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute, useBlocker } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { FormPageLayout } from '~/components/field';
import QueryDisplay from '~/components/query-display';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { preloadRouteQueries } from '~/lib/query/route-preload';
import {
	toGlobalTenantUserDetails,
	useGlobalTenantUserDetailsQuery,
} from '~/lib/query/staff-global-tenant-users';

import { tenantUserDetailsCrumbs } from './_crumbs';
import { TenantUserDetailsShell } from './_details-shell';
import {
	IdentityForm,
	useHydrateIdentity,
	useIdentitySubmit,
} from './_identity-edit-parts';
import { globalTenantUserQueries } from './_queries';

const getIdentitySchema = (t: (key: string) => string) =>
	z.object({
		firstName: z
			.string()
			.trim()
			.max(100, { message: t('firstname-too-long') }),
		lastName: z
			.string()
			.trim()
			.max(100, { message: t('lastname-too-long') }),
	});

type IdentityFormValues = z.infer<ReturnType<typeof getIdentitySchema>>;

const TenantUserGeneralTabPage = () => {
	const { userId } = Route.useParams();

	return (
		<TenantUserDetailsShell userId={userId} activeTab="general">
			<IdentityEditSection userId={userId} />
		</TenantUserDetailsShell>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/tenant-users/details/$userId/general',
)({
	staticData: {
		i18nNamespaces: ['common'],
		crumbs: tenantUserDetailsCrumbs,
	},
	loader: ({ context, params }) => {
		preloadRouteQueries(
			context.queryClient,
			globalTenantUserQueries({ userId: params.userId }),
		);
	},
	component: TenantUserGeneralTabPage,
});

const IdentityEditSection = ({ userId }: { userId: string }) => {
	const { t } = useTranslation('common');
	const schema = useMemo(() => getIdentitySchema(t), [t]);
	const methods = useForm<IdentityFormValues>({
		resolver: zodResolver(schema),
		defaultValues: { firstName: '', lastName: '' },
	});

	// Same key as the shell's query — served from cache, no second request.
	const queries = globalTenantUserQueries({ userId });
	const detailsQuery = useGlobalTenantUserDetailsQuery(
		queries.details.variables,
	);
	const user = useMemo(
		() => toGlobalTenantUserDetails(detailsQuery.data),
		[detailsQuery.data],
	);
	useHydrateIdentity({
		methods,
		userId,
		user,
		isSuccess: detailsQuery.isSuccess,
	});

	const { onSubmit, hasSaved, shouldLogout, isPending } = useIdentitySubmit(
		methods,
		userId,
	);
	const blocker = useBlocker({
		shouldBlockFn: () => methods.formState.isDirty && !hasSaved,
		withResolver: true,
	});

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	// The form is fed by the details payload: it only exists once the query has
	// one (the shell above already renders the loading/error states, and this
	// tab shares its cache key).
	return (
		<QueryDisplay query={detailsQuery}>
			{() => (
				<FormPageLayout data-testid="tenant-user-general-tab">
					<IdentityForm
						methods={methods}
						onSubmit={onSubmit}
						isPending={isPending}
						email={user?.email ?? ''}
					/>
					<ConfirmDialog
						isOpen={blocker.status === 'blocked'}
						title={t('unsaved-changes-dialog-title')}
						description={t('unsaved-changes-dialog-description')}
						confirmLabel={t('leave-page')}
						cancelLabel={t('cancel')}
						tone="danger"
						onConfirm={() => blocker.proceed?.()}
						onOpenChange={(isOpen) => {
							if (!isOpen) {
								blocker.reset?.();
							}
						}}
					/>
				</FormPageLayout>
			)}
		</QueryDisplay>
	);
};
