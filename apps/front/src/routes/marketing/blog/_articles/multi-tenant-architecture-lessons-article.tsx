import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import {
	BLOG_H2_SX,
	BLOG_P_SX,
	BlogArticlePage,
	type TocItem,
} from '#app/routes/marketing/_components/blog-article-page.tsx';
import {
	BLOG_BLOCKQUOTE_SX,
	BLOG_CODE_INLINE_SX,
	BLOG_H3_SX,
	BLOG_H4_SX,
	BLOG_HR_SX,
	BLOG_LEAD_SX,
	BLOG_LINK_SX,
	BLOG_OL_SX,
	BLOG_UL_SX,
	BlogCallout,
	BlogCodeBlock,
	BlogFigure,
	BlogGallery,
	BlogPullQuote,
	BlogTable,
	BlogVideo,
	Token,
} from '#app/routes/marketing/_components/blog-content-elements.tsx';
import { BLOG_POSTS, unsplashCover } from '#app/routes/marketing/_data/blog.ts';

// ----------------------------------------------------------------------

// Kitchen sink — exhaustive demo of every blog content element type. Use
// this article as the visual reference when adding a new element to
// `blog-content-elements.tsx`: drop a usage in here so the demo grows.
//
// Element checklist (keep in sync with renders below):
// [x] Lead paragraph                  [x] Inline code (`<code>`)
// [x] H2 / H3 / H4 headings           [x] Bold / italic / strikethrough
// [x] Body paragraph                  [x] Inline link
// [x] Unordered list (with nesting)   [x] Ordered list
// [x] Code block (no chrome)          [x] Code block (chrome + language)
// [x] Code block (with token spans)   [x] Plain blockquote
// [x] Pull quote (with attribution)   [x] Image figure (with caption)
// [x] Image gallery (3-up)            [x] Table
// [x] Horizontal rule                 [x] Video embed (placeholder)
// [x] Callout: info / tip / warning / success

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
	{
		id: 'shared-vs-pooled-vs-isolated',
		label: 'Shared vs pooled vs isolated',
		level: 2,
	},
	{ id: 'migrations-cascade', label: 'Migrations cascade' },
	{
		id: 'observability-is-tenant-shaped',
		label: 'Observability is tenant-shaped',
	},
	{ id: 'side-by-side-comparison', label: 'Side-by-side comparison', level: 2 },
	{ id: 'if-we-started-over', label: 'If we started over' },
];

// ----------------------------------------------------------------------
//
// SECTIONS — each section of the article body is its own named component.
// Keeps the top-level `MultiTenantArchitectureLessonsArticle` slim
// (composition only) and avoids react-doctor's `no-giant-component` flag.
//
// ----------------------------------------------------------------------

const LeadSection = () => {
	return (
		<>
			<Typography sx={BLOG_LEAD_SX}>
				When we set out to build PublyApp, multi-tenancy felt like a checkbox —
				pick a strategy, wire it up, ship. Eighteen months and a few production
				incidents later, the strategy has cost us less sleep than the
				assumptions around it.
			</Typography>

			<Typography sx={{ ...BLOG_P_SX, mt: 3 }}>
				This piece is the long-form version of a talk I gave at the{' '}
				<Box component="a" href="#" sx={BLOG_LINK_SX}>
					SaaS Engineering meetup
				</Box>{' '}
				last quarter. It covers the three lessons that actually moved the
				needle, and one thing we'd <em>still</em> do differently if we started
				over.
			</Typography>
		</>
	);
};

