import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { parseAsStringEnum, useQueryState } from 'nuqs';

import { APP_NAME, FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { Image } from '#app/components/image/image.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import { BlogPostCard } from '#app/routes/marketing/_components/blog-post-card.tsx';
import { CtaBand } from '#app/routes/marketing/_components/cta-band.tsx';
import { MarketingEyebrow } from '#app/routes/marketing/_components/marketing-eyebrow.tsx';
import {
	BLOG_AUTHORS,
	type BlogPost,
	type BlogTag,
	BLOG_POSTS,
	BLOG_TAGS,
	unsplashCover,
} from '#app/routes/marketing/_data/blog.ts';

// ----------------------------------------------------------------------

const TAG_VALUES = BLOG_TAGS.map((t) => t.value) as BlogTag[];

// ----------------------------------------------------------------------

const FeaturedHero = ({ post }: { post: BlogPost }) => {
	const author = BLOG_AUTHORS[post.authorId];
	const coverUrl = unsplashCover(post.coverSlug, { w: 1200, h: 750 });

	return (
		<Container
			maxWidth="lg"
			sx={{ pt: { xs: 8, md: 14 }, pb: { xs: 6, md: 10 } }}
		>
			<Box
				sx={{
					display: 'grid',
					gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
					gap: { xs: 5, md: 8, lg: 12 },
					alignItems: 'center',
				}}
			>
				{/* Left: cover */}
				<Box
					component={RouterLink}
					href={`/blog/${post.slug}`}
					sx={{
						display: 'block',
						borderRadius: { xs: '24px', lg: '32px' },
						overflow: 'hidden',
						boxShadow: '0 20px 40px -15px rgba(17,24,39,0.10)',
						border: '1px solid',
						borderColor: 'divider',
						'& img': {
							transition: 'transform 600ms cubic-bezier(0.16, 1, 0.3, 1)',
						},
						'&:hover img': { transform: 'scale(1.05)' },
					}}
				>
					<Image src={coverUrl} alt={post.title} ratio="16/10" />
				</Box>

				{/* Right: content */}
				<Stack spacing={3} alignItems="flex-start">
					<MarketingEyebrow label="Featured" />

					<Box
						component={RouterLink}
						href={`/blog/${post.slug}`}
						sx={{ textDecoration: 'none', color: 'inherit' }}
					>
						<Typography
							component="h1"
							sx={{
								fontSize: { xs: 32, md: 40, lg: 48 },
								fontWeight: 700,
								color: 'text.primary',
								lineHeight: 1.1,
								letterSpacing: '-0.025em',
								transition: 'color 240ms ease',
								'&:hover': { color: 'primary.main' },
							}}
						>
							{post.title}
						</Typography>
					</Box>

					<Typography
						sx={{
							fontSize: { xs: 16, md: 18 },
							color: 'text.secondary',
							lineHeight: 1.6,
							maxWidth: 560,
						}}
					>
						{post.excerpt}
					</Typography>

					{/* Byline with horizontal divider above */}
					<Stack
						direction="row"
						spacing={2}
						alignItems="center"
						sx={{
							pt: 3,
							borderTop: '1px solid',
							borderTopColor: 'divider',
							width: '100%',
							maxWidth: 480,
						}}
					>
						<Box
							component="img"
							src={author.photoUrl}
							alt={author.name}
							loading="lazy"
							sx={{
								width: 40,
								height: 40,
								borderRadius: '50%',
								objectFit: 'cover',
								bgcolor: 'background.neutral',
								border: '2px solid',
								borderColor: 'background.paper',
								boxShadow: '0 0 0 1px rgba(17,24,39,0.05)',
							}}
						/>
						<Stack spacing={0}>
							<Typography
								sx={{ fontSize: 14, fontWeight: 700, color: 'text.primary' }}
							>
								{author.name}
							</Typography>
							<Stack
								direction="row"
								spacing={1}
								alignItems="center"
								sx={{ fontSize: 12, color: 'text.secondary' }}
							>
								<Box component="span">{author.role}</Box>
								<Box
									component="span"
									sx={{
										width: 4,
										height: 4,
										borderRadius: '50%',
										bgcolor: 'divider',
									}}
								/>
								<Box component="span">{post.readingMinutes} min read</Box>
							</Stack>
						</Stack>
					</Stack>

					<Box
						component={RouterLink}
						href={`/blog/${post.slug}`}
						sx={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: 1,
							color: 'primary.main',
							fontSize: 15,
							fontWeight: 700,
							textDecoration: 'none',
							transition: 'transform 240ms ease',
							'&:hover': { transform: 'translateY(-1px)' },
							'& .arrow': { transition: 'transform 240ms ease' },
							'&:hover .arrow': { transform: 'translateX(4px)' },
						}}
					>
						Read article
						<Iconify icon="ph:arrow-right-bold" width={14} className="arrow" />
					</Box>
				</Stack>
			</Box>
		</Container>
	);
};

// ----------------------------------------------------------------------

