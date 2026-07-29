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
	return p.slug === 'shipping-daily-without-burning-out';
});

if (!POST) {
	throw new Error(
		'BlogPost "shipping-daily-without-burning-out" not found in BLOG_POSTS — slug mismatch with _data/blog.ts',
	);
}

const TOC_ITEMS: TocItem[] = [
	{ id: 'small-units-of-work', label: 'Small units of work' },
	{ id: 'async-by-default', label: 'Async by default' },
	{ id: 'the-deploy-is-not-the-event', label: 'The deploy is not the event' },
	{ id: 'rest-is-a-deliverable', label: 'Rest is a deliverable' },
];

// ----------------------------------------------------------------------

const ShippingDailyWithoutBurningOutArticle = () => {
	return (
		<BlogArticlePage post={POST} tocItems={TOC_ITEMS}>
			<Stack spacing={4}>
				<Typography sx={BLOG_P_SX}>
					"Ship daily" is one of our values. It's also the value most likely to
					get misread. Daily isn't urgency — it's discipline. Here's the rhythm
					that's worked for us across 18 months and zero burnouts.
				</Typography>

				<Box component="section">
					<Typography component="h2" id="small-units-of-work" sx={BLOG_H2_SX}>
						Small units of work
					</Typography>
					<Typography sx={BLOG_P_SX}>
						The hardest part of shipping daily isn't the deploy — it's breaking
						work into pieces that fit in a day. We treat &gt; 1-day tasks as a
						planning failure, not a code failure. If a task can't be split, it
						doesn't get scheduled.
					</Typography>
				</Box>

				<Box component="section">
					<Typography component="h2" id="async-by-default" sx={BLOG_H2_SX}>
						Async by default
					</Typography>
					<Typography sx={BLOG_P_SX}>
						No standups. No daily syncs. The team writes a 3-line update each
						morning in a shared channel — yesterday, today, blockers. If
						something needs a meeting, it gets one — but it has to earn the
						meeting. The default is async.
					</Typography>
				</Box>

				<Box component="section">
					<Typography
						component="h2"
						id="the-deploy-is-not-the-event"
						sx={BLOG_H2_SX}
					>
						The deploy is not the event
					</Typography>
					<Typography sx={BLOG_P_SX}>
						We feature-flag everything. The deploy is a non-event because the
						code is dark when it lands. The flag flip is the event, and that's a
						separate decision with separate stakeholders. This decoupling
						removed all the deploy anxiety from the team.
					</Typography>
				</Box>

				<Box component="section">
					<Typography component="h2" id="rest-is-a-deliverable" sx={BLOG_H2_SX}>
						Rest is a deliverable
					</Typography>
					<Typography sx={BLOG_P_SX}>
						Friday afternoons are for closing tabs. Vacation is mandatory and
						recovery time after big launches is scheduled, not requested. The
						daily rhythm only works because we treat the rest cadence with the
						same seriousness as the work cadence.
					</Typography>
				</Box>
			</Stack>
		</BlogArticlePage>
	);
};

export default ShippingDailyWithoutBurningOutArticle;
