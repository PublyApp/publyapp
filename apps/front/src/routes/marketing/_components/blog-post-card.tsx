import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import {
	asHoverRoot,
	hoverLift,
	hoverPadCollapse,
	hoverZoom,
} from '#app/components/animate/variants/index.ts';
import { Image } from '#app/components/image/image.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import {
	BLOG_AUTHORS,
	type BlogPost,
	BLOG_TAGS,
	unsplashCover,
} from '#app/routes/marketing/_data/blog.ts';

// ----------------------------------------------------------------------

export type BlogPostCardVariant = 'standard' | 'featured' | 'compact';

type BlogPostCardProps = {
	post: BlogPost;
	variant?: BlogPostCardVariant;
};

// ----------------------------------------------------------------------

// Cover dimensions per variant. The <Image ratio="..."> prop drives the
// rendered aspect; the URL `w`/`h` ensures we don't fetch a 1600px hero
// for a 200px thumbnail.
const COVER_PRESETS: Record<
	BlogPostCardVariant,
	{ ratio: '16/9' | '16/10' | '2/1' | '1/1'; w: number; h: number }
> = {
	standard: { ratio: '16/10', w: 600, h: 375 },
	featured: { ratio: '2/1', w: 1080, h: 540 },
	compact: { ratio: '1/1', w: 200, h: 200 },
};

// Title hover affordance — base sx applied to every card title.
// `text-decoration-color: transparent` at rest + `currentColor` on hover
// makes the underline appear/disappear instantly. Per request: NO transition
// on the underline itself; only the color shift fades. This avoids the
// "fading underline" feel and keeps the hover feedback crisp.
const TITLE_HOVER_SX = {
	textDecoration: 'underline',
	textDecorationColor: 'transparent',
	textUnderlineOffset: '4px',
	textDecorationThickness: '2px',
	transition: 'color 200ms ease',
} as const;

// All hover-state animation comes from the shared preset library
// (`#app/components/animate` → `hoverLift` / `hoverZoom` / `hoverPadCollapse`).
// On the standard card three layers move in concert:
//   - card root → hoverLift (translateY + scale)
//   - cover wrapper inset → animated `top/left/right` 16 → 0
//     (NOT the shared `hoverPadCollapse` preset: animating real padding
//      reflows the wrapper height and shifts every card below; instead
//      we lock the wrapper height with aspect-ratio and animate the
//      absolutely-positioned inner cover's inset, which is layout-stable.)
//   - inner image → hoverZoom (scale 1 → 1.06 inside the rounded crop)
// The featured-card variant uses a smaller hoverLift + a static cover.
//
// Spring shapes + default values live in `variants/hover.ts`. Override only
// when the visual contract calls for it (the standard card uses default
// values; the featured card asks for a gentler lift).
const STANDARD_LIFT = hoverLift();
const FEATURED_LIFT = hoverLift({ y: -6, scale: 1.01 });
const COVER_ZOOM = hoverZoom();
// Reuse the canonical pad-collapse spring shape for the inset animation;
// only the transition is consumed (variants are inline since the property
// being animated is `top/left/right`, not `padding`).
const COVER_INSET_TRANSITION = hoverPadCollapse().transition;

// ----------------------------------------------------------------------

const formatPostDate = (iso: string): string => {
	return new Date(iso).toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	});
};

const tagLabel = (value: BlogPost['tag']): string => {
	return BLOG_TAGS.find((t) => t.value === value)?.label ?? value;
};

// ----------------------------------------------------------------------

const TagPill = ({ tag }: { tag: BlogPost['tag'] }) => {
	const isBrand = tag === 'growth';

	return (
		<Box
			component="span"
			sx={{
				display: 'inline-flex',
				alignItems: 'center',
				px: '10px',
				py: '3px',
				borderRadius: '6px',
				fontSize: 11,
				fontWeight: 600,
				letterSpacing: '0.05em',
				textTransform: 'uppercase',
				bgcolor: isBrand ? 'rgba(16,185,129,0.10)' : 'background.neutral',
				color: isBrand ? '#0d9467' : 'text.secondary',
				border: '1px solid',
				borderColor: isBrand ? 'rgba(16,185,129,0.20)' : 'transparent',
			}}
		>
			{tagLabel(tag)}
		</Box>
	);
};

