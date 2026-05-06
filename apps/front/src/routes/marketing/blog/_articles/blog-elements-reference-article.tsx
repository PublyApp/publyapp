import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

import {
	BLOG_H2_SX,
	BLOG_P_SX,
	BlogArticlePage,
	type TocItem,
} from '#app/routes/marketing/_components/blog-article-page.tsx';
import {
	BLOG_BLOCKQUOTE_SX,
	BLOG_CODE_INLINE_SX,
	BLOG_H3_SX,
	BLOG_H4_SX,
	BLOG_HR_SX,
	BLOG_LEAD_SX,
	BLOG_LINK_SX,
	BLOG_OL_SX,
	BLOG_UL_SX,
	BlogCallout,
	BlogCodeBlock,
	BlogFigure,
	BlogGallery,
	BlogPullQuote,
	BlogTable,
	BlogVideo,
	Token,
} from '#app/routes/marketing/_components/blog-content-elements.tsx';
import { BLOG_POSTS, unsplashCover } from '#app/routes/marketing/_data/blog.ts';

// ----------------------------------------------------------------------

const POST = BLOG_POSTS.find((p) => {
	return p.slug === 'blog-elements-reference';
});

if (!POST) {
	throw new Error(
		'BlogPost "blog-elements-reference" not found in BLOG_POSTS — slug mismatch with _data/blog.ts',
	);
}

const TOC_ITEMS: TocItem[] = [
	{ id: 'typography', label: 'Typography' },
	{ id: 'inline-formatting', label: 'Inline formatting' },
	{ id: 'lists', label: 'Lists' },
	{ id: 'code', label: 'Code blocks' },
	{ id: 'callouts', label: 'Callouts' },
	{ id: 'quotes', label: 'Quotes' },
	{ id: 'media', label: 'Media' },
	{ id: 'tables', label: 'Tables' },
	{ id: 'separators', label: 'Separators' },
];

// ----------------------------------------------------------------------

// `<ElementSpec>` — small reusable wrapper used throughout this reference
// article to label each example. Renders three things:
//   1. The element's symbolic name (monospace, primary tint)
//   2. A short prose description ("when to use it")
//   3. The actual element rendered below
// Keeps every spec entry visually consistent so the page reads like a
// catalog instead of a normal article.
const ElementSpec = ({
	name,
	when,
	children,
}: {
	name: string;
	when: ReactNode;
	children: ReactNode;
}) => {
	return (
		<Box
			sx={{
				mt: { xs: 4, md: 5 },
				pt: 3,
				borderTop: '1px dashed',
				borderTopColor: 'divider',
			}}
		>
			<Stack direction="row" alignItems="baseline" spacing={1.5} sx={{ mb: 1 }}>
				<Box
					component="code"
					sx={{
						fontFamily:
							'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
						fontSize: 13,
						fontWeight: 700,
						color: 'primary.main',
						bgcolor: 'rgba(16,185,129,0.08)',
						border: '1px solid rgba(16,185,129,0.20)',
						borderRadius: '6px',
						px: 1,
						py: '2px',
					}}
				>
					{name}
				</Box>
			</Stack>
			<Typography
				sx={{
					fontSize: 14,
					color: 'text.secondary',
					lineHeight: 1.6,
					mb: 2,
				}}
			>
				{when}
			</Typography>
			{children}
		</Box>
	);
};

// ----------------------------------------------------------------------
//
// SECTIONS — one named component per H2 to keep each focused and to
// avoid react-doctor's `no-giant-component` flag on the top-level
// reference component.
//
// ----------------------------------------------------------------------