const DataIsolationSection = () => {
	return (
		<Box component="section">
			<Typography
				component="h2"
				id="data-isolation-is-a-spectrum"
				sx={BLOG_H2_SX}
			>
				Data isolation is a spectrum, not a switch
			</Typography>
			<Typography sx={BLOG_P_SX}>
				We started with shared schemas plus{' '}
				<Box component="code" sx={BLOG_CODE_INLINE_SX}>
					tenant_id
				</Box>{' '}
				columns. It felt pragmatic. Then a query missed a{' '}
				<Box component="code" sx={BLOG_CODE_INLINE_SX}>
					WHERE
				</Box>{' '}
				clause during a refactor and leaked one tenant's audit log into
				another's exports. The fix wasn't to switch isolation models — it was to
				add <strong>row-level security as a defense in depth</strong>.
			</Typography>

			<Typography
				component="h3"
				id="shared-vs-pooled-vs-isolated"
				sx={BLOG_H3_SX}
			>
				Shared vs pooled vs isolated
			</Typography>
			<Typography sx={BLOG_P_SX}>
				Three models you'll see in the wild — each with its own failure mode:
			</Typography>
			<Box component="ul" sx={BLOG_UL_SX}>
				<li>
					<strong>Shared schema</strong> — one set of tables, every row carries
					a tenant id. Cheapest to operate; easiest to leak.
				</li>
				<li>
					<strong>Pooled (schema-per-tenant)</strong> — separate Postgres
					schemas in a single database. Stronger isolation, but migrations
					become a fan-out operation.
					<Box component="ul" sx={BLOG_UL_SX}>
						<li>You'll write your own schema-walking migration runner.</li>
						<li>
							Your{' '}
							<Box component="code" sx={BLOG_CODE_INLINE_SX}>
								pg_dump
							</Box>{' '}
							story gets weird.
						</li>
					</Box>
				</li>
				<li>
					<strong>Isolated (database-per-tenant)</strong> — strongest isolation,
					highest cost, painful to onboard new tenants.
				</li>
			</Box>

			{/* ---------- Callouts: info + tip ---------- */}
			<BlogCallout variant="info" title="Heads up">
				Row-level security in Postgres is opt-in <em>per table</em>. We learned
				this the hard way. There's no global "encrypt everything" switch — every
				new table needs its own policy or you regress.
			</BlogCallout>

			<BlogCallout variant="tip" title="Pro tip">
				If you're on the shared-schema path, write a CI check that fails any{' '}
				<Box component="code" sx={BLOG_CODE_INLINE_SX}>
					SELECT
				</Box>{' '}
				/{' '}
				<Box component="code" sx={BLOG_CODE_INLINE_SX}>
					UPDATE
				</Box>{' '}
				/{' '}
				<Box component="code" sx={BLOG_CODE_INLINE_SX}>
					DELETE
				</Box>{' '}
				without an explicit tenant filter in the WHERE clause. We added this on
				day 60. It's caught 14 latent leaks in 18 months.
			</BlogCallout>

			{/* ---------- Code block: chrome + language + tokens ---------- */}
			<Typography component="h4" sx={BLOG_H4_SX}>
				Row-level security in Postgres
			</Typography>
			<Typography sx={BLOG_P_SX}>
				Once a tenant is loaded, set a session variable and let the policy
				filter every read:
			</Typography>
			<BlogCodeBlock language="SQL">
				<Token type="com">{`-- Run once per table (run on every new table you add!)`}</Token>
				{`\n`}
				<Token type="kw">ALTER TABLE</Token>
				{` projects `}
				<Token type="kw">ENABLE ROW LEVEL SECURITY</Token>
				<Token type="pun">;</Token>
				{`\n\n`}
				<Token type="kw">CREATE POLICY</Token>
				{` tenant_isolation `}
				<Token type="kw">ON</Token>
				{` projects\n  `}
				<Token type="kw">USING</Token>
				<Token type="pun">(</Token>
				{`tenant_id `}
				<Token type="pun">=</Token>
				{` `}
				<Token type="fn">current_setting</Token>
				<Token type="pun">(</Token>
				<Token type="str">'app.tenant_id'</Token>
				<Token type="pun">)</Token>
				<Token type="pun">::</Token>
				<Token type="cls">uuid</Token>
				<Token type="pun">);</Token>
			</BlogCodeBlock>

			<Typography sx={BLOG_P_SX}>
				In application code, set the session variable inside the same
				transaction the request runs in:
			</Typography>
			<BlogCodeBlock language="TypeScript">
				<Token type="kw">await</Token>
				{` db.`}
				<Token type="fn">transaction</Token>
				<Token type="pun">(</Token>
				<Token type="kw">async</Token>
				{` `}
				<Token type="pun">(</Token>
				{`tx`}
				<Token type="pun">)</Token>
				{` `}
				<Token type="pun">{'=>'}</Token>
				{` `}
				<Token type="pun">{'{'}</Token>
				{`\n  `}
				<Token type="kw">await</Token>
				{` tx.`}
				<Token type="fn">execute</Token>
				<Token type="pun">(</Token>
				{`\n    sql`}
				<Token type="str">{'`SET LOCAL app.tenant_id = ${tenant.id}`'}</Token>
				{`,\n  `}
				<Token type="pun">);</Token>
				{`\n  `}
				<Token type="kw">return</Token>
				{` handler`}
				<Token type="pun">(</Token>
				{`tx`}
				<Token type="pun">);</Token>
				{`\n`}
				<Token type="pun">{'}'}</Token>
				<Token type="pun">);</Token>
			</BlogCodeBlock>
		</Box>
	);
};

