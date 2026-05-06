import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';
import { parseAsStringEnum, useQueryState } from 'nuqs';

import { APP_NAME, FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { hoverZoom } from '#app/components/animate/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { Image } from '#app/components/image/image.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import {
	BlogPostCard,
	type BlogPostCardVariant,
} from '#app/routes/marketing/_components/blog-post-card.tsx';
import { CtaBand } from '#app/routes/marketing/_components/cta-band.tsx';
import { MarketingEyebrow } from '#app/routes/marketing/_components/marketing-eyebrow.tsx';
import {
	BLOG_AUTHORS,
	type BlogPost,
	type BlogTag,
	BLOG_TAGS,
	getPublishedPosts,
	unsplashCover,
} from '#app/routes/marketing/_data/blog.ts';

// ----------------------------------------------------------------------

const TAG_VALUES = BLOG_TAGS.map((t) => t.value) as BlogTag[];

// ----------------------------------------------------------------------

// Same hover-zoom preset as BlogPostCard's cover — keeps the cover hover
// feel consistent across the index surface. Slightly tighter scale (1.05
// vs default 1.06) since the featured cover is bigger.
const FEATURED_COVER_ZOOM = hoverZoom({ scale: 1.05 });

const FeaturedHero = ({ post }: { post: BlogPost }) => {
	const author = BLOG_AUTHORS[post.authorId];
	const coverUrl = unsplashCover(post.coverSlug, { w: 1200, h: 750 });

	return (
		<Container
			maxWidth="lg"
			sx={{ pt: { xs: 8, md: 14 }, pb: { xs: 6, md: 10 } }}
		>
			{/*
				Whole featured region is one motion wrapper. Hovering ANYWHERE
				on it (cover OR text column) triggers both the cover scale
				(via the cascading `hover` variant) AND the title color/underline
				(via the parent's `&:hover .featured-title` selector).

				A single absolute RouterLink overlay covers the grid as the
				click target — keeps client-side nav without nesting links
				inside the title. The "Read article" CTA stays clickable on
				its own via `position: relative; zIndex: 2`.
			*/}
			<Box
				component={m.div}
				// Outer wrapper owns the hover state. Children with hover variants
				// (cover) cascade automatically; CSS `&:hover .featured-title` drives
				// the title color/underline so it fires in lockstep.
				initial="rest"
				animate="rest"
				whileHover="hover"
				sx={{
					position: 'relative',
					display: 'grid',
					gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
					gap: { xs: 5, md: 8, lg: 12 },
					alignItems: 'center',
					'&:hover .featured-title': {
						color: 'text.secondary',
						textDecorationColor: 'currentColor',
					},
				}}
			>
				{/* Left: cover (no longer a link itself — overlay handles clicks) */}
				<Box
					sx={{
						position: 'relative',
						borderRadius: { xs: '24px', lg: '32px' },
						overflow: 'hidden',
						boxShadow: '0 20px 40px -15px rgba(17,24,39,0.10)',
						border: '1px solid',
						borderColor: 'divider',
					}}
				>
					<Box
						component={m.div}
						{...FEATURED_COVER_ZOOM}
						sx={{
							display: 'block',
							transformOrigin: 'center center',
							willChange: 'transform',
						}}
					>
						<Image src={coverUrl} alt={post.title} ratio="16/10" />
					</Box>
				</Box>

				{/* Right: content */}
				<Stack spacing={3} alignItems="flex-start">
					<MarketingEyebrow label="Featured" />

					{/*
						Title is just Typography (no wrapping RouterLink) — the
						overlay below carries the link semantics. Underline +
						color hover-state is driven by the parent wrapper's
						`&:hover .featured-title` selector so it fires in lockstep
						with the cover scale.
					*/}
					<Typography
						component="h1"
						className="featured-title"
						sx={{
							fontSize: { xs: 32, md: 40, lg: 48 },
							fontWeight: 700,
							color: 'text.primary',
							lineHeight: 1.1,
							letterSpacing: '-0.025em',
							// Only color fades; underline appears instantly when
							// text-decoration-color flips (no transition on it).
							transition: 'color 200ms ease',
							textDecoration: 'underline',
							textDecorationColor: 'transparent',
							textUnderlineOffset: '6px',
							textDecorationThickness: '2px',
						}}
					>
						{post.title}
					</Typography>

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
						<Image
							src={author.photoUrl}
							alt={author.name}
							ratio="1/1"
							sx={{
								width: 40,
								flexShrink: 0,
								borderRadius: '50%',
								overflow: 'hidden',
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
							// position: relative + zIndex above the overlay so this
							// CTA still receives its own click + hover.
							position: 'relative',
							zIndex: 2,
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

				{/* Single click overlay covering the whole featured grid */}
				<Box
					component={RouterLink}
					href={`/blog/${post.slug}`}
					aria-label={post.title}
					sx={{ position: 'absolute', inset: 0, zIndex: 1 }}
				/>
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

// Two empty-state shapes:
// - "tag" → user filtered to a tag with zero posts; offer "show all" reset
// - "all" → catalogue is genuinely empty (every post unpublished); no reset
//   button (clearing the filter wouldn't change anything)
type EmptyStateProps =
	| { variant: 'tag'; tagLabel: string; onReset: () => void }
	| { variant: 'all' };

const EmptyState = (props: EmptyStateProps) => {
	const isTag = props.variant === 'tag';

	return (
		<Stack
			spacing={2.5}
			alignItems="center"
			sx={{
				py: { xs: 8, md: 12 },
				px: 4,
				textAlign: 'center',
				borderRadius: '24px',
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
					color: 'text.secondary',
					bgcolor: 'background.paper',
					border: '1px solid',
					borderColor: 'divider',
				}}
			>
				<Iconify
					icon={isTag ? 'ph:tag-bold' : 'ph:file-text-bold'}
					width={24}
				/>
			</Box>
			<Typography sx={{ fontSize: 18, fontWeight: 700, color: 'text.primary' }}>
				{isTag ? `No posts tagged "${props.tagLabel}" yet` : 'No posts yet'}
			</Typography>
			<Typography sx={{ fontSize: 14, color: 'text.secondary', maxWidth: 420 }}>
				{isTag
					? "We haven't published in this category yet. Check back soon, or browse another tag."
					: "We're still warming up the press. New posts will land here soon — come back in a week."}
			</Typography>
			{isTag ? (
				<Box
					component="button"
					type="button"
					onClick={props.onReset}
					sx={{
						mt: 1,
						display: 'inline-flex',
						alignItems: 'center',
						gap: 1,
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
					<Iconify icon="ph:arrow-left-bold" width={14} />
					Show all posts
				</Box>
			) : null}
		</Stack>
	);
};

// ----------------------------------------------------------------------

// Renders the body section between the filter pills and the bottom CTA.
// A proper component (not a `renderXxx` helper called from JSX) so React
// reconciles it correctly across re-renders. Three branches read as a flat
// if/else chain instead of nested JSX ternaries (oxlint `no-nested-ternary`).
const IndexBody = ({
	catalogueIsEmpty,
	visiblePosts,
	activeTagLabel,
	onResetTag,
}: {
	catalogueIsEmpty: boolean;
	visiblePosts: BlogPost[];
	activeTagLabel: string;
	onResetTag: () => void;
}) => {
	if (catalogueIsEmpty) {
		return <EmptyState variant="all" />;
	}

	if (visiblePosts.length === 0) {
		return (
			<EmptyState
				variant="tag"
				tagLabel={activeTagLabel}
				onReset={onResetTag}
			/>
		);
	}

	return (
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
			{visiblePosts.map((post, index) => {
				// Cycle through variants so all 3 cover treatments are visible
				// on the same page for visual review:
				//   - position 3 → `featured` (full-row 2-col)
				//   - position 6 → `compact` (slim horizontal row)
				//   - everything else → `standard`
				// `featured` and `compact` span all 3 grid columns so the row
				// layout doesn't leave gaps; `standard` stays 1 col.
				// Once you've picked the variant you want for production,
				// drop this back to `variant="standard"` for every card.
				let variant: BlogPostCardVariant = 'standard';
				if (index === 3) {
					variant = 'featured';
				} else if (index === 6) {
					variant = 'compact';
				}
				const spanFullRow = variant === 'featured' || variant === 'compact';

				return (
					<Box
						key={post.slug}
						sx={spanFullRow ? { gridColumn: { md: '1 / -1' } } : undefined}
					>
						<BlogPostCard post={post} variant={variant} />
					</Box>
				);
			})}
		</Box>
	);
};

// ----------------------------------------------------------------------

const BlogIndexPage = () => {
	const [activeTag, setActiveTag] = useQueryState(
		'tag',
		parseAsStringEnum<BlogTag>(TAG_VALUES),
	);

	// Single source of truth: respect `published !== false` everywhere on this
	// page so the toggle in `_data/blog.ts` controls visibility globally.
	const publishedPosts = getPublishedPosts();
	const featuredPost = publishedPosts.find((p) => p.featured === true);

	// Featured stays in its own slot above the grid and is intentionally NOT
	// filtered by the active tag — it's an editorial pick, not a tag entry.
	// Grid posts always exclude the featured one (no duplication).
	const gridPosts = publishedPosts.filter((p) => p.featured !== true);
	const visiblePosts = activeTag
		? gridPosts.filter((p) => p.tag === activeTag)
		: gridPosts;

	const activeTagLabel =
		BLOG_TAGS.find((t) => t.value === activeTag)?.label ?? '';

	// True only when the catalogue itself is empty (nothing published at all).
	// In that case we drop the filter pills too — there's nothing to filter.
	const catalogueIsEmpty = publishedPosts.length === 0;

	return (
		<>
			{featuredPost ? <FeaturedHero post={featuredPost} /> : null}

			<Container maxWidth="lg" sx={{ pb: { xs: 10, md: 16 } }}>
				{!catalogueIsEmpty ? (
					<Box sx={{ mb: { xs: 4, md: 6 } }}>
						<FilterPills activeTag={activeTag} onChange={setActiveTag} />
					</Box>
				) : null}

				<IndexBody
					catalogueIsEmpty={catalogueIsEmpty}
					visiblePosts={visiblePosts}
					activeTagLabel={activeTagLabel}
					onResetTag={() => setActiveTag(null)}
				/>
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
