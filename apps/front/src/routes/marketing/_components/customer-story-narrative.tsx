import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

import {
	BLOG_H2_SX,
	BLOG_P_SX,
} from '#app/routes/marketing/_components/blog-article-page.tsx';
import type { CustomerStoryNarrativeBlock } from '#app/routes/marketing/_data/customer-stories.ts';

// ----------------------------------------------------------------------

// 2-column narrative + sticky sidebar layout for the customer-story
// template. Reuses the blog article's prose typography (`BLOG_H2_SX`,
// `BLOG_P_SX`) so customer stories and blog posts read identically.
//
// `midQuote` is rendered between narrative block index 1 and 2 (i.e.
// after "The Solution" in the canonical 4-block layout). Hardcoding the
// position keeps the data shape simple — when content authors need a
// different quote position, surface a `quotePosition` field on the data
// type, not a per-page override.

// ----------------------------------------------------------------------

type CustomerStoryNarrativeProps = {
	blocks: CustomerStoryNarrativeBlock[];
	aside: ReactNode;
	midQuote: ReactNode;
};

export const CustomerStoryNarrative = ({
	blocks,
	aside,
	midQuote,
}: CustomerStoryNarrativeProps) => {
	return (
		<Container
			id="story"
			maxWidth="lg"
			sx={{ pt: { xs: 4, md: 6 }, pb: { xs: 8, md: 12 } }}
		>
			<Box
				sx={{
					display: 'grid',
					gridTemplateColumns: { xs: '1fr', lg: '320px 1fr' },
					gap: { xs: 5, lg: 8 },
					alignItems: 'flex-start',
				}}
			>
				{/* Sidebar — sticky on lg+, regular flow under lg. The narrative
					comes second on `xs` so the prose leads on mobile. */}
				<Box
					component="aside"
					sx={{
						order: { xs: 2, lg: 1 },
						position: { xs: 'static', lg: 'sticky' },
						top: { lg: 'calc(var(--layout-header-desktop-height) + 32px)' },
						alignSelf: { lg: 'flex-start' },
					}}
				>
					{aside}
				</Box>

				{/* Main narrative column */}
				<Box
					component="article"
					sx={{
						order: { xs: 1, lg: 2 },
						minWidth: 0,
						maxWidth: { xs: '100%', lg: 720 },
					}}
				>
					{blocks.map((block, idx) => {
						return (
							<Box key={block.heading}>
								<Typography
									component="h2"
									sx={{
										...BLOG_H2_SX,
										// First block's h2 should not have BLOG_H2_SX's top
										// margin — the section already has top padding.
										...(idx === 0 ? { mt: 0 } : {}),
									}}
								>
									{block.heading}
								</Typography>
								{block.paragraphs.map((paragraph) => {
									return (
										<Typography
											key={paragraph.slice(0, 40)}
											sx={{ ...BLOG_P_SX, mb: 3 }}
										>
											{paragraph}
										</Typography>
									);
								})}
								{idx === 1 ? midQuote : null}
							</Box>
						);
					})}
				</Box>
			</Box>
		</Container>
	);
};
