import type { ReactNode } from 'react';

import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import CalendarMonthRounded from '@mui/icons-material/CalendarMonthRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import FactCheckRounded from '@mui/icons-material/FactCheckRounded';
import ForumRounded from '@mui/icons-material/ForumRounded';
import Groups2Rounded from '@mui/icons-material/Groups2Rounded';
import PublishRounded from '@mui/icons-material/PublishRounded';
import TrackChangesRounded from '@mui/icons-material/TrackChangesRounded';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { type SxProps, type Theme } from '@mui/material/styles';
import { mergeSx } from '@mui/x-date-pickers/internals';
import { varAlpha } from 'minimal-shared/utils';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

type FrostCardProps = {
	children: ReactNode;
	sx?: SxProps<Theme>;
};

type SectionShellProps = {
	children: ReactNode;
	id: string;
	sx?: SxProps<Theme>;
};

const fontHeading = '"Space Grotesk", system-ui, -apple-system, sans-serif';
const fontBody = '"DM Sans", system-ui, -apple-system, sans-serif';

const FrostCard = ({ children, sx }: FrostCardProps) => {
	const baseSx: SxProps<Theme> = (theme) => {
		return {
			borderRadius: 4,
			border: `1px solid ${varAlpha(
				theme.vars.palette.common.whiteChannel,
				0.14,
			)}`,
			backgroundColor: varAlpha(theme.vars.palette.common.whiteChannel, 0.06),
			backdropFilter: 'blur(18px)',
			boxShadow: `0 24px 72px ${varAlpha(
				theme.vars.palette.common.blackChannel,
				0.38,
			)}`,
		};
	};

	return <Box sx={mergeSx(baseSx, sx)}>{children}</Box>;
};

const SectionShell = ({ children, id, sx }: SectionShellProps) => {
	const baseSx: SxProps<Theme> = {
		py: { xs: 8, md: 11 },
		position: 'relative',
	};

	return (
		<Box component="section" id={id} sx={mergeSx(baseSx, sx)}>
			{children}
		</Box>
	);
};

const MetricCard = ({
	label,
	value,
	description,
}: {
	label: string;
	value: string;
	description: string;
}) => {
	return (
		<FrostCard
			sx={{
				p: { xs: 2.25, md: 2.75 },
				display: 'grid',
				gap: 1,
				transition: 'transform 180ms ease, box-shadow 180ms ease',
				'&:hover': { transform: 'translateY(-4px)' },
			}}
		>
			<Typography
				variant="overline"
				sx={{ letterSpacing: '0.18em', opacity: 0.72 }}
			>
				{label}
			</Typography>
			<Typography
				variant="h3"
				sx={{ fontFamily: fontHeading, letterSpacing: '-0.03em' }}
			>
				{value}
			</Typography>
			<Typography color="text.secondary" sx={{ maxWidth: 320 }}>
				{description}
			</Typography>
		</FrostCard>
	);
};

