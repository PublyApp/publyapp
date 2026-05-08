import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';

import { MotionViewport } from '#app/components/animate/motion-viewport.tsx';
import { varFade } from '#app/components/animate/variants/index.ts';
import { Image } from '#app/components/image/image.tsx';
import { MarketingEyebrow } from '#app/routes/marketing/_components/marketing-eyebrow.tsx';
import { unsplashCover } from '#app/routes/marketing/_data/blog.ts';

// ----------------------------------------------------------------------

type FeatureScreenshotProps = {
	id?: string;
	eyebrow: string;
	title: string;
	imageSlug: string;
	imageAlt: string;
	mockupUrl: string;
};

// ----------------------------------------------------------------------

// macOS-style window controls — three colored dots in the title bar.
const WindowDot = ({ color }: { color: string }) => {
	return (
		<Box
			sx={{
				width: 12,
				height: 12,
				borderRadius: '50%',
				bgcolor: color,
			}}
		/>
	);
};

// ----------------------------------------------------------------------

// Full-bleed gradient band wrapping a centered eyebrow + title + a wide
// browser-chrome mockup. The screenshot itself is rendered through the
// `<Image>` primitive at 16:9; the `<img>` use here is *only* for the
// chrome wrapper, not for content imagery.
export const FeatureScreenshot = ({
	id,
	eyebrow,
	title,
	imageSlug,
	imageAlt,
	mockupUrl,
}: FeatureScreenshotProps) => {
	const screenshotUrl = unsplashCover(imageSlug, { w: 1600, h: 900 });

	return (
		<Box
			id={id}
			component="section"
			sx={(theme) => ({
				py: { xs: 8, md: 12 },
				background: `linear-gradient(180deg, ${theme.vars.palette.background.default} 0%, ${theme.vars.palette.background.neutral} 100%)`,
				overflow: 'hidden',
			})}
		>
			<Container maxWidth="lg" component={MotionViewport}>
				<Stack
					component={m.div}
					variants={varFade('inUp', { distance: 24 })}
					spacing={2}
					sx={{
						alignItems: 'center',
						textAlign: 'center',
						mb: { xs: 6, md: 8 },
						maxWidth: 720,
						mx: 'auto',
					}}
				>
					<MarketingEyebrow label={eyebrow} />
					<Typography
						component="h2"
						sx={{
							fontSize: { xs: 28, md: 44 },
							fontWeight: 700,
							lineHeight: 1.15,
							letterSpacing: '-0.02em',
							color: 'text.primary',
						}}
					>
						{title}
					</Typography>
				</Stack>

				<Box
					component={m.div}
					variants={varFade('inUp', { distance: 24 })}
					sx={{
						maxWidth: 1000,
						mx: 'auto',
						borderRadius: '16px',
						overflow: 'hidden',
						border: '1px solid',
						borderColor: 'divider',
						bgcolor: 'background.paper',
						boxShadow: '0 30px 60px -15px rgba(0,0,0,0.15)',
					}}
				>
					{/* Chrome bar */}
					<Stack
						direction="row"
						spacing={1}
						alignItems="center"
						sx={{
							px: 2,
							py: 1.5,
							borderBottom: '1px solid',
							borderColor: 'divider',
							bgcolor: 'background.neutral',
						}}
					>
						<WindowDot color="#FF5F56" />
						<WindowDot color="#FFBD2E" />
						<WindowDot color="#27C93F" />
						<Typography
							sx={{
								flex: 1,
								textAlign: 'center',
								fontFamily: 'monospace',
								fontSize: 11,
								color: 'text.disabled',
							}}
						>
							{mockupUrl}
						</Typography>
						{/* Phantom spacer to keep the URL visually centered against
						    the dots on the left */}
						<Box sx={{ width: 60 }} />
					</Stack>

					{/* Screenshot — Image primitive enforces the 16:9 ratio for SSR */}
					<Image
						src={screenshotUrl}
						alt={imageAlt}
						ratio="16/9"
						sx={{ width: 1, display: 'block' }}
					/>
				</Box>
			</Container>
		</Box>
	);
};
