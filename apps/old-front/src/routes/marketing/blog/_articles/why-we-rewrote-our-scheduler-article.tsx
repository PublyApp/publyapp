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
	return p.slug === 'why-we-rewrote-our-scheduler';
});

if (!POST) {
	throw new Error(
		'BlogPost "why-we-rewrote-our-scheduler" not found in BLOG_POSTS — slug mismatch with _data/blog.ts',
	);
}

const TOC_ITEMS: TocItem[] = [
	{ id: 'the-original-was-fine', label: 'The original was fine' },
	{
		id: 'the-real-problem-was-our-mental-model',
		label: 'The real problem was our mental model',
	},
	{ id: 'rewriting-was-the-cheap-fix', label: 'Rewriting was the cheap fix' },
	{
		id: 'when-we-tell-people-not-to-rewrite',
		label: 'When we tell people not to rewrite',
	},
];

// ----------------------------------------------------------------------

const WhyWeRewroteOurSchedulerArticle = () => {
	return (
		<BlogArticlePage post={POST} tocItems={TOC_ITEMS}>
			<Stack spacing={4}>
				<Typography sx={BLOG_P_SX}>
					In Q4 we threw away 14 months of code and rewrote our scheduler from
					scratch. The rewrite worked. Most of what we learned was about the
					original code we abandoned.
				</Typography>

				<Box component="section">
					<Typography component="h2" id="the-original-was-fine" sx={BLOG_H2_SX}>
						The original was fine
					</Typography>
					<Typography sx={BLOG_P_SX}>
						This is the awkward part of every rewrite story: the code we threw
						away worked. It scheduled posts, handled retries, dealt with
						platform API quirks. It was messy in ways that made every change
						scary, but it shipped.
					</Typography>
				</Box>

				<Box component="section">
					<Typography
						component="h2"
						id="the-real-problem-was-our-mental-model"
						sx={BLOG_H2_SX}
					>
						The real problem was our mental model
					</Typography>
					<Typography sx={BLOG_P_SX}>
						The scheduler started as a cron-driven loop with a job queue. By
						month 14 it had become an event-sourced state machine — but the code
						still looked like a cron loop. The mental model and the actual
						behavior had drifted apart. Every bug took twice as long to find
						because the code didn't match what was happening.
					</Typography>
				</Box>

				<Box component="section">
					<Typography
						component="h2"
						id="rewriting-was-the-cheap-fix"
						sx={BLOG_H2_SX}
					>
						Rewriting was the cheap fix
					</Typography>
					<Typography sx={BLOG_P_SX}>
						We considered the standard alternatives: incremental refactor,
						strangler fig, parallel implementations. They all required
						maintaining two mental models simultaneously, which was the problem
						we were trying to solve. The rewrite let us collapse to one mental
						model in a quarter.
					</Typography>
				</Box>

				<Box component="section">
					<Typography
						component="h2"
						id="when-we-tell-people-not-to-rewrite"
						sx={BLOG_H2_SX}
					>
						When we tell people not to rewrite
					</Typography>
					<Typography sx={BLOG_P_SX}>
						If your code is messy but matches your mental model — refactor. If
						your code is clean but doesn't match your mental model anymore —
						that's the rewrite tell. Most "we should rewrite" conversations are
						actually the first kind in disguise.
					</Typography>
				</Box>
			</Stack>
		</BlogArticlePage>
	);
};

export default WhyWeRewroteOurSchedulerArticle;