const ProductPreview = () => {
	return (
		<FrostCard
			sx={(theme) => {
				return {
					p: { xs: 2.25, md: 3 },
					position: 'relative',
					overflow: 'hidden',
					borderColor: varAlpha(theme.vars.palette.primary.mainChannel, 0.22),
					backgroundColor: varAlpha(
						theme.vars.palette.background.paperChannel,
						0.22,
					),
					'&::before': {
						content: '""',
						position: 'absolute',
						inset: -140,
						background: `radial-gradient(circle at 24% 18%, ${varAlpha(
							theme.vars.palette.primary.mainChannel,
							0.22,
						)} 0%, transparent 55%)`,
						filter: 'blur(0px)',
						pointerEvents: 'none',
					},
				};
			}}
		>
			<Stack spacing={2.25} sx={{ position: 'relative' }}>
				<Stack
					direction="row"
					spacing={1}
					alignItems="center"
					justifyContent="space-between"
					useFlexGap
					flexWrap="wrap"
				>
					<Stack direction="row" spacing={1} alignItems="center">
						<Box
							sx={(theme) => {
								return {
									width: 10,
									height: 10,
									borderRadius: '50%',
									backgroundColor: varAlpha(
										theme.vars.palette.primary.mainChannel,
										0.9,
									),
									boxShadow: `0 0 0 4px ${varAlpha(
										theme.vars.palette.primary.mainChannel,
										0.22,
									)}`,
								};
							}}
						/>
						<Typography sx={{ fontFamily: fontHeading, fontWeight: 600 }}>
							Northwind Creative • Q2 Launch
						</Typography>
					</Stack>
					<Chip
						label="Client approval view"
						size="small"
						icon={<FactCheckRounded fontSize="small" />}
						sx={(theme) => {
							return {
								color: theme.vars.palette.primary.light,
								backgroundColor: varAlpha(
									theme.vars.palette.primary.mainChannel,
									0.16,
								),
								border: `1px solid ${varAlpha(
									theme.vars.palette.primary.mainChannel,
									0.24,
								)}`,
							};
						}}
					/>
				</Stack>

				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
						gap: 2,
					}}
				>
					{[
						{
							title: 'Drafting',
							chip: '2 drafts',
							cards: [
								{ label: 'IG carousel', tone: 'draft' },
								{ label: 'LinkedIn post', tone: 'draft' },
							],
						},
						{
							title: 'In review',
							chip: 'Client next',
							cards: [
								{ label: 'Reel caption', tone: 'review' },
								{ label: 'Story set', tone: 'review' },
							],
						},
						{
							title: 'Approved',
							chip: 'Ready to queue',
							cards: [
								{ label: 'Launch teaser', tone: 'approved' },
								{ label: 'Product benefits', tone: 'approved' },
							],
						},
					].map((lane) => {
						return (
							<Box key={lane.title} sx={{ display: 'grid', gap: 1.25 }}>
								<Stack
									direction="row"
									alignItems="center"
									justifyContent="space-between"
									spacing={1}
								>
									<Typography
										sx={{
											fontFamily: fontHeading,
											fontWeight: 600,
											opacity: 0.92,
										}}
									>
										{lane.title}
									</Typography>
									<Typography variant="caption" sx={{ opacity: 0.7 }}>
										{lane.chip}
									</Typography>
								</Stack>

								<Stack spacing={1.1}>
									{lane.cards.map((card) => {
										return (
											<Box
												key={card.label}
												sx={(theme) => {
													const tone =
														card.tone === 'approved'
															? theme.vars.palette.success.mainChannel
															: card.tone === 'review'
																? theme.vars.palette.warning.mainChannel
																: theme.vars.palette.primary.mainChannel;

													return {
														p: 1.4,
														borderRadius: 3,
														border: `1px solid ${varAlpha(tone, 0.25)}`,
														backgroundColor: varAlpha(
															theme.vars.palette.background.paperChannel,
															0.22,
														),
														display: 'grid',
														gap: 0.6,
														transition: 'transform 180ms ease',
														'&:hover': { transform: 'translateY(-2px)' },
													};
												}}
											>
												<Stack
													direction="row"
													alignItems="center"
													spacing={1}
													justifyContent="space-between"
												>
													<Typography sx={{ fontWeight: 600 }}>
														{card.label}
													</Typography>
													<Typography variant="caption" sx={{ opacity: 0.72 }}>
														Wed 10:00
													</Typography>
												</Stack>
												<Typography variant="caption" sx={{ opacity: 0.78 }}>
													Latest note: “Keep the CTA above the fold.”
												</Typography>
											</Box>
										);
									})}
								</Stack>
							</Box>
						);
					})}
				</Box>

				<Divider sx={{ opacity: 0.22 }} />

				<Stack
					direction="row"
					spacing={1.25}
					alignItems="center"
					justifyContent="space-between"
					useFlexGap
					flexWrap="wrap"
				>
					<Stack direction="row" spacing={1} alignItems="center">
						<CalendarMonthRounded fontSize="small" />
						<Typography variant="caption" sx={{ opacity: 0.82 }}>
							Calendar shows exactly what’s waiting on client sign-off.
						</Typography>
					</Stack>
					<Stack direction="row" spacing={1} alignItems="center">
						<PublishRounded fontSize="small" />
						<Typography variant="caption" sx={{ opacity: 0.82 }}>
							Readiness checklist prevents last-minute rebuilds.
						</Typography>
					</Stack>
				</Stack>
			</Stack>
		</FrostCard>
	);
};

