import { IconArrowLeft } from '@tabler/icons-react';
import { createFileRoute, Link, useBlocker } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import QueryDisplay, {
	type QueryDisplayQuery,
} from '~/components/query-display';
import { Card } from '~/components/ui/card';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
	DetailAside,
	DetailGrid,
	DetailMain,
} from '~/components/ui/detail-layout';
import { preloadRouteQueries } from '~/lib/query/route-preload';
import {
	staffRoleUsersQueryOptions,
	useStaffRoleUsersQuery,
	toStaffRoleUserRows,
} from '~/lib/query/staff-role-users';
import {
	selectStaffRoleCrumbName,
	staffPermissionCatalogQueryOptions,
	staffRoleCrumbQuery,
	staffRoleDetailsQueryOptions,
	staffRolePermissionKeysQueryOptions,
	type StaffPermissionCatalog,
	toStaffRoleDetails,
	useStaffPermissionCatalogQuery,
	useStaffRoleDetailsQuery,
	useStaffRolePermissionKeysQuery,
} from '~/lib/query/staff-roles';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { StaffRoleAboutCard } from './$roleId/_about-card';
import { RoleDetailsError, RoleDetailsLoading } from './$roleId/_detail-views';
import { StaffRoleIdentityHeader } from './$roleId/_identity-header';
import { renderStaffRoleMembersCard } from './$roleId/_members-card-content';
import { StaffRoleNotFound } from './$roleId/_not-found';
import { StaffRolePermissionsCardBody } from './$roleId/_permissions-card-body';
import { StaffRoleEditDetailsDrawer } from './$roleId/_role-edit-details-drawer';

/** Search state for the staff-role detail page (#819): the edit drawer's
 * open flag, mirroring the tenant role detail layout's `?edit=1`. */
type StaffRoleDetailsSearchParams = {
	edit?: 1;
};

/** The flag round-trips as the NUMBER 1; a raw string "1" is accepted, and
 * anything else drops the key instead of persisting a default. */
const parseStaffRoleDetailsSearchParams = (
	search: Record<string, unknown>,
): StaffRoleDetailsSearchParams => ({
	edit:
		search.edit === 1 ||
		(typeof search.edit === 'string' && search.edit.trim() === '1')
			? 1
			: undefined,
});

/** The page's four queries, declared once: the loader warms them and the page
 * reads the same variables. */
const staffRoleQueries = ({
	roleId,
	locale,
}: {
	roleId: string;
	locale: string;
}) => ({
	roleDetails: {
		options: staffRoleDetailsQueryOptions,
		variables: { roleId },
	},
	permissionKeys: {
		options: staffRolePermissionKeysQueryOptions,
		variables: { roleId },
	},
	permissionCatalog: {
		options: staffPermissionCatalogQueryOptions,
		variables: { language: locale },
	},
	users: {
		options: staffRoleUsersQueryOptions,
		variables: { roleId, size: 5 },
	},
});

