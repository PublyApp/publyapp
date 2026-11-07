import { createFileRoute, redirect } from '@tanstack/react-router';
import { legacyProfileRedirectHref } from '~/lib/navigation/legacy-profile-path';

/**
 * Frozen legacy redirect stub (#2290): the staff role list children used to live under
 * `/staff/profiles`. Old bookmarks must keep working.
 */
export const Route = createFileRoute('/_authed-layout/staff/profiles/$')({
	// Frozen legacy redirect stub (#972 allowlist) — never renders, so it
	// never supplies a trail.
	staticData: { crumbs: 'shell' },
	beforeLoad: ({ location }) => {
		throw redirect({
			href: legacyProfileRedirectHref(location.pathname, location.searchStr),
			statusCode: 301,
		});
	},
	component: () => null,
});