const MigrationsSection = () => {
	return (
		<Box component="section">
			<Typography component="h2" id="migrations-cascade" sx={BLOG_H2_SX}>
				Migrations cascade — write them in three passes
			</Typography>
			<Typography sx={BLOG_P_SX}>
				Single-tenant migrations are stressful but bounded. Multi-tenant
				migrations cascade — every schema change touches every tenant
				simultaneously. The pattern that's worked for us:
			</Typography>
			<Box component="ol" sx={BLOG_OL_SX}>
				<li>
					<strong>Add the new shape.</strong> New columns, new tables, nullable
					/ defaulted so existing writes keep working.
				</li>
				<li>
					<strong>Dual-write to both.</strong> Application writes the new shape{' '}
					<em>and</em> the old. Reads still come from the old shape, but the new
					shape is now warm.
				</li>
				<li>
					<strong>Cut over and remove.</strong> Reads switch to the new shape.
					Verify for a release. Then drop the old columns / tables.
				</li>
			</Box>

			<BlogCallout variant="warning" title="Don't skip pass 2">
				Skipping the dual-write pass is the most common mistake we've seen. It
				collapses 3 deploys into 1 and turns a rollback from "stop deploying"
				into "restore from backup". The complexity tax is worth paying.
			</BlogCallout>

			{/* ---------- Pull quote ---------- */}
			<BlogPullQuote attribution="Adrian Marin" role="Bullet Train">
				The first 90% of multi-tenancy is database design. The second 90% is
				everything else.
			</BlogPullQuote>
		</Box>
	);
};