const FilterPill = ({
	label,
	active,
	onClick,
}: {
	label: string;
	active: boolean;
	onClick: () => void;
}) => {
	return (
		<Box
			component="button"
			type="button"
			onClick={onClick}
			aria-pressed={active}
			sx={{
				whiteSpace: 'nowrap',
				display: 'inline-flex',
				alignItems: 'center',
				px: 2.5,
				py: 1.25,
				borderRadius: 999,
				fontSize: 14,
				fontWeight: 500,
				cursor: 'pointer',
				border: '1px solid',
				borderColor: active ? 'primary.main' : 'divider',
				bgcolor: active ? 'primary.main' : 'background.paper',
				color: active ? 'common.white' : 'text.secondary',
				boxShadow: active ? '0 10px 30px 0 rgba(16,185,129,0.3)' : 'none',
				transition:
					'background-color 240ms ease, color 240ms ease, border-color 240ms ease, transform 240ms ease',
				'&:hover': {
					bgcolor: active ? 'primary.main' : 'background.neutral',
					color: active ? 'common.white' : 'text.primary',
				},
				'&:focus-visible': {
					outline: '2px solid',
					outlineColor: 'primary.main',
					outlineOffset: '2px',
				},
			}}
		>
			{label}
		</Box>
	);
};

const FilterPills = ({
	activeTag,
	onChange,
}: {
	activeTag: BlogTag | null;
	onChange: (next: BlogTag | null) => void;
}) => {
	return (
		<Box
			sx={{
				display: 'flex',
				alignItems: 'center',
				overflowX: { xs: 'auto', sm: 'visible' },
				flexWrap: { xs: 'nowrap', sm: 'wrap' },
				gap: 1.5,
				pb: { xs: 2, sm: 0 },
				mx: { xs: -2, sm: 0 },
				px: { xs: 2, sm: 0 },
				// Hide scrollbar on mobile horizontal scroll
				scrollbarWidth: 'none',
				'&::-webkit-scrollbar': { display: 'none' },
			}}
			role="group"
			aria-label="Filter posts by category"
		>
			<FilterPill
				label="All"
				active={activeTag === null}
				onClick={() => onChange(null)}
			/>
			{BLOG_TAGS.map((tag) => (
				<FilterPill
					key={tag.value}
					label={tag.label}
					active={activeTag === tag.value}
					onClick={() => onChange(tag.value)}
				/>
			))}
		</Box>
	);
};

// ----------------------------------------------------------------------

const EmptyState = ({ onReset }: { onReset: () => void }) => {
	return (
		<Stack spacing={3} alignItems="center" sx={{ py: 8, textAlign: 'center' }}>
			<Typography sx={{ fontSize: 16, color: 'text.secondary' }}>
				No posts in this category yet — check back soon.
			</Typography>
			<Box
				component="button"
				type="button"
				onClick={onReset}
				sx={{
					display: 'inline-flex',
					alignItems: 'center',
					px: 3,
					py: 1.5,
					borderRadius: 2,
					fontSize: 14,
					fontWeight: 700,
					cursor: 'pointer',
					border: 'none',
					bgcolor: 'primary.main',
					color: 'common.white',
					transition: 'transform 240ms ease',
					'&:hover': { transform: 'translateY(-2px)' },
					'&:focus-visible': {
						outline: '2px solid',
						outlineColor: 'primary.main',
						outlineOffset: '2px',
					},
				}}
			>
				Show all
			</Box>
		</Stack>
	);
};

// ----------------------------------------------------------------------

const BlogIndexPage = () => {
	const [activeTag, setActiveTag] = useQueryState(
		'tag',
		parseAsStringEnum<BlogTag>(TAG_VALUES),
	);

	const featuredPost = BLOG_POSTS.find((p) => p.featured === true);

	const visiblePosts = activeTag
		? BLOG_POSTS.filter((p) => p.tag === activeTag)
		: BLOG_POSTS.filter((p) => p.featured !== true);

	return (
		<>
			{activeTag === null && featuredPost ? (
				<FeaturedHero post={featuredPost} />
			) : null}

			<Container maxWidth="lg" sx={{ pb: { xs: 10, md: 16 } }}>
				<Box sx={{ mb: { xs: 4, md: 6 } }}>
					<FilterPills activeTag={activeTag} onChange={setActiveTag} />
				</Box>

				{visiblePosts.length === 0 ? (
					<EmptyState onReset={() => setActiveTag(null)} />
				) : (
					<Box
						sx={{
							display: 'grid',
							gridTemplateColumns: {
								xs: '1fr',
								sm: 'repeat(2, 1fr)',
								md: 'repeat(3, 1fr)',
							},
							gap: { xs: 3, lg: 4 },
						}}
					>
						{visiblePosts.map((post) => (
							<BlogPostCard key={post.slug} post={post} variant="standard" />
						))}
					</Box>
				)}
			</Container>

			<CtaBand
				eyebrowLabel="Get started"
				title={'Try PublyApp free\nfor 14 days'}
				subhead="Put your social execution on autopilot and turn your audience into actual advocates."
				ctaLabel="Start for Free"
				ctaHref={FRONT_PATH_NAMES.auth.signup}
				microcopy="14-day free trial. No credit card required."
			/>
		</>
	);
};

export default BlogIndexPage;

// ----------------------------------------------------------------------

export const meta = () => [
	{ title: `Blog | ${APP_NAME}` },
	{
		name: 'description',
		content: 'Stories, lessons, and product updates from the PublyApp team.',
	},
	{ property: 'og:title', content: `Blog | ${APP_NAME}` },
	{
		property: 'og:description',
		content: 'Stories, lessons, and product updates from the PublyApp team.',
	},
];