const IntroSection = () => {
	return (
		<>
			<Typography sx={BLOG_LEAD_SX}>
				This is the live, labeled reference for every primitive available inside
				a blog article body. Each section names the element you'd import, says
				when to reach for it, and shows it rendered with placeholder content.
				Bookmark it.
			</Typography>

			<Typography sx={{ ...BLOG_P_SX, mt: 2 }}>
				All primitives live in{' '}
				<Box component="code" sx={BLOG_CODE_INLINE_SX}>
					apps/front/src/routes/marketing/_components/blog-content-elements.tsx
				</Box>
				. Typography sx presets like{' '}
				<Box component="code" sx={BLOG_CODE_INLINE_SX}>
					BLOG_H2_SX
				</Box>{' '}
				and{' '}
				<Box component="code" sx={BLOG_CODE_INLINE_SX}>
					BLOG_P_SX
				</Box>{' '}
				are exported from{' '}
				<Box component="code" sx={BLOG_CODE_INLINE_SX}>
					blog-article-page.tsx
				</Box>
				.
			</Typography>
		</>
	);
};

const TypographySection = () => {
	return (
		<>
			<Typography component="h2" id="typography" sx={BLOG_H2_SX}>
				Typography
			</Typography>

			<ElementSpec
				name="BLOG_LEAD_SX"
				when="The article's first 1–2 sentences. Slightly larger than body, dark color, sets the tone before regular paragraphs take over."
			>
				<Typography sx={BLOG_LEAD_SX}>
					This is what a lead paragraph looks like. Use it once at the top of
					the article — never again.
				</Typography>
			</ElementSpec>

			<ElementSpec
				name="BLOG_P_SX"
				when="Default body paragraph. ~16–17px, secondary color, 1.75 line-height. Use this for everything that isn't a heading, list, or callout."
			>
				<Typography sx={BLOG_P_SX}>
					This is body text. Long enough to wrap to multiple lines so you can
					see the line-height in action. Lorem ipsum dolor sit amet, consectetur
					adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore
					magna aliqua.
				</Typography>
			</ElementSpec>

			<ElementSpec
				name="BLOG_H2_SX"
				when="Top-level section heading inside the body. Must have an `id` matching a TOC entry."
			>
				<Typography component="h2" sx={BLOG_H2_SX}>
					This is an H2 heading
				</Typography>
			</ElementSpec>

			<ElementSpec
				name="BLOG_H3_SX"
				when="Sub-section heading. Optional in the TOC (use `level: 2` to nest under its H2)."
			>
				<Typography component="h3" sx={BLOG_H3_SX}>
					This is an H3 heading
				</Typography>
			</ElementSpec>

			<ElementSpec
				name="BLOG_H4_SX"
				when="Smaller sub-heading inside an H3 section. Rarely indexed in the TOC."
			>
				<Typography component="h4" sx={BLOG_H4_SX}>
					This is an H4 heading
				</Typography>
			</ElementSpec>
		</>
	);
};

const InlineFormattingSection = () => {
	return (
		<>
			<Typography component="h2" id="inline-formatting" sx={BLOG_H2_SX}>
				Inline formatting
			</Typography>

			<ElementSpec
				name="<strong>"
				when="Bold inline text. Use to emphasize a phrase inside a paragraph — never an entire sentence."
			>
				<Typography sx={BLOG_P_SX}>
					This sentence has <strong>bold emphasis</strong> in the middle.
				</Typography>
			</ElementSpec>

			<ElementSpec
				name="<em>"
				when="Italic inline text. Use for terminology, internal monologue, or light emphasis."
			>
				<Typography sx={BLOG_P_SX}>
					This sentence has <em>italic text</em> in the middle.
				</Typography>
			</ElementSpec>

			<ElementSpec
				name="<del>"
				when="Strikethrough. Use sparingly — best for a deliberate edit ('we removed X') or showing what no longer applies."
			>
				<Typography sx={BLOG_P_SX}>
					The original plan was to{' '}
					<Box component="del" sx={{ color: 'text.disabled' }}>
						ship a global ops-mode bypass
					</Box>{' '}
					— we don't do that anymore.
				</Typography>
			</ElementSpec>

			<ElementSpec
				name="BLOG_LINK_SX"
				when="Inline link inside body prose. Green underline, faint at rest, brightens on hover."
			>
				<Typography sx={BLOG_P_SX}>
					This sentence has{' '}
					<Box component="a" href="#" sx={BLOG_LINK_SX}>
						an inline link
					</Box>{' '}
					in it.
				</Typography>
			</ElementSpec>

			<ElementSpec
				name="BLOG_CODE_INLINE_SX"
				when="Inline `<code>` for short snippets, identifiers, or commands inside a paragraph. NOT for multi-line code (use BlogCodeBlock instead)."
			>
				<Typography sx={BLOG_P_SX}>
					Wrap inline code with{' '}
					<Box component="code" sx={BLOG_CODE_INLINE_SX}>
						BLOG_CODE_INLINE_SX
					</Box>{' '}
					to mark identifiers like{' '}
					<Box component="code" sx={BLOG_CODE_INLINE_SX}>
						tenant_id
					</Box>{' '}
					or{' '}
					<Box component="code" sx={BLOG_CODE_INLINE_SX}>
						npm install
					</Box>
					.
				</Typography>
			</ElementSpec>
		</>
	);
};