const ByLine = ({
	post,
	avatarSize = 34,
}: {
	post: BlogPost;
	avatarSize?: number;
}) => {
	const author = BLOG_AUTHORS[post.authorId];

	return (
		<Stack direction="row" spacing={1.5} alignItems="center">
			<Image
				src={author.photoUrl}
				alt={author.name}
				ratio="1/1"
				sx={{
					width: avatarSize,
					flexShrink: 0,
					borderRadius: '50%',
					overflow: 'hidden',
					bgcolor: 'background.neutral',
					border: '2px solid',
					borderColor: 'background.paper',
					boxShadow: '0 0 0 1px rgba(17,24,39,0.06)',
				}}
			/>
			<Stack spacing={0.25}>
				<Typography
					sx={{
						fontSize: 13,
						fontWeight: 600,
						color: 'text.primary',
						lineHeight: 1.2,
					}}
				>
					{author.name}
				</Typography>
				<Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
					{formatPostDate(post.publishedAt)} · {post.readingMinutes} min read
				</Typography>
			</Stack>
		</Stack>
	);
};

// ----------------------------------------------------------------------

// Cover wrapper. Two modes:
// - `cardEdge` (standard card): at rest the cover sits in a 16px inset
//   with rounded corners. On parent-card hover it expands to fill the
//   card width and the corners morph to align with the card's outer
//   24px curve at the top and sit flush against the title block at
//   the bottom.
// - default (featured-card variant): static rounded crop, no expansion.
//
// Both modes share the same inner zoom: image scales 1 → 1.06 on parent
// hover via cascading framer variants.
//
// IMPORTANT (cardEdge): the OUTER wrapper has a fixed `aspectRatio` so
// its rendered height stays constant whether the inset is animating or
// not. The previous implementation animated `padding` directly on the
// wrapper, which made the inner image (and therefore the wrapper, via
// content sizing) ~4px taller on hover and shifted every card in the
// row downwards. With aspect-ratio locked + the inset cover absolutely
// positioned, the hover animates only the inner cover's `top/left/right`
// — no layout reflow on neighbors below.
const CoverWrap = ({
	src,
	alt,
	ratio,
	radius = '16px',
	cardEdge = false,
}: {
	src: string;
	alt: string;
	ratio: '16/9' | '16/10' | '2/1' | '1/1';
	radius?: string;
	cardEdge?: boolean;
}) => {
	if (cardEdge) {
		// CSS aspect-ratio uses space-separated form: '16/10' → '16 / 10'.
		const aspectRatioCSS = ratio.replace('/', ' / ');

		return (
			<Box
				sx={{
					position: 'relative',
					width: '100%',
					aspectRatio: aspectRatioCSS,
				}}
			>
				<Box
					component={m.div}
					variants={{
						rest: { top: 16, left: 16, right: 16 },
						hover: { top: 0, left: 0, right: 0 },
					}}
					transition={COVER_INSET_TRANSITION}
					sx={{
						position: 'absolute',
						bottom: 0,
						overflow: 'hidden',
						borderRadius: '16px',
					}}
				>
					<Box
						component={m.div}
						{...COVER_ZOOM}
						sx={{
							width: '100%',
							height: '100%',
							transformOrigin: 'center center',
							willChange: 'transform',
						}}
					>
						<Box
							component="img"
							src={src}
							alt={alt}
							sx={{
								display: 'block',
								width: '100%',
								height: '100%',
								objectFit: 'cover',
							}}
						/>
					</Box>
				</Box>
			</Box>
		);
	}

	return (
		<Box
			sx={{
				borderRadius: radius,
				overflow: 'hidden',
				display: 'block',
			}}
		>
			<Box
				component={m.div}
				{...COVER_ZOOM}
				sx={{
					display: 'block',
					transformOrigin: 'center center',
					willChange: 'transform',
				}}
			>
				<Image src={src} alt={alt} ratio={ratio} />
			</Box>
		</Box>
	);
};

