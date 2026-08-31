import {
	createFileRoute,
	Link,
	Outlet,
	useRouterState,
} from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';

const POSTS_TAB_ROUTE_SUFFIXES = ['drafts', 'history', 'queue'] as const;
type PostsSection = 'calendar' | (typeof POSTS_TAB_ROUTE_SUFFIXES)[number];

const getActiveSection = (pathname: string): PostsSection => {
	const match = POSTS_TAB_ROUTE_SUFFIXES.find((suffix) =>
		pathname.endsWith(`/${suffix}`),
	);

	return match ?? 'calendar';
};

/**
 * The tenant posts home: section tabs over the calendar, drafts, history and
 * queue pages. Calendar and queue expose the real publication schedule;
 * unfinished sections remain explicit coming-later states.
 */
const TenantPostsLayout = () => {
	const { t } = useTranslation('common');
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const activeSection = getActiveSection(pathname);

	return (
		<div className="space-y-5" data-testid="tenant-posts-page">
			<Tabs value={activeSection}>
				<TabsList variant="line">
					<TabsTrigger value="calendar" render={<Link to="/tenant/posts" />}>
						{t('calendar')}
					</TabsTrigger>
					<TabsTrigger
						value="drafts"
						render={<Link to="/tenant/posts/drafts" />}
					>
						{t('drafts')}
					</TabsTrigger>
					<TabsTrigger
						value="history"
						render={<Link to="/tenant/posts/history" />}
					>
						{t('history')}
					</TabsTrigger>
					<TabsTrigger value="queue" render={<Link to="/tenant/posts/queue" />}>
						{t('queue')}
					</TabsTrigger>
				</TabsList>

				<TabsContent value={activeSection} className="mt-5">
					<Outlet />
				</TabsContent>
			</Tabs>
		</div>
	);
};

export const Route = createFileRoute('/_authed-layout/tenant/posts')({
	// Always matched alongside a calendar/drafts/history/queue child (never
	// the deepest match on its own — see `deriveBreadcrumbTrail`), but the
	// contract requires every route to declare its own trail.
	staticData: {
		crumbs: () => [{ kind: 'label', labelKey: 'posts' }],
		i18nNamespaces: ['posts'],
	},
	component: TenantPostsLayout,
});
