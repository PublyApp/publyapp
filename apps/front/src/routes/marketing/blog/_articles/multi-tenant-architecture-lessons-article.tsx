import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import {
	BLOG_H2_SX,
	BLOG_P_SX,
	BlogArticlePage,
	type TocItem,
} from '#app/routes/marketing/_components/blog-article-page.tsx';
import { BLOG_POSTS } from '#app/routes/marketing/_data/blog.ts';

// ----------------------------------------------------------------------

const POST = BLOG_POSTS.find((p) => {
	return p.slug === 'multi-tenant-architecture-lessons';
});

if (!POST) {
	throw new Error(
		'BlogPost "multi-tenant-architecture-lessons" not found in BLOG_POSTS — slug mismatch with _data/blog.ts',
	);
}

const TOC_ITEMS: TocItem[] = [
	{ id: 'data-isolation-is-a-spectrum', label: 'Data isolation is a spectrum' },
	{ id: 'migrations-get-harder-not-easier', label: 'Migrations get harder' },
	{
		id: 'observability-is-tenant-shaped',
		label: 'Observability is tenant-shaped',
	},
	{ id: 'if-we-started-over', label: 'If we started over' },
];

// ----------------------------------------------------------------------

const MultiTenantArchitectureLessonsArticle = () => {
	return (
		<BlogArticlePage post={POST} tocItems={TOC_ITEMS}>
			<Stack spacing={4}>
				<Typography sx={BLOG_P_SX}>
					When we set out to build PublyApp, multi-tenancy felt like a checkbox
					— pick a strategy, wire it up, ship. Eighteen months and a few
					production incidents later, the strategy has cost us less sleep than
					the assumptions around it.
				</Typography>

				<Box component="section">
					<Typography
						component="h2"
						id="data-isolation-is-a-spectrum"
						sx={BLOG_H2_SX}
					>
						Data isolation is a spectrum, not a switch
					</Typography>
					<Typography sx={BLOG_P_SX}>
						We started with shared schemas + tenant_id columns. It felt
						pragmatic. Then a query missed a WHERE clause during a refactor and
						leaked one tenant's audit log into another's exports. The fix wasn't
						to switch isolation models; it was to add row-level security as a
						defense in depth. The lesson: pick a primary isolation model, but
						assume any single layer will fail.
					</Typography>
				</Box>

				<Box component="section">
					<Typography
						component="h2"
						id="migrations-get-harder-not-easier"
						sx={BLOG_H2_SX}
					>
						Migrations get harder, not easier
					</Typography>
					<Typography sx={BLOG_P_SX}>
						Single-tenant migrations are stressful but bounded. Multi-tenant
						migrations cascade — every schema change touches every tenant
						simultaneously. We learned to write migrations that work in three
						passes: add the new shape, dual-write to both, then remove the old.
						Each pass deploys independently. It triples the timeline, but the
						rollback story is "stop deploying" instead of "restore from backup."
					</Typography>
				</Box>

				<Box component="section">
					<Typography
						component="h2"
						id="observability-is-tenant-shaped"
						sx={BLOG_H2_SX}
					>
						Observability is tenant-shaped
					</Typography>
					<Typography sx={BLOG_P_SX}>
						A 99% success rate sounds great. It's catastrophic when 1% of
						tenants are at 100% failure. Every dashboard, alert, and SLO we
						track has a per-tenant cardinality dimension. Datadog's bill went
						up; our incident response time went down by an order of magnitude.
					</Typography>
				</Box>

				<Box component="section">
					<Typography component="h2" id="if-we-started-over" sx={BLOG_H2_SX}>
						If we started over
					</Typography>
					<Typography sx={BLOG_P_SX}>
						Same primary isolation strategy. Same database. We'd add
						row-level-security from day one (instead of bolted on after the
						incident), commit to three-pass migrations as a discipline (not as
						an emergency response), and budget for per-tenant observability up
						front. The rest is execution.
					</Typography>
				</Box>
			</Stack>
		</BlogArticlePage>
	);
};

export default MultiTenantArchitectureLessonsArticle;