const ObservabilitySection = () => {
	return (
		<Box component="section">
			<Typography
				component="h2"
				id="observability-is-tenant-shaped"
				sx={BLOG_H2_SX}
			>
				Observability is tenant-shaped, or it isn't observability
			</Typography>
			<Typography sx={BLOG_P_SX}>
				A 99% success rate sounds great. It's catastrophic when 1% of tenants
				are at 100% failure. Every dashboard, alert, and SLO we track has a
				per-tenant cardinality dimension. Datadog's bill went up; our incident
				response time went down by an order of magnitude.
			</Typography>

			{/* Image figure (single + caption) */}
			<BlogFigure
				src={unsplashCover('1551288049-bebda4e38f71', { w: 1600, h: 900 })}
				alt="Per-tenant error-rate dashboard with one outlier highlighted"
				ratio="16/9"
				caption="Fig. 1 — A green-overall dashboard with one tenant burning down."
			/>

			{/* ---------- H3 + table ---------- */}
			<Typography component="h3" id="side-by-side-comparison" sx={BLOG_H3_SX}>
				Side-by-side: what changed
			</Typography>
			<Typography sx={BLOG_P_SX}>
				Six months of incident response data, before and after we introduced
				per-tenant cardinality:
			</Typography>
			<BlogTable
				columns={[
					{ key: 'metric', label: 'Metric' },
					{ key: 'before', label: 'Before' },
					{ key: 'after', label: 'After' },
					{ key: 'delta', label: 'Δ' },
				]}
				rows={[
					{
						key: 'mttd',
						cells: [
							'Mean time to detect (MTTD)',
							'47 min',
							'4 min',
							<strong style={{ color: '#10B981' }} key="v">
								-91%
							</strong>,
						],
					},
					{
						key: 'mttr',
						cells: [
							'Mean time to resolve (MTTR)',
							'3h 12m',
							'38 min',
							<strong style={{ color: '#10B981' }} key="v">
								-80%
							</strong>,
						],
					},
					{
						key: 'incidents',
						cells: [
							'Tenant-affecting incidents (Q1)',
							'18',
							'6',
							<strong style={{ color: '#10B981' }} key="v">
								-66%
							</strong>,
						],
					},
					{
						key: 'spend',
						cells: [
							'Datadog spend (monthly)',
							'$1,200',
							'$1,950',
							<strong style={{ color: '#D97706' }} key="v">
								+62%
							</strong>,
						],
					},
				]}
				caption="Six-month before/after, same tenant base."
			/>

			{/* ---------- Plain blockquote ---------- */}
			<Box component="blockquote" sx={BLOG_BLOCKQUOTE_SX}>
				<Typography>
					The best dashboard isn't the one with the most metrics — it's the one
					that makes the right one impossible to miss.
				</Typography>
			</Box>

			{/* ---------- Image gallery (3-up) ---------- */}
			<Typography sx={{ ...BLOG_P_SX, mt: 4 }}>
				The three views we built: a global overview, a per-tenant heat-map, and
				a per-endpoint percentile chart.
			</Typography>
			<BlogGallery
				images={[
					{
						src: unsplashCover('1551288049-bebda4e38f71', {
							w: 600,
							h: 450,
						}),
						alt: 'Global overview dashboard',
						ratio: '4/3',
					},
					{
						src: unsplashCover('1542744173-8e7e53415bb0', {
							w: 600,
							h: 450,
						}),
						alt: 'Per-tenant heat-map view',
						ratio: '4/3',
					},
					{
						src: unsplashCover('1611162617474-5b21e879e113', {
							w: 600,
							h: 450,
						}),
						alt: 'Per-endpoint percentile chart',
						ratio: '4/3',
					},
				]}
				caption="Three lenses on the same data — none of them work alone."
			/>

			{/* ---------- Video placeholder ---------- */}
			<Typography sx={{ ...BLOG_P_SX, mt: 4 }}>
				If you'd rather watch the talk than read the long-form, the recording is
				below:
			</Typography>
			<BlogVideo
				title="The talk: building observable multi-tenant systems"
				posterSrc={unsplashCover('1573164713988-8665fc963095', {
					w: 1600,
					h: 900,
				})}
				caption="The talk version (32 min). Slides + Q&A."
			/>
		</Box>
	);
};

const IfWeStartedOverSection = () => {
	return (
		<Box component="section">
			<Typography component="h2" id="if-we-started-over" sx={BLOG_H2_SX}>
				If we started over
			</Typography>
			<Typography sx={BLOG_P_SX}>
				Same primary isolation strategy. Same database. We'd add row-level
				security from <em>day one</em> (instead of bolted on after the
				incident), commit to three-pass migrations as a discipline (not as an
				emergency response), and budget for per-tenant observability up front.
			</Typography>
			<Typography sx={BLOG_P_SX}>
				We also tested removing one thing entirely:{' '}
				<Box component="del" sx={{ color: 'text.disabled' }}>
					a global "ops mode" superuser bypass
				</Box>
				— it sounded useful, but it became the source of the original leak. The
				strikethrough is deliberate.
			</Typography>

			<BlogCallout variant="success" title="What worked">
				Three things we'd keep without question:{' '}
				<strong>RLS as defense in depth</strong>,{' '}
				<strong>three-pass migrations</strong>, and{' '}
				<strong>per-tenant SLO dashboards</strong>. Everything else is
				contextual.
			</BlogCallout>

			<Typography sx={BLOG_P_SX}>
				Want the deep-dive notebook with the schema, policies, and migration
				runner? It's on{' '}
				<Box component="a" href="#" sx={BLOG_LINK_SX}>
					our GitHub
				</Box>
				.
			</Typography>
		</Box>
	);
};

// ----------------------------------------------------------------------

const MultiTenantArchitectureLessonsArticle = () => {
	return (
		<BlogArticlePage post={POST} tocItems={TOC_ITEMS}>
			<Stack spacing={0.5}>
				<LeadSection />
				<DataIsolationSection />
				<Box component="hr" sx={BLOG_HR_SX} />
				<MigrationsSection />
				<ObservabilitySection />
				<Box component="hr" sx={BLOG_HR_SX} />
				<IfWeStartedOverSection />
			</Stack>
		</BlogArticlePage>
	);
};

export default MultiTenantArchitectureLessonsArticle;