const StaffRoleDetailsPage = () => {
	const { roleId } = Route.useParams();
	const navigate = Route.useNavigate();
	const search = Route.useSearch();
	const { t, i18n } = useTranslation('common');

	const queries = staffRoleQueries({ roleId, locale: i18n.language });
	const detailQuery = useStaffRoleDetailsQuery(queries.roleDetails.variables);
	const permissionKeysQuery = useStaffRolePermissionKeysQuery(
		queries.permissionKeys.variables,
	);
	const permissionCatalogQuery = useStaffPermissionCatalogQuery(
		queries.permissionCatalog.variables,
	);
	const usersQuery = useStaffRoleUsersQuery(queries.users.variables);
	// Mapped before the early returns so the system-role guard below can read
	// the loaded role without mapping it twice.
	const details = toStaffRoleDetails(detailQuery.data);

	// #819 — the edit drawer's open flag lives in the URL (`?edit=1`), the way
	// the tenant role detail page hosts its own drawer.
	const [isEditFormDirty, setIsEditFormDirty] = useState(false);
	const [shouldRedirectToLogout, setShouldRedirectToLogout] = useState(false);
	// An app-initiated close/save navigation is the page closing its OWN
	// drawer; the guard below must never block that transition even while the
	// drawer's dirty flag is being flushed asynchronously (W8-DRAWER).
	const editDrawerNavBypassRef = useRef(false);
	// The seeded full-access system role has no editable state, so `?edit=1`
	// is not a view state this page can honour: the flag must not open the
	// drawer even for one frame while it is being canonicalized away below.
	const isSystemRole = details?.isFullAccess === true;
	const isEditDrawerOpen = search.edit === 1 && !isSystemRole;
	const setEditDrawerOpen = (isOpen: boolean): void => {
		// Opening re-arms the guard for the new draft; every close here is
		// either a clean close or an already-confirmed discard/save.
		editDrawerNavBypassRef.current = !isOpen;
		void navigate({
			search: (
				previous: StaffRoleDetailsSearchParams,
			): StaffRoleDetailsSearchParams => ({
				...previous,
				edit: isOpen ? 1 : undefined,
			}),
			replace: true,
		});
	};

	// A deep link to the system role's edit drawer is an impossible state:
	// canonicalize the flag away at the router boundary, the way the tenant
	// role page does. The drawer's open state is already derived above, so
	// nothing opens while the flag is being cleared. `replace` keeps Back
	// from bouncing through the canonicalized entry.
	const clearEditFlag = useCallback((): void => {
		void navigate({
			search: (
				previous: StaffRoleDetailsSearchParams,
			): StaffRoleDetailsSearchParams => ({
				...previous,
				edit: undefined,
			}),
			replace: true,
		});
	}, [navigate]);

	useEffect(() => {
		if (!isSystemRole || search.edit !== 1) {
			return;
		}
		clearEditFlag();
	}, [clearEditFlag, isSystemRole, search.edit]);

	// Only an OPEN drawer holding a DIRTY draft is work the user can lose; the
	// bypass ref keeps the app's own close/save transition unblocked.
	const hasUnsavedWork = isEditDrawerOpen && isEditFormDirty;
	const editDrawerBlocker = useBlocker({
		enableBeforeUnload: hasUnsavedWork,
		shouldBlockFn: () =>
			isEditDrawerOpen && isEditFormDirty && !editDrawerNavBypassRef.current,
		withResolver: true,
	});

	if (shouldRedirectToLogout) {
		return <LogoutRedirect />;
	}

	// Hoisted so the fatal-error gates read plain locals, not query flags.
	const detailError = detailQuery.error;
	if (detailError !== null && shouldLogoutForFailure(detailError)) {
		return <LogoutRedirect />;
	}

	const permissionKeysError = permissionKeysQuery.error;
	if (
		permissionKeysError !== null &&
		shouldLogoutForFailure(permissionKeysError)
	) {
		return <LogoutRedirect />;
	}

	const permissionCatalogError = permissionCatalogQuery.error;
	if (
		permissionCatalogError !== null &&
		shouldLogoutForFailure(permissionCatalogError)
	) {
		return <LogoutRedirect />;
	}

	const usersError = usersQuery.error;
	if (usersError !== null && shouldLogoutForFailure(usersError)) {
		return <LogoutRedirect />;
	}

	const assignedKeys = permissionKeysQuery.data?.permissionKeys ?? [];
	const catalog = (permissionCatalogQuery.data?.additionalData ?? undefined) as
		| StaffPermissionCatalog
		| undefined;
	// The catalog is optional: an absent payload is a loaded page with no
	// catalogue to show, not a missing one. The sentinel keeps `QueryDisplay`
	// out of its empty branch, which the hand-written ladder never entered.
	// #2341 M1: the catalog only feeds the optional "N of M" count, so while
	// it is pending it must gate nothing — keep the derived view out of the
	// pending branch so the whole page renders as soon as detail + keys are
	// loaded. Only an error still swaps in RoleDetailsError.
	const catalogStateQuery: QueryDisplayQuery = {
		...permissionCatalogQuery,
		isPending: false,
		data: permissionCatalogQuery.data ?? {},
	};
	const userRows = toStaffRoleUserRows(usersQuery.data?.users);
	const userCount = details?.userAccountCount ?? null;
	const membersCardContent = renderStaffRoleMembersCard({
		t,
		query: usersQuery,
		userRows,
	});

	let catalogPermCount = 0;
	if (catalog) {
		for (const module of Object.values(catalog)) {
			catalogPermCount += Object.keys(module).length;
		}
	}

	// Full access is implicit: no "N of M granted" count to show.
	let permissionsCountLabel: string | number = assignedKeys.length;
	if (details?.isFullAccess === true) {
		permissionsCountLabel = t('full-access');
	} else if (catalogPermCount > 0) {
		permissionsCountLabel = t('permissions-of-total-granted', {
			count: assignedKeys.length,
			total: catalogPermCount,
		});
	}

	return (
		<QueryDisplay
			query={detailQuery}
			LoadingSlot={<RoleDetailsLoading />}
			ErrorSlot={
				<RoleDetailsError
					error={detailError}
					onRetry={() => void detailQuery.refetch()}
				/>
			}
			EmptySlot={<StaffRoleNotFound />}
		>
			{() => (
				<QueryDisplay
					query={permissionKeysQuery}
					LoadingSlot={<RoleDetailsLoading />}
					ErrorSlot={
						<RoleDetailsError
							error={permissionKeysError}
							onRetry={() => void permissionKeysQuery.refetch()}
						/>
					}
				>
					{() => (
						<QueryDisplay
							query={catalogStateQuery}
							ErrorSlot={
								<RoleDetailsError
									error={permissionCatalogError}
									onRetry={() => void permissionCatalogQuery.refetch()}
								/>
							}
						>
							{() => {
								// A payload without its required role identity is not a
								// renderable detail page: same 404 view as an empty body.
								if (!details) {
									return <StaffRoleNotFound />;
								}

								return (
									<div
										className="publy-detail-page publy-page-fill"
										data-testid="staff-role-details-page"
									>
										<div className="mb-4">
											<Link to="/staff/roles" className="publy-back-link">
												<IconArrowLeft aria-hidden="true" className="size-3" />
												{t('back-to-roles')}
											</Link>
										</div>

										<StaffRoleIdentityHeader
											details={details}
											roleId={roleId}
											assignedCount={assignedKeys.length}
											onEdit={() => setEditDrawerOpen(true)}
										/>

										<DetailGrid>
											<DetailMain>
												{/* Permissions in this role */}
												<Card className="publy-detail-card">
													<div className="publy-detail-card-header">
														<span className="text-[14px] font-semibold">
															{t('permissions-in-this-role')}
														</span>
													</div>
													<StaffRolePermissionsCardBody
														isFullAccess={details.isFullAccess}
														assignedKeys={assignedKeys}
														catalog={catalog}
													/>
												</Card>
											</DetailMain>

											<DetailAside className="flex flex-col gap-5">
												{/* About Card */}
												<StaffRoleAboutCard
													details={details}
													permissionsCountLabel={permissionsCountLabel}
												/>

												{/* Members Card */}
												<Card className="publy-detail-card">
													<div className="publy-detail-card-header">
														<span className="text-[14px] font-semibold">
															{t('members')}
															{userCount === null ? null : (
																<span className="font-normal text-[var(--publy-foreground-subtle)]">
																	{' '}
																	· {userCount}
																</span>
															)}
														</span>
														<Link
															to="/staff/roles/$roleId/users"
															params={{ roleId }}
															className="text-[12px] no-underline text-[var(--publy-foreground-muted)]"
														>
															{t('view-all')}
														</Link>
													</div>
													<div className="flex flex-col">
														{membersCardContent}
													</div>
												</Card>
											</DetailAside>
										</DetailGrid>

										<StaffRoleEditDetailsDrawer
											isOpen={isEditDrawerOpen}
											role={details}
											onOpenChange={setEditDrawerOpen}
											onSessionExpired={() => setShouldRedirectToLogout(true)}
											onDirtyChange={setIsEditFormDirty}
											onSaved={() => setEditDrawerOpen(false)}
										/>
										<ConfirmDialog
											isOpen={editDrawerBlocker.status === 'blocked'}
											title={t('unsaved-changes-dialog-title')}
											description={t('unsaved-changes-dialog-description')}
											confirmLabel={t('leave-page')}
											cancelLabel={t('cancel')}
											tone="danger"
											onConfirm={() => editDrawerBlocker.proceed?.()}
											onOpenChange={(isOpen) => {
												if (!isOpen) {
													editDrawerBlocker.reset?.();
												}
											}}
										/>
									</div>
								);
							}}
						</QueryDisplay>
					)}
				</QueryDisplay>
			)}
		</QueryDisplay>
	);
};

export const Route = createFileRoute('/_authed-layout/staff/roles/$roleId')({
	staticData: {
		crumbs: () => [
			{ kind: 'label', labelKey: 'nav-staff-roles', to: '/staff/roles' },
			{
				kind: 'entity',
				query: staffRoleCrumbQuery,
				select: selectStaffRoleCrumbName,
			},
		],
		// #819: the edit drawer reads its scope-neutral picker labels from the
		// shared `staff-tenant-roles` catalogue.
		i18nNamespaces: ['staff-tenant-roles'],
	},
	validateSearch: (search) =>
		parseStaffRoleDetailsSearchParams(search as Record<string, unknown>),
	loader: ({ context, params }) => {
		preloadRouteQueries(
			context.queryClient,
			staffRoleQueries({ roleId: params.roleId, locale: context.locale }),
		);
	},
	component: StaffRoleDetailsPage,
});
