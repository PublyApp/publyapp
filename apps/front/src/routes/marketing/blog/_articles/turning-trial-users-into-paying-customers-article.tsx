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
	return p.slug === 'turning-trial-users-into-paying-customers';
});

if (!POST) {
	throw new Error(
		'BlogPost "turning-trial-users-into-paying-customers" not found in BLOG_POSTS — slug mismatch with _data/blog.ts',
	);
}

const TOC_ITEMS: TocItem[] = [
	{
		id: 'the-onboarding-was-the-pricing-page',
		label: 'The onboarding was the pricing page',
	},
	{ id: 'surface-the-shape-of-paid', label: 'Surface the shape of paid' },
	{ id: 'end-the-trial-with-care', label: 'End the trial with care' },
	{
		id: 'dark-patterns-still-dont-work',
		label: "Dark patterns still don't work",
	},
];

// ----------------------------------------------------------------------

const TurningTrialUsersIntoPayingCustomersArticle = () => {
	return (
		<BlogArticlePage post={POST} tocItems={TOC_ITEMS}>
			<Stack spacing={4}>
				<Typography sx={BLOG_P_SX}>
					Trial-to-paid conversion isn't a sales problem. It's a design problem
					dressed up as a sales problem. Six interventions over four months
					moved our rate by 18 points without adding a single sales email.
				</Typography>

				<Box component="section">
					<Typography
						component="h2"
						id="the-onboarding-was-the-pricing-page"
						sx={BLOG_H2_SX}
					>
						The onboarding was the pricing page
					</Typography>
					<Typography sx={BLOG_P_SX}>
						Most users decided whether to pay during onboarding, not on the
						pricing page. We were optimizing the wrong surface. Once we treated
						the first 60 seconds as the pricing pitch, everything downstream got
						easier.
					</Typography>
				</Box>

				<Box component="section">
					<Typography
						component="h2"
						id="surface-the-shape-of-paid"
						sx={BLOG_H2_SX}
					>
						Surface the shape of paid
					</Typography>
					<Typography sx={BLOG_P_SX}>
						Trial users didn't know what they'd lose at the end of the trial
						because the product didn't show them. We added gentle "this is a
						paid feature" indicators (no upsells, no popups — just labels) and
						conversion went up. People want to know what they're paying for.
					</Typography>
				</Box>

				<Box component="section">
					<Typography
						component="h2"
						id="end-the-trial-with-care"
						sx={BLOG_H2_SX}
					>
						End the trial with care
					</Typography>
					<Typography sx={BLOG_P_SX}>
						The biggest single lift came from the trial-end email. The version
						that worked wasn't aggressive. It said "your trial ended — here's
						what you built, here's what changes if you don't upgrade, here's the
						link." Calm and specific beat urgent and vague.
					</Typography>
				</Box>

				<Box component="section">
					<Typography
						component="h2"
						id="dark-patterns-still-dont-work"
						sx={BLOG_H2_SX}
					>
						Dark patterns still don't work
					</Typography>
					<Typography sx={BLOG_P_SX}>
						We tested countdown timers, fake scarcity, hidden cancel flows. All
						three temporarily lifted conversion and permanently tanked
						retention. Trial-to-paid is meaningless if "paid" cancels in 60
						days. Optimize for the cohort that stays.
					</Typography>
				</Box>
			</Stack>
		</BlogArticlePage>
	);
};

export default TurningTrialUsersIntoPayingCustomersArticle;