const ListsSection = () => {
	return (
		<>
			<Typography component="h2" id="lists" sx={BLOG_H2_SX}>
				Lists
			</Typography>

			<ElementSpec
				name="BLOG_UL_SX"
				when="Unordered (bulleted) list. Disc markers in muted color, comfortable spacing. Supports nesting."
			>
				<Box component="ul" sx={BLOG_UL_SX}>
					<li>First top-level item.</li>
					<li>
						Second item with a nested list inside:
						<Box component="ul" sx={BLOG_UL_SX}>
							<li>Nested child A</li>
							<li>Nested child B</li>
						</Box>
					</li>
					<li>Third top-level item.</li>
				</Box>
			</ElementSpec>

			<ElementSpec
				name="BLOG_OL_SX"
				when="Ordered (numbered) list. Decimal markers, semibold. Use when sequence matters."
			>
				<Box component="ol" sx={BLOG_OL_SX}>
					<li>First step.</li>
					<li>Second step.</li>
					<li>Third step — do this last.</li>
				</Box>
			</ElementSpec>
		</>
	);
};

const CodeBlocksSection = () => {
	return (
		<>
			<Typography component="h2" id="code" sx={BLOG_H2_SX}>
				Code blocks
			</Typography>

			<ElementSpec
				name='<BlogCodeBlock language="..."> + <Token>'
				when="Multi-line code with a dark surface, traffic-light chrome, and an optional language label. Wrap segments in <Token type='kw|fn|str|num|cls|com|pun'> for pseudo-syntax-highlighting (no real highlighter dependency)."
			>
				<BlogCodeBlock language="TypeScript">
					<Token type="com">{`// Greet someone, with a default fallback`}</Token>
					{`\n`}
					<Token type="kw">function</Token>
					{` `}
					<Token type="fn">greet</Token>
					<Token type="pun">(</Token>
					{`name`}
					<Token type="pun">:</Token>
					{` `}
					<Token type="cls">string</Token>
					{` `}
					<Token type="pun">=</Token>
					{` `}
					<Token type="str">'world'</Token>
					<Token type="pun">)</Token>
					{` `}
					<Token type="pun">{'{'}</Token>
					{`\n  `}
					<Token type="kw">return</Token>
					{` `}
					<Token type="str">{'`Hello, ${name}!`'}</Token>
					<Token type="pun">;</Token>
					{`\n`}
					<Token type="pun">{'}'}</Token>
				</BlogCodeBlock>
			</ElementSpec>

			<ElementSpec
				name="<BlogCodeBlock withChrome={false}>"
				when="Same code block without the macOS-style traffic-light header — for quick inline snippets where the chrome would be noise."
			>
				<BlogCodeBlock withChrome={false}>
					<Token type="kw">SELECT</Token>
					{` * `}
					<Token type="kw">FROM</Token>
					{` users `}
					<Token type="kw">WHERE</Token>
					{` tenant_id `}
					<Token type="pun">=</Token>
					{` `}
					<Token type="str">'42'</Token>
					<Token type="pun">;</Token>
				</BlogCodeBlock>
			</ElementSpec>
		</>
	);
};