// ----------------------------------------------------------------------

export const BlogPostCard = ({
	post,
	variant = 'standard',
}: BlogPostCardProps) => {
	const cover = COVER_PRESETS[variant];
	const coverUrl = unsplashCover(post.coverSlug, { w: cover.w, h: cover.h });

	if (variant === 'featured') {
		return (
			<Box
				component={m.div}
				{...asHoverRoot(FEATURED_LIFT)}
				sx={{
					position: 'relative',
					display: 'grid',
					gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
					gap: { xs: 3, md: 5 },
					alignItems: 'center',
					p: { xs: 3, md: 4 },
					borderRadius: '24px',
					bgcolor: 'background.paper',
					border: '1px solid',
					borderColor: 'divider',
					boxShadow: '0 1px 2px rgba(31,41,55,0.03)',
					transition: 'box-shadow 350ms ease',
					'&:hover': {
						boxShadow: '0 25px 50px -16px rgba(31,41,55,0.18)',
					},
					'&:hover .card-title': {
						color: 'text.secondary',
						textDecorationColor: 'currentColor',
					},
				}}
			>
				<CoverWrap
					src={coverUrl}
					alt={post.title}
					ratio={cover.ratio}
					radius="20px"
				/>
				<Stack spacing={2.5} alignItems="flex-start">
					<TagPill tag={post.tag} />
					<Typography
						component="h3"
						className="card-title"
						sx={{
							fontSize: { xs: 24, md: 32 },
							fontWeight: 700,
							color: 'text.primary',
							lineHeight: 1.2,
							letterSpacing: '-0.01em',
							...TITLE_HOVER_SX,
						}}
					>
						{/*
							Title carries the actual <a> for a11y, then ::before
							extends the click target to the entire card surface.
							Parent is `position: relative` so ::before fills it.
						*/}
						<Box
							component={RouterLink}
							href={FRONT_PATH_NAMES.marketing.blogArticle(post.slug)}
							sx={{
								color: 'inherit',
								textDecoration: 'inherit',
								'&::before': {
									content: '""',
									position: 'absolute',
									inset: 0,
									zIndex: 1,
								},
							}}
						>
							{post.title}
						</Box>
					</Typography>
					<Typography
						sx={{ fontSize: 16, color: 'text.secondary', lineHeight: 1.6 }}
					>
						{post.excerpt}
					</Typography>
					<ByLine post={post} avatarSize={40} />
				</Stack>
			</Box>
		);
	}

	if (variant === 'compact') {
		// Compact stays CSS-only — it's a sidebar/list-row component, motion
		// would feel out of place at this scale. Just the title affordance.
		return (
			<Box
				component={RouterLink}
				href={FRONT_PATH_NAMES.marketing.blogArticle(post.slug)}
				sx={{
					display: 'flex',
					gap: 2,
					alignItems: 'center',
					p: 2,
					borderRadius: '12px',
					textDecoration: 'none',
					color: 'inherit',
					transition: 'background-color 200ms ease',
					'&:hover': { bgcolor: 'background.neutral' },
					'&:hover .card-title': {
						color: 'text.secondary',
						textDecorationColor: 'currentColor',
					},
				}}
			>
				<Image
					src={coverUrl}
					alt={post.title}
					ratio={cover.ratio}
					sx={{
						width: 64,
						flexShrink: 0,
						borderRadius: '8px',
						overflow: 'hidden',
					}}
				/>
				<Stack spacing={0.5} sx={{ minWidth: 0 }}>
					<Typography
						className="card-title"
						sx={{
							fontSize: 13,
							fontWeight: 700,
							color: 'text.primary',
							lineHeight: 1.3,
							display: '-webkit-box',
							WebkitLineClamp: 2,
							WebkitBoxOrient: 'vertical',
							overflow: 'hidden',
							...TITLE_HOVER_SX,
						}}
					>
						{post.title}
					</Typography>
					<Typography sx={{ fontSize: 11, color: 'text.secondary' }}>
						{formatPostDate(post.publishedAt)} · {post.readingMinutes} min read
					</Typography>
				</Stack>
			</Box>
		);
	}

	// standard — framer-motion orchestrated, mirrors the PricingTierCard
	// idiom (m.div + spring `whileHover`). The whole card rides one spring;
	// the cover rides a slightly slower one with mass:0.7, so the photo
	// settles a beat after the card lifts — gives the hover a layered,
	// weighted feel instead of one flat scale.
	//
	// Card itself is NOT a link (you can't compose RouterLink with motion's
	// hover variants cleanly without losing client-side nav). Instead, the
	// title wraps a RouterLink whose ::before pseudo-element extends the
	// click target to the entire card surface — the modern accessible
	// "card with link" pattern. Parent is `position: relative` so the
	// pseudo fills it.
	return (
		<Box
			component={m.div}
			{...asHoverRoot(STANDARD_LIFT)}
			sx={{
				position: 'relative',
				display: 'flex',
				flexDirection: 'column',
				borderRadius: '24px',
				bgcolor: 'background.paper',
				border: '1px solid',
				borderColor: 'divider',
				// Card clips the cover's top corners to its own 24px curve
				// (cover has no border-radius of its own in `cardEdge` mode).
				overflow: 'hidden',
				boxShadow: '0 1px 2px rgba(31,41,55,0.03)',
				transition: 'box-shadow 350ms ease',
				'&:hover': {
					boxShadow: '0 25px 50px -16px rgba(31,41,55,0.18)',
				},
				'&:hover .card-title': {
					color: 'text.secondary',
					textDecorationColor: 'currentColor',
				},
			}}
		>
			<CoverWrap src={coverUrl} alt={post.title} ratio={cover.ratio} cardEdge />
			<Stack
				spacing={0}
				alignItems="flex-start"
				sx={{
					p: { xs: 3, md: 3.5 },
					flex: 1,
					justifyContent: 'space-between',
				}}
			>
				<Stack spacing={1.5} alignItems="flex-start" sx={{ width: '100%' }}>
					<TagPill tag={post.tag} />
					<Typography
						component="h3"
						className="card-title"
						sx={{
							fontSize: { xs: 19, md: 21 },
							fontWeight: 700,
							color: 'text.primary',
							lineHeight: 1.35,
							letterSpacing: '-0.01em',
							display: '-webkit-box',
							WebkitLineClamp: 2,
							WebkitBoxOrient: 'vertical',
							overflow: 'hidden',
							...TITLE_HOVER_SX,
						}}
					>
						<Box
							component={RouterLink}
							href={FRONT_PATH_NAMES.marketing.blogArticle(post.slug)}
							sx={{
								color: 'inherit',
								textDecoration: 'inherit',
								// ::before extends the click target to the whole card.
								'&::before': {
									content: '""',
									position: 'absolute',
									inset: 0,
									zIndex: 1,
								},
							}}
						>
							{post.title}
						</Box>
					</Typography>
					<Typography
						sx={{
							fontSize: 14,
							color: 'text.secondary',
							lineHeight: 1.6,
							display: '-webkit-box',
							WebkitLineClamp: 2,
							WebkitBoxOrient: 'vertical',
							overflow: 'hidden',
						}}
					>
						{post.excerpt}
					</Typography>
				</Stack>
				<Box sx={{ mt: 4, width: '100%' }}>
					<ByLine post={post} />
				</Box>
			</Stack>
		</Box>
	);
};
