import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useParams } from 'react-router';

import { APP_NAME, FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { FEATURES } from '#app/lib/features/flags.ts';
import { ChangelogEntry } from '#app/routes/marketing/_components/changelog-entry.tsx';
import { ChangelogStats } from '#app/routes/marketing/_components/changelog-stats.tsx';
import { ChangelogSubscribeBand } from '#app/routes/marketing/_components/changelog-subscribe-band.tsx';
import { ChangelogYearChips } from '#app/routes/marketing/_components/changelog-year-chips.tsx';
import { CtaBand } from '#app/routes/marketing/_components/cta-band.tsx';
import { MarketingHero } from '#app/routes/marketing/_components/marketing-hero.tsx';
import {
	getAvailableYears,
	getEntriesForYear,
} from '#app/routes/marketing/_data/changelog.tsx';

// ----------------------------------------------------------------------

const isValidYearString = (year: string | undefined): year is string => {
	return typeof year === 'string' && /^\d{4}$/.test(year);
};

// ----------------------------------------------------------------------

const ChangelogPage = () => {
	const { year: yearParam } = useParams<{ year?: string }>();

	if (!isValidYearString(yearParam)) {
		throw new Response('Not Found', { status: 404 });
	}

	const year = Number.parseInt(yearParam, 10);
	const availableYears = getAvailableYears();

	if (!availableYears.includes(year)) {
		throw new Response('Not Found', { status: 404 });
	}

	const entries = getEntriesForYear(year);

	return (
		<>
			<MarketingHero
				eyebrow="Changelog"
				eyebrowIcon="ph:rocket-launch-fill"
				title="What's new in PublyApp"
				subhead="Product updates, fixes, and behind-the-scenes wins. Updated weekly."
			/>

			{FEATURES.marketing.changelogStats ? (
				<ChangelogStats
					releasesShipped={128}
					featuresYtd={47}
					uptime="99.97%"
				/>
			) : null}

			<ChangelogYearChips years={availableYears} activeYear={year} />

			<Container maxWidth="md" sx={{ pb: { xs: 8, md: 12 } }}>
				{entries.length === 0 ? (
					<Stack
						alignItems="center"
						spacing={2}
						sx={{
							py: { xs: 8, md: 12 },
							textAlign: 'center',
							borderRadius: '20px',
							border: '1px dashed',
							borderColor: 'divider',
							bgcolor: 'background.neutral',
						}}
					>
						<Box
							sx={{
								width: 56,
								height: 56,
								borderRadius: '50%',
								display: 'inline-flex',
								alignItems: 'center',
								justifyContent: 'center',
								bgcolor: 'background.paper',
								color: 'text.secondary',
								border: '1px solid',
								borderColor: 'divider',
							}}
						>
							<Iconify icon="ph:rocket-launch-fill" width={24} />
						</Box>
						<Typography
							sx={{ fontSize: 18, fontWeight: 700, color: 'text.primary' }}
						>
							No releases for {year}
						</Typography>
						<Typography
							sx={{ fontSize: 14, color: 'text.secondary', maxWidth: 380 }}
						>
							Try another year above — we shipped plenty.
						</Typography>
					</Stack>
				) : (
					<Stack spacing={0} sx={{ minWidth: 0 }}>
						{entries.map((entry) => {
							return <ChangelogEntry key={entry.version} entry={entry} />;
						})}
					</Stack>
				)}

				{/* Year chips repeated at the end of the timeline so visitors
				    don't have to scroll back to the top to switch years. */}
				<ChangelogYearChips
					years={availableYears}
					activeYear={year}
					variant="bottom"
				/>

				{FEATURES.marketing.changelogSubscribe ? (
					<ChangelogSubscribeBand />
				) : null}
			</Container>

			<CtaBand
				eyebrowLabel="Start scaling today"
				title={'Start using the latest\nfeatures today'}
				subhead="Join thousands of teams turning their followers into active brand advocates."
				ctaLabel="Start for Free"
				ctaHref={FRONT_PATH_NAMES.auth.signup}
				microcopy="14-day free trial. No credit card required."
			/>
		</>
	);
};

export default ChangelogPage;

// ----------------------------------------------------------------------

type MetaArgs = { params: { year?: string } };

export const meta = ({ params }: MetaArgs) => {
	const yearParam = params.year ?? '';
	const year = Number.parseInt(yearParam, 10);
	const entries = Number.isFinite(year) ? getEntriesForYear(year) : [];
	const description = `${entries.length} releases shipped in ${yearParam}. Features, fixes, and behind-the-scenes wins.`;

	return [
		{ title: `Changelog · ${yearParam} | ${APP_NAME}` },
		{ name: 'description', content: description },
		{ property: 'og:title', content: `Changelog · ${yearParam} | ${APP_NAME}` },
		{ property: 'og:description', content: description },
		{ property: 'og:type', content: 'website' },
	];
};
