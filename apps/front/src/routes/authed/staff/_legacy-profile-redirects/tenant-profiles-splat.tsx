import { createFileRoute, redirect } from '@tanstack/react-router';
import { legacyProfileRedirectHref } from '~/lib/navigation/legacy-profile-path';

/**
 * Frozen legacy redirect stub (#2290): a tenant's role child pages used to live under
 * `/staff/tenants/$tenantId/profiles`. Old bookmarks must keep working.
 */
export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/profiles/$',
)({
	// Frozen legacy redirect stub (#972 allowlist) — never renders, so it
	// never supplies a trail.
	staticData: { crumbs: 'shell' },
	beforeLoad: ({ location }) => {
		throw redirect({
			href: legacyProfileRedirectHref(location.pathname),
			statusCode: 301,
		});
	},
	component: () => null,
});