const CalloutsSection = () => {
	return (
		<>
			<Typography component="h2" id="callouts" sx={BLOG_H2_SX}>
				Callouts
			</Typography>

			<ElementSpec
				name='<BlogCallout variant="info">'
				when="Neutral 'heads up' note. Blue tint. Use for context that's important but not actionable."
			>
				<BlogCallout variant="info" title="Heads up">
					This is what an info callout looks like. Keep it short — these aren't
					full sub-sections.
				</BlogCallout>
			</ElementSpec>

			<ElementSpec
				name='<BlogCallout variant="tip">'
				when="Helpful trick or shortcut. Brand-green tint. Use for pro tips or non-obvious advice."
			>
				<BlogCallout variant="tip" title="Pro tip">
					This is a tip callout. Great for "you can also do X" sidebars that
					would derail the main thread.
				</BlogCallout>
			</ElementSpec>

			<ElementSpec
				name='<BlogCallout variant="warning">'
				when="Cautionary note. Amber tint. Use when skipping the advice causes a measurable problem."
			>
				<BlogCallout variant="warning" title="Watch out">
					This is a warning callout. Reserve it for things that have bitten you
					in production — overuse devalues every other warning.
				</BlogCallout>
			</ElementSpec>

			<ElementSpec
				name='<BlogCallout variant="success">'
				when="Affirmation or 'this worked' summary. Emerald tint. Use after a section to crystallize the takeaway."
			>
				<BlogCallout variant="success" title="What worked">
					This is a success callout. Use it to bookend a section with the happy
					outcome, or to summarize three things to keep doing.
				</BlogCallout>
			</ElementSpec>

			<ElementSpec
				name="<BlogCallout> (no title)"
				when="Same component, with the title prop omitted. Reads as a stand-alone aside."
			>
				<BlogCallout variant="info">
					You can also drop the <code>title</code> prop entirely if the body
					already opens with a clear cue.
				</BlogCallout>
			</ElementSpec>
		</>
	);
};

const QuotesSection = () => {
	return (
		<>
			<Typography component="h2" id="quotes" sx={BLOG_H2_SX}>
				Quotes
			</Typography>

			<ElementSpec
				name="BLOG_BLOCKQUOTE_SX"
				when="Inline blockquote. Left rail accent, tinted bg. Use for short quotes inside the prose flow — author optional."
			>
				<Box component="blockquote" sx={BLOG_BLOCKQUOTE_SX}>
					<Typography>
						The best dashboard isn't the one with the most metrics — it's the
						one that makes the right one impossible to miss.
					</Typography>
				</Box>
			</ElementSpec>

			<ElementSpec
				name="<BlogPullQuote attribution=... role=...>"
				when="Editorial pull quote with optional attribution. Loud typography. Use once or twice per article max."
			>
				<BlogPullQuote attribution="Adrian Marin" role="Bullet Train">
					The first 90% of multi-tenancy is database design. The second 90% is
					everything else.
				</BlogPullQuote>
			</ElementSpec>
		</>
	);
};