const GeneratedHomepage0006Page = () => {
	return (
		<Box
			sx={(theme) => {
				return {
					minHeight: '100vh',
					bgcolor: 'background.default',
					color: 'text.primary',
					fontFamily: fontBody,
					position: 'relative',
					overflow: 'hidden',
					'&::before': {
						content: '""',
						position: 'absolute',
						inset: 0,
						background: `radial-gradient(circle at 18% 22%, ${varAlpha(
							theme.vars.palette.primary.mainChannel,
							0.22,
						)} 0%, transparent 55%), radial-gradient(circle at 86% 12%, ${varAlpha(
							theme.vars.palette.info.mainChannel,
							0.12,
						)} 0%, transparent 52%), radial-gradient(circle at 40% 92%, ${varAlpha(
							theme.vars.palette.success.mainChannel,
							0.08,
						)} 0%, transparent 60%)`,
						pointerEvents: 'none',
					},
				};
			}}
		>
			<Container maxWidth="lg" sx={{ position: 'relative' }}>
				<Stack
					direction="row"
					alignItems="center"
					justifyContent="space-between"
					py={{ xs: 3, md: 4 }}
					spacing={2}
				>
					<Stack direction="row" spacing={1.25} alignItems="center">
						<Box
							sx={(theme) => {
								return {
									width: 36,
									height: 36,
									borderRadius: 2.25,
									background: `linear-gradient(135deg, ${varAlpha(
										theme.vars.palette.primary.mainChannel,
										0.95,
									)} 0%, ${varAlpha(
										theme.vars.palette.info.mainChannel,
										0.6,
									)} 55%, ${varAlpha(
										theme.vars.palette.primary.mainChannel,
										0.5,
									)} 100%)`,
									boxShadow: `0 16px 44px ${varAlpha(
										theme.vars.palette.primary.mainChannel,
										0.22,
									)}`,
								};
							}}
						/>
						<Stack spacing={0.1}>
							<Typography
								sx={{ fontFamily: fontHeading, fontWeight: 700, lineHeight: 1 }}
							>
								PublyApp
							</Typography>
							<Typography variant="caption" sx={{ opacity: 0.7 }}>
								Agency workflow preview
							</Typography>
						</Stack>
					</Stack>

					<Stack direction="row" spacing={1} alignItems="center" useFlexGap>
						<Button color="inherit" href="#proof" sx={{ opacity: 0.78 }}>
							Proof
						</Button>
						<Button color="inherit" href="#benefits" sx={{ opacity: 0.78 }}>
							Core benefits
						</Button>
						<Button color="inherit" href="#product" sx={{ opacity: 0.78 }}>
							Workflow
						</Button>
						<Button
							variant="outlined"
							href={FRONT_PATH_NAMES.auth.signup}
							endIcon={<ArrowForwardRounded />}
							sx={(theme) => {
								return {
									borderColor: varAlpha(
										theme.vars.palette.common.whiteChannel,
										0.18,
									),
									color: 'text.primary',
									backgroundColor: varAlpha(
										theme.vars.palette.background.paperChannel,
										0.14,
									),
									'&:hover': {
										borderColor: varAlpha(
											theme.vars.palette.primary.mainChannel,
											0.34,
										),
										backgroundColor: varAlpha(
											theme.vars.palette.primary.mainChannel,
											0.1,
										),
									},
								};
							}}
						>
							Book a walkthrough
						</Button>
					</Stack>
				</Stack>
			</Container>

			<SectionShell
				id="hero"
				sx={{ pt: { xs: 5, md: 7 }, pb: { xs: 6, md: 8 } }}
			>
				<Container maxWidth="lg">
					<Box
						sx={{
							display: 'grid',
							gridTemplateColumns: {
								xs: '1fr',
								lg: 'minmax(0, 0.92fr) minmax(0, 1.08fr)',
							},
							gap: { xs: 5, lg: 6 },
							alignItems: 'center',
						}}
					>
						<Stack spacing={3.25}>
							<Chip
								label="Approval-heavy client work, without the email archaeology"
								size="small"
								icon={<Groups2Rounded fontSize="small" />}
								sx={(theme) => {
									return {
										alignSelf: 'flex-start',
										color: theme.vars.palette.primary.light,
										backgroundColor: varAlpha(
											theme.vars.palette.primary.mainChannel,
											0.14,
										),
										border: `1px solid ${varAlpha(
											theme.vars.palette.primary.mainChannel,
											0.22,
										)}`,
									};
								}}
							/>

							<Stack spacing={1.75}>
								<Typography
									variant="h1"
									sx={{
										fontFamily: fontHeading,
										letterSpacing: '-0.045em',
										lineHeight: 1.03,
										fontSize: { xs: 40, sm: 52, md: 60 },
									}}
								>
									Plan, draft, review, and queue client posts in one operational
									workflow.
								</Typography>
								<Typography
									variant="h5"
									color="text.secondary"
									sx={{ fontSize: { xs: 18, md: 20 }, maxWidth: 560 }}
								>
									PublyApp keeps briefs, AI drafting, client feedback, approval
									state, and publishing readiness attached to the same work
									item—so your team stops translating context between tools.
								</Typography>
							</Stack>

							<Stack
								direction="row"
								spacing={1.25}
								useFlexGap
								flexWrap="wrap"
								alignItems="center"
							>
								<Button
									variant="contained"
									size="large"
									href={FRONT_PATH_NAMES.auth.signup}
									endIcon={<ArrowForwardRounded />}
									sx={(theme) => {
										return {
											borderRadius: 999,
											px: 3,
											py: 1.3,
											fontFamily: fontHeading,
											fontWeight: 700,
											backgroundColor: varAlpha(
												theme.vars.palette.primary.mainChannel,
												0.92,
											),
											color: theme.vars.palette.common.black,
											boxShadow: `0 18px 44px ${varAlpha(
												theme.vars.palette.primary.mainChannel,
												0.28,
											)}`,
											'&:hover': {
												backgroundColor: varAlpha(
													theme.vars.palette.primary.mainChannel,
													1,
												),
												transform: 'translateY(-1px)',
											},
										};
									}}
								>
									Book a walkthrough
								</Button>
								<Button
									variant="text"
									size="large"
									color="inherit"
									href="#product"
									sx={{
										borderRadius: 999,
										px: 2.2,
										py: 1.1,
										opacity: 0.86,
										'&:hover': { opacity: 1 },
									}}
								>
									See a sample workflow
								</Button>
							</Stack>

							<Stack direction="row" spacing={1.25} useFlexGap flexWrap="wrap">
								{[
									{
										icon: <ForumRounded fontSize="small" />,
										label: 'Client comments stay on the draft',
									},
									{
										icon: <TrackChangesRounded fontSize="small" />,
										label: 'Clear “who’s next” approval states',
									},
									{
										icon: <CheckCircleRounded fontSize="small" />,
										label: 'Readiness checklist before queue time',
									},
								].map((item) => {
									return (
										<Stack
											key={item.label}
											direction="row"
											spacing={1}
											alignItems="center"
											sx={{ opacity: 0.84 }}
										>
											{item.icon}
											<Typography variant="caption">{item.label}</Typography>
										</Stack>
									);
								})}
							</Stack>
						</Stack>

						<ProductPreview />
					</Box>
				</Container>
			</SectionShell>

			<SectionShell id="proof" sx={{ pt: { xs: 0, md: 0 } }}>
				<Container maxWidth="lg">
					<Box
						sx={{
							display: 'grid',
							gridTemplateColumns: {
								xs: '1fr',
								lg: 'minmax(0, 1.12fr) minmax(0, 0.88fr)',
							},
							gap: { xs: 3, md: 4 },
							alignItems: 'stretch',
						}}
					>
						<FrostCard sx={{ p: { xs: 2.5, md: 3.25 } }}>
							<Stack spacing={2.5}>
								<Stack direction="row" spacing={1.25} alignItems="center">
									<Avatar
										sx={(theme) => {
											return {
												bgcolor: varAlpha(
													theme.vars.palette.primary.mainChannel,
													0.18,
												),
												color: theme.vars.palette.primary.light,
											};
										}}
									>
										<Groups2Rounded />
									</Avatar>
									<Stack spacing={0.2}>
										<Typography
											sx={{ fontFamily: fontHeading, fontWeight: 700 }}
										>
											Lena M.
										</Typography>
										<Typography variant="caption" sx={{ opacity: 0.72 }}>
											Ops Director • 12-client agency
										</Typography>
									</Stack>
								</Stack>

								<Typography
									variant="h3"
									sx={{ fontFamily: fontHeading, letterSpacing: '-0.03em' }}
								>
									“We stopped chasing approvals across threads. Everyone can see
									what’s waiting on the client, what’s final, and what’s ready
									to queue.”
								</Typography>
								<Typography color="text.secondary" sx={{ maxWidth: 640 }}>
									The win isn’t “more AI.” It’s fewer handoffs: briefs, drafts,
									comments, approval state, and publishing checks living
									together so the team doesn’t rebuild context at the last mile.
								</Typography>
							</Stack>
						</FrostCard>

						<Stack spacing={2}>
							<MetricCard
								label="Approval clarity"
								value="One “who’s next” state"
								description="Clients get a single place to review and sign off, and your team keeps the latest note attached to the draft."
							/>
							<MetricCard
								label="Fewer handoffs"
								value="Draft → review → queue"
								description="AI drafting and publishing readiness are part of the same workflow, not separate tools with separate context."
							/>
							<MetricCard
								label="Visibility"
								value="Cross-client status"
								description="Account leads see what’s blocked, in review, approved, and ready—without spreadsheet recaps."
							/>
						</Stack>
					</Box>
				</Container>
			</SectionShell>

			<SectionShell id="benefits">
				<Container maxWidth="lg">
					<Stack spacing={1.5} sx={{ mb: { xs: 4, md: 5 } }}>
						<Typography
							variant="overline"
							sx={{ letterSpacing: '0.18em', opacity: 0.72 }}
						>
							Core benefits for agencies
						</Typography>
						<Typography
							variant="h2"
							sx={{
								fontFamily: fontHeading,
								letterSpacing: '-0.04em',
								fontSize: { xs: 32, md: 40 },
							}}
						>
							A clear operating system for client social delivery.
						</Typography>
						<Typography color="text.secondary" sx={{ maxWidth: 720 }}>
							Standardize the shape of delivery without flattening your custom
							process. PublyApp keeps the work crisp: what’s happening, who owns
							it, what the client said, and what’s safe to publish.
						</Typography>
					</Stack>

					<Box
						sx={{
							display: 'grid',
							gridTemplateColumns: {
								xs: '1fr',
								md: 'repeat(3, minmax(0, 1fr))',
							},
							gap: { xs: 2.25, md: 3 },
						}}
					>
						{[
							{
								icon: <FactCheckRounded />,
								title: 'Approvals that don’t get lost in the thread',
								description:
									'Explicit review states, a single “latest decision,” and comments that stay on the draft—not in a screenshot chain.',
								points: [
									'Client-visible “needs changes / approved” states',
									'Revision notes captured where the copy lives',
									'Clear next owner for every draft',
								],
							},
							{
								icon: <CalendarMonthRounded />,
								title: 'Campaign visibility across client accounts',
								description:
									'One planner view for what’s blocked, in review, approved, and ready—without chasing each account lead.',
								points: [
									'Calendar + lanes for every client workspace',
									'Status rollups for account leads',
									'Less context switching between tools',
								],
							},
							{
								icon: <PublishRounded />,
								title: 'Publishing readiness before queue time',
								description:
									'Assets, links, channel rules, and checks are visible before the post hits the queue—so you don’t rebuild at the last mile.',
								points: [
									'Readiness checklist per channel',
									'Approved copy and asset pack stay together',
									'Queue handoff without “where’s the latest version?”',
								],
							},
						].map((card) => {
							return (
								<FrostCard
									key={card.title}
									sx={{
										p: { xs: 2.5, md: 3.25 },
										display: 'grid',
										gap: 2,
										transition: 'transform 180ms ease',
										'&:hover': { transform: 'translateY(-6px)' },
									}}
								>
									<Stack direction="row" spacing={1.25} alignItems="center">
										<Avatar
											sx={(theme) => {
												return {
													width: 44,
													height: 44,
													bgcolor: varAlpha(
														theme.vars.palette.primary.mainChannel,
														0.16,
													),
													color: theme.vars.palette.primary.light,
												};
											}}
										>
											{card.icon}
										</Avatar>
										<Typography
											variant="h6"
											sx={{ fontFamily: fontHeading, letterSpacing: '-0.02em' }}
										>
											{card.title}
										</Typography>
									</Stack>
									<Typography color="text.secondary">
										{card.description}
									</Typography>
									<Stack spacing={1}>
										{card.points.map((point) => {
											return (
												<Stack
													key={point}
													direction="row"
													spacing={1}
													alignItems="flex-start"
												>
													<CheckCircleRounded
														fontSize="small"
														sx={{ mt: '2px', opacity: 0.86 }}
													/>
													<Typography variant="body2" sx={{ opacity: 0.92 }}>
														{point}
													</Typography>
												</Stack>
											);
										})}
									</Stack>
								</FrostCard>
							);
						})}
					</Box>
				</Container>
			</SectionShell>

			<SectionShell id="product">
				<Container maxWidth="lg">
					<Box
						sx={{
							display: 'grid',
							gridTemplateColumns: {
								xs: '1fr',
								lg: 'minmax(0, 0.9fr) minmax(0, 1.1fr)',
							},
							gap: { xs: 3, md: 4 },
							alignItems: 'start',
						}}
					>
						<Stack spacing={2}>
							<Typography
								variant="overline"
								sx={{ letterSpacing: '0.18em', opacity: 0.72 }}
							>
								Product visual
							</Typography>
							<Typography
								variant="h2"
								sx={{
									fontFamily: fontHeading,
									letterSpacing: '-0.04em',
									fontSize: { xs: 32, md: 40 },
								}}
							>
								A believable workflow—built for review-heavy delivery.
							</Typography>
							<Typography color="text.secondary" sx={{ maxWidth: 520 }}>
								From campaign planning to AI drafting to client sign-off to
								publishing readiness, the workflow stays coherent. Your team
								always knows what’s true, what’s next, and what’s safe to ship.
							</Typography>

							<Stack spacing={1.25} sx={{ pt: 1 }}>
								{[
									{
										icon: <AutoAwesomeRounded fontSize="small" />,
										title: 'Draft in context',
										body: 'AI suggestions start inside the campaign lane, tied to channel intent and constraints.',
									},
									{
										icon: <ForumRounded fontSize="small" />,
										title: 'Review without version drift',
										body: 'Feedback sits on the draft. The approved version is explicit—not implied.',
									},
									{
										icon: <PublishRounded fontSize="small" />,
										title: 'Queue with confidence',
										body: 'Readiness checks and asset packs are visible before the post hits scheduling.',
									},
								].map((row) => {
									return (
										<Stack
											key={row.title}
											direction="row"
											spacing={1.25}
											alignItems="flex-start"
										>
											<Avatar
												sx={(theme) => {
													return {
														width: 38,
														height: 38,
														bgcolor: varAlpha(
															theme.vars.palette.common.whiteChannel,
															0.08,
														),
														border: `1px solid ${varAlpha(
															theme.vars.palette.common.whiteChannel,
															0.14,
														)}`,
													};
												}}
											>
												{row.icon}
											</Avatar>
											<Stack spacing={0.35}>
												<Typography
													sx={{ fontFamily: fontHeading, fontWeight: 700 }}
												>
													{row.title}
												</Typography>
												<Typography variant="body2" sx={{ opacity: 0.82 }}>
													{row.body}
												</Typography>
											</Stack>
										</Stack>
									);
								})}
							</Stack>
						</Stack>

						<FrostCard
							sx={(theme) => {
								return {
									p: { xs: 2.25, md: 3 },
									borderColor: varAlpha(
										theme.vars.palette.primary.mainChannel,
										0.22,
									),
									backgroundColor: varAlpha(
										theme.vars.palette.background.paperChannel,
										0.22,
									),
								};
							}}
						>
							<Stack spacing={2.25}>
								<Stack
									direction="row"
									spacing={1}
									alignItems="center"
									justifyContent="space-between"
									useFlexGap
									flexWrap="wrap"
								>
									<Stack spacing={0.25}>
										<Typography
											sx={{ fontFamily: fontHeading, fontWeight: 700 }}
										>
											Campaign: Spring Launch
										</Typography>
										<Typography variant="caption" sx={{ opacity: 0.7 }}>
											Channel rules, approvals, and readiness live together.
										</Typography>
									</Stack>
									<Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
										{['Planner', 'Draft', 'Review', 'Queue'].map((label) => {
											return (
												<Chip
													key={label}
													label={label}
													size="small"
													variant={label === 'Review' ? 'filled' : 'outlined'}
													sx={(theme) => {
														const isActive = label === 'Review';
														return {
															fontWeight: 600,
															borderColor: varAlpha(
																theme.vars.palette.common.whiteChannel,
																0.14,
															),
															backgroundColor: isActive
																? varAlpha(
																		theme.vars.palette.primary.mainChannel,
																		0.18,
																	)
																: 'transparent',
															color: isActive
																? theme.vars.palette.primary.light
																: 'text.primary',
														};
													}}
												/>
											);
										})}
									</Stack>
								</Stack>

								<Divider sx={{ opacity: 0.22 }} />

								<Box
									sx={{
										display: 'grid',
										gridTemplateColumns: {
											xs: '1fr',
											md: 'minmax(0, 0.62fr) minmax(0, 0.38fr)',
										},
										gap: 2,
									}}
								>
									<Stack spacing={1.25}>
										{[
											{
												title: 'Draft: LinkedIn post',
												meta: 'Needs client sign-off',
												body: '“New feature set is live. Here’s how your team ships faster without the approval churn…”',
												tone: 'warning',
											},
											{
												title: 'Draft: IG carousel',
												meta: 'Approved • Ready to queue',
												body: '“Slide 1: The problem. Slide 2: What changed. Slide 3: The workflow…”',
												tone: 'success',
											},
											{
												title: 'Draft: Reel caption',
												meta: 'In review • Strategist next',
												body: '“Short, direct, and channel-ready. Keep the CTA above the fold.”',
												tone: 'info',
											},
										].map((item) => {
											return (
												<Box
													key={item.title}
													sx={(theme) => {
														const toneChannel =
															item.tone === 'success'
																? theme.vars.palette.success.mainChannel
																: item.tone === 'warning'
																	? theme.vars.palette.warning.mainChannel
																	: theme.vars.palette.info.mainChannel;

														return {
															p: 1.7,
															borderRadius: 3,
															border: `1px solid ${varAlpha(toneChannel, 0.24)}`,
															backgroundColor: varAlpha(
																theme.vars.palette.background.paperChannel,
																0.2,
															),
															display: 'grid',
															gap: 0.75,
														};
													}}
												>
													<Stack
														direction="row"
														alignItems="flex-start"
														justifyContent="space-between"
														spacing={1}
													>
														<Stack spacing={0.25}>
															<Typography sx={{ fontWeight: 700 }}>
																{item.title}
															</Typography>
															<Typography
																variant="caption"
																sx={{ opacity: 0.72 }}
															>
																{item.meta}
															</Typography>
														</Stack>
														<Chip
															size="small"
															label="Latest note"
															sx={(theme) => {
																return {
																	backgroundColor: varAlpha(
																		theme.vars.palette.common.whiteChannel,
																		0.08,
																	),
																	border: `1px solid ${varAlpha(
																		theme.vars.palette.common.whiteChannel,
																		0.14,
																	)}`,
																};
															}}
														/>
													</Stack>
													<Typography variant="body2" sx={{ opacity: 0.82 }}>
														{item.body}
													</Typography>
												</Box>
											);
										})}
									</Stack>

									<FrostCard
										sx={(theme) => {
											return {
												p: 2,
												borderRadius: 3,
												backgroundColor: varAlpha(
													theme.vars.palette.common.whiteChannel,
													0.05,
												),
												boxShadow: 'none',
											};
										}}
									>
										<Stack spacing={1.25}>
											<Typography
												sx={{ fontFamily: fontHeading, fontWeight: 700 }}
											>
												Readiness checklist
											</Typography>
											{[
												'Approved copy attached',
												'Asset pack linked',
												'UTM + link checks',
												'Channel constraints verified',
												'Final publish owner assigned',
											].map((row) => {
												return (
													<Stack
														key={row}
														direction="row"
														spacing={1}
														alignItems="center"
													>
														<CheckCircleRounded
															fontSize="small"
															sx={{ opacity: 0.82 }}
														/>
														<Typography variant="body2" sx={{ opacity: 0.86 }}>
															{row}
														</Typography>
													</Stack>
												);
											})}
										</Stack>
									</FrostCard>
								</Box>
							</Stack>
						</FrostCard>
					</Box>
				</Container>
			</SectionShell>

			<SectionShell id="faq" sx={{ py: { xs: 7, md: 9 } }}>
				<Container maxWidth="lg">
					<Stack spacing={1.5} sx={{ mb: { xs: 3, md: 4 } }}>
						<Typography
							variant="overline"
							sx={{ letterSpacing: '0.18em', opacity: 0.72 }}
						>
							FAQ
						</Typography>
						<Typography
							variant="h2"
							sx={{
								fontFamily: fontHeading,
								letterSpacing: '-0.04em',
								fontSize: { xs: 30, md: 38 },
							}}
						>
							The questions agencies ask before switching.
						</Typography>
					</Stack>

					<Stack spacing={1.5}>
						{[
							{
								q: 'Will this work with our “too custom” client process?',
								a: 'Yes—PublyApp is built around clear stages and permissions, not one rigid template. You standardize the operating shape (states, owners, readiness) while keeping each client’s approval sequence and channel rules intact.',
							},
							{
								q: 'How do clients collaborate without creating more friction?',
								a: 'Clients review inside the same draft record: one place to comment, request changes, or approve. Your team sees “who’s next” and the latest decision without translating from email threads.',
							},
							{
								q: 'Does switching tools slow us down at the start?',
								a: 'The fastest path is to run one client through the full lane: plan → draft → review → queue. The goal is fewer handoffs, so your team stops rebuilding context across tabs as soon as the workflow is live.',
							},
							{
								q: 'How does PublyApp help with handoff speed to publishing?',
								a: 'The approved copy and asset pack stay attached to the work item, plus a readiness checklist that surfaces missing pieces early—so the final publisher isn’t reconstructing the post at queue time.',
							},
						].map((item) => {
							return (
								<Accordion
									key={item.q}
									disableGutters
									sx={(theme) => {
										return {
											borderRadius: 3,
											border: `1px solid ${varAlpha(
												theme.vars.palette.common.whiteChannel,
												0.14,
											)}`,
											backgroundColor: varAlpha(
												theme.vars.palette.common.whiteChannel,
												0.05,
											),
											backdropFilter: 'blur(16px)',
											'&::before': { display: 'none' },
										};
									}}
								>
									<AccordionSummary
										expandIcon={<ArrowForwardRounded />}
										sx={{
											'& .MuiAccordionSummary-expandIconWrapper': {
												transform: 'rotate(90deg)',
											},
											'& .MuiAccordionSummary-expandIconWrapper.Mui-expanded': {
												transform: 'rotate(270deg)',
											},
										}}
									>
										<Typography
											sx={{ fontFamily: fontHeading, fontWeight: 700 }}
										>
											{item.q}
										</Typography>
									</AccordionSummary>
									<AccordionDetails>
										<Typography color="text.secondary">{item.a}</Typography>
									</AccordionDetails>
								</Accordion>
							);
						})}
					</Stack>
				</Container>
			</SectionShell>

			<SectionShell
				id="final-cta"
				sx={{ pt: { xs: 7, md: 9 }, pb: { xs: 10, md: 12 } }}
			>
				<Container maxWidth="lg">
					<FrostCard
						sx={(theme) => {
							return {
								p: { xs: 3, md: 4 },
								borderRadius: 5,
								borderColor: varAlpha(
									theme.vars.palette.primary.mainChannel,
									0.24,
								),
								backgroundColor: varAlpha(
									theme.vars.palette.background.paperChannel,
									0.28,
								),
								position: 'relative',
								overflow: 'hidden',
								'&::before': {
									content: '""',
									position: 'absolute',
									inset: -120,
									background: `radial-gradient(circle at 26% 38%, ${varAlpha(
										theme.vars.palette.primary.mainChannel,
										0.26,
									)} 0%, transparent 60%)`,
									pointerEvents: 'none',
								},
							};
						}}
					>
						<Box
							sx={{
								display: 'grid',
								gridTemplateColumns: {
									xs: '1fr',
									md: 'minmax(0, 0.74fr) minmax(0, 0.26fr)',
								},
								gap: 3,
								alignItems: 'center',
								position: 'relative',
							}}
						>
							<Stack spacing={1.5}>
								<Typography
									variant="h2"
									sx={{
										fontFamily: fontHeading,
										letterSpacing: '-0.04em',
										fontSize: { xs: 32, md: 42 },
									}}
								>
									Bring your agency’s delivery into one clear workflow.
								</Typography>
								<Typography color="text.secondary" sx={{ maxWidth: 640 }}>
									If your team ships across multiple client accounts, the
									fastest win is approval clarity and fewer handoffs. See a
									sample setup and how the review states map to your process.
								</Typography>
								<Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
									{[
										'Multi-client visibility',
										'Approval states that stick',
										'Publishing readiness checks',
									].map((label) => {
										return (
											<Chip
												key={label}
												size="small"
												label={label}
												sx={(theme) => {
													return {
														borderColor: varAlpha(
															theme.vars.palette.common.whiteChannel,
															0.14,
														),
														backgroundColor: varAlpha(
															theme.vars.palette.common.whiteChannel,
															0.06,
														),
														fontWeight: 600,
													};
												}}
												variant="outlined"
											/>
										);
									})}
								</Stack>
							</Stack>

							<Stack
								spacing={1.25}
								alignItems={{ xs: 'flex-start', md: 'flex-end' }}
							>
								<Button
									variant="contained"
									size="large"
									href={FRONT_PATH_NAMES.auth.signup}
									endIcon={<ArrowForwardRounded />}
									sx={(theme) => {
										return {
											borderRadius: 999,
											px: 3,
											py: 1.25,
											fontFamily: fontHeading,
											fontWeight: 700,
											backgroundColor: varAlpha(
												theme.vars.palette.primary.mainChannel,
												0.92,
											),
											color: theme.vars.palette.common.black,
											boxShadow: `0 18px 44px ${varAlpha(
												theme.vars.palette.primary.mainChannel,
												0.28,
											)}`,
											'&:hover': {
												backgroundColor: varAlpha(
													theme.vars.palette.primary.mainChannel,
													1,
												),
											},
										};
									}}
								>
									Book a walkthrough
								</Button>
								<Typography variant="caption" sx={{ opacity: 0.72 }}>
									No hype—just a clear workflow demo.
								</Typography>
							</Stack>
						</Box>
					</FrostCard>
				</Container>
			</SectionShell>
		</Box>
	);
};

export default GeneratedHomepage0006Page;
