import Box from '@mui/material/Box';
import { useParams } from 'react-router';

import { APP_NAME, FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { CtaBand } from '#app/routes/marketing/_components/cta-band.tsx';
import { CustomerStoryAboutAside } from '#app/routes/marketing/_components/customer-story-about-aside.tsx';
import { CustomerStoryHero } from '#app/routes/marketing/_components/customer-story-hero.tsx';
import { CustomerStoryNarrative } from '#app/routes/marketing/_components/customer-story-narrative.tsx';
import { CustomerStoryPullQuote } from '#app/routes/marketing/_components/customer-story-pull-quote.tsx';
import { CustomerStoryStatsBand } from '#app/routes/marketing/_components/customer-story-stats-band.tsx';
import { MarketingErrorView } from '#app/routes/marketing/_components/marketing-error-view.tsx';
import {
	customerStoryOgImage,
	getPublishedCustomerStory,
} from '#app/routes/marketing/_data/customer-stories.ts';

// ----------------------------------------------------------------------

// Customer-story route. Reads `:slug` and looks up the story in
// `CUSTOMER_STORIES` (filtered by `published !== false`). Unknown slugs
// render the marketing 404 view inline (NOT a `throw new Response`) so
// the user stays inside the marketing chrome (topbar / footer) rather
// than bouncing into the root error boundary.

// ----------------------------------------------------------------------

const CustomerStoryRoute = () => {
	const { slug } = useParams<{ slug: string }>();
	const story = slug ? getPublishedCustomerStory(slug) : undefined;

	if (!story) {
		return (
			<MarketingErrorView
				numeral="404"
				title="Customer story not found"
				subhead="The story you're looking for might have moved, been unpublished, or never existed. Browse popular destinations below to keep exploring."
			/>
		);
	}

	return (
		<Box component="main">
			<CustomerStoryHero story={story} />
			<CustomerStoryStatsBand metrics={story.metrics} />
			<CustomerStoryNarrative
				blocks={story.narrative}
				aside={
					<CustomerStoryAboutAside
						customerName={story.customerName}
						customerWordmark={story.customerWordmark}
						about={story.about}
					/>
				}
				midQuote={<CustomerStoryPullQuote quote={story.pullQuote} />}
			/>
			<CtaBand
				eyebrowLabel="Ready to ship faster?"
				title={`Want results like\n${story.customerName}?`}
				subhead="Join thousands of teams that put their social execution on autopilot with PublyApp."
				ctaLabel="Start your free trial"
				ctaHref={FRONT_PATH_NAMES.auth.signup}
				microcopy="14-day trial. No credit card required."
			/>
		</Box>
	);
};

export default CustomerStoryRoute;

// ----------------------------------------------------------------------

// Per-story SEO meta. React Router calls this with the same params as
// the route component, so we re-do the published lookup here too —
// otherwise meta tags would advertise an unpublished or missing story.
type MetaArgs = { params: { slug?: string } };

export const meta = ({ params }: MetaArgs) => {
	const story = params.slug
		? getPublishedCustomerStory(params.slug)
		: undefined;

	if (!story) {
		return [{ title: `Not Found | ${APP_NAME}` }];
	}

	const ogImage = customerStoryOgImage(story.heroImageSlug);

	return [
		{ title: `${story.seoTitle} | ${APP_NAME}` },
		{ name: 'description', content: story.seoDescription },
		{ property: 'og:title', content: story.seoTitle },
		{ property: 'og:description', content: story.seoDescription },
		{ property: 'og:image', content: ogImage },
		{ property: 'og:type', content: 'article' },
	];
};