const MediaSection = () => {
	return (
		<>
			<Typography component="h2" id="media" sx={BLOG_H2_SX}>
				Media
			</Typography>

			<ElementSpec
				name='<BlogFigure ratio="16/9" caption=... />'
				when="A single content image with optional caption. Wraps the canon <Image> primitive — never use raw <img> here."
			>
				<BlogFigure
					src={unsplashCover('1551288049-bebda4e38f71', { w: 1600, h: 900 })}
					alt="Analytics dashboard placeholder"
					ratio="16/9"
					caption="Caption sits centered below the image, italic, muted."
				/>
			</ElementSpec>

			<ElementSpec
				name="<BlogGallery images={[...]} caption=... />"
				when="2 or 3 images side-by-side with a shared caption. Stacks to 1 column on mobile."
			>
				<BlogGallery
					images={[
						{
							src: unsplashCover('1551288049-bebda4e38f71', {
								w: 600,
								h: 450,
							}),
							alt: 'Image 1',
							ratio: '4/3',
						},
						{
							src: unsplashCover('1542744173-8e7e53415bb0', {
								w: 600,
								h: 450,
							}),
							alt: 'Image 2',
							ratio: '4/3',
						},
						{
							src: unsplashCover('1611162617474-5b21e879e113', {
								w: 600,
								h: 450,
							}),
							alt: 'Image 3',
							ratio: '4/3',
						},
					]}
					caption="Three lenses on the same data."
				/>
			</ElementSpec>

			<ElementSpec
				name="<BlogVideo posterSrc=... title=... />"
				when="Embedded video. With a real `src`, renders an iframe. Without `src`, renders a play-button placeholder over the optional poster image — useful for 'video coming soon' or for pure visual demos."
			>
				<BlogVideo
					title="Demo video"
					posterSrc={unsplashCover('1573164713988-8665fc963095', {
						w: 1600,
						h: 900,
					})}
					caption="Click play in production — placeholder render shown here."
				/>
			</ElementSpec>
		</>
	);
};

const TablesSection = () => {
	return (
		<>
			<Typography component="h2" id="tables" sx={BLOG_H2_SX}>
				Tables
			</Typography>

			<ElementSpec
				name="<BlogTable columns={[...]} rows={[...]} caption=... />"
				when="Comparison or data table with sticky-feel header (uppercase tracked label) and zebra rows. Pass `columns` and `rows` as objects with stable `key` props (cells accept JSX for highlighted deltas, status pills, links)."
			>
				<BlogTable
					columns={[
						{ key: 'metric', label: 'Metric' },
						{ key: 'before', label: 'Before' },
						{ key: 'after', label: 'After' },
						{ key: 'delta', label: 'Δ' },
					]}
					rows={[
						{
							key: 'mttd',
							cells: [
								'Mean time to detect',
								'47 min',
								'4 min',
								<strong style={{ color: '#10B981' }} key="v">
									-91%
								</strong>,
							],
						},
						{
							key: 'mttr',
							cells: [
								'Mean time to resolve',
								'3h 12m',
								'38 min',
								<strong style={{ color: '#10B981' }} key="v">
									-80%
								</strong>,
							],
						},
						{
							key: 'spend',
							cells: [
								'Datadog spend',
								'$1,200',
								'$1,950',
								<strong style={{ color: '#D97706' }} key="v">
									+62%
								</strong>,
							],
						},
					]}
					caption="Optional caption sits below the table, italic, muted."
				/>
			</ElementSpec>
		</>
	);
};

const SeparatorsSection = () => {
	return (
		<>
			<Typography component="h2" id="separators" sx={BLOG_H2_SX}>
				Separators
			</Typography>

			<ElementSpec
				name="BLOG_HR_SX"
				when="Horizontal rule between major sections. Renders as a divider with comfortable vertical spacing."
			>
				<Box component="hr" sx={BLOG_HR_SX} />
			</ElementSpec>
		</>
	);
};

const ClosingNote = () => {
	return (
		<Typography sx={{ ...BLOG_P_SX, mt: 6 }}>
			When you add a new primitive to{' '}
			<Box component="code" sx={BLOG_CODE_INLINE_SX}>
				blog-content-elements.tsx
			</Box>
			, drop a labeled entry in this article so the reference stays complete.
		</Typography>
	);
};

// ----------------------------------------------------------------------

const BlogElementsReferenceArticle = () => {
	return (
		<BlogArticlePage post={POST} tocItems={TOC_ITEMS}>
			<Stack spacing={0}>
				<IntroSection />
				<TypographySection />
				<InlineFormattingSection />
				<ListsSection />
				<CodeBlocksSection />
				<CalloutsSection />
				<QuotesSection />
				<MediaSection />
				<TablesSection />
				<SeparatorsSection />
				<ClosingNote />
			</Stack>
		</BlogArticlePage>
	);
};

export default BlogElementsReferenceArticle;
