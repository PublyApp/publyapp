import type { ReactNode } from 'react';

import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import CalendarMonthRounded from '@mui/icons-material/CalendarMonthRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import CompareArrowsRounded from '@mui/icons-material/CompareArrowsRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import FactCheckRounded from '@mui/icons-material/FactCheckRounded';
import ForumRounded from '@mui/icons-material/ForumRounded';
import GridViewRounded from '@mui/icons-material/GridViewRounded';
import Groups2Rounded from '@mui/icons-material/Groups2Rounded';
import PublishRounded from '@mui/icons-material/PublishRounded';
import TaskAltRounded from '@mui/icons-material/TaskAltRounded';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { type SxProps, type Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { varAlpha } from 'minimal-shared/utils';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

type AccentTone = 'info' | 'primary' | 'success' | 'warning';

type SectionShellProps = {
	children: ReactNode;
	id?: string;
	sx?: SxProps<Theme>;
};

type SectionHeadingProps = {
	caption: string;
	description: string;
	title: string;
};

type FrostCardProps = {
	children: ReactNode;
	sx?: SxProps<Theme>;
};

const comparisonRows = [
	{
		label: 'Planning context',
		fragmented:
			'Campaign briefs live in docs, weekly status lives in chat, and the publish window lives somewhere else.',
		publy:
			'Campaign intent, channel plan, and the scheduling window stay attached to the same workflow record.',
	},
	{
		label: 'Draft generation',
		fragmented:
			'AI copy is generated in isolation, then pasted back into a separate review process with missing context.',
		publy:
			'AI-assisted drafts start inside the campaign lane, so feedback and final publishing notes stay attached.',
	},
	{
		label: 'Client approvals',
		fragmented:
			'Email threads, Slack messages, and screenshots create version drift before anything is truly approved.',
		publy:
			'Review states sit on the draft itself with explicit owner, latest note, and next required decision.',
	},
	{
		label: 'Publishing handoff',
		fragmented:
			'Publishers reconstruct assets, captions, links, and channel rules from multiple tabs right before queue time.',
		publy:
			'Publishers open the same record with the caption, asset pack, readiness checks, and approved version already visible.',
	},
	{
		label: 'Agency-wide visibility',
		fragmented:
			'Account leads assemble progress manually when multiple client calendars move at different speeds.',
		publy:
			'Blocked, in review, approved, and ready-to-queue work is visible across client workspaces in one planner view.',
	},
] as const;

const benefitCards = [
	{
		icon: <GridViewRounded fontSize="small" />,
		title: 'Standardize delivery without flattening custom client process',
		description:
			'Give every account team the same operating shape while still preserving each client’s approval sequence and channel rules.',
		points: [
			'Reusable campaign stages for every client team',
			'Visible approval checkpoints instead of side-channel reminders',
			'One source of truth for copy, assets, and next action',
		],
	},
	{
		icon: <ForumRounded fontSize="small" />,
		title: 'Keep revisions attached to the work, not buried in the thread',
		description:
			'Comments, redrafts, and approval status follow the draft from strategist to client to publisher, so nobody is translating context twice.',
		points: [
			'Revision history stays on the active draft',
			'Client notes are easy to resolve and easy to revisit',
			'AI redrafts stay grounded in campaign context',
		],
	},
	{
		icon: <FactCheckRounded fontSize="small" />,
		title: 'See publishing readiness before the queue opens',
		description:
			'Make queue health operational. Missing assets, broken links, and channel mismatches are visible before publish day becomes firefighting.',
		points: [
			'Checklist-based readiness for every scheduled item',
			'Queue blockers surfaced before handoff',
			'Clear signal on what is approved versus merely drafted',
		],
	},
] as const;

const proofMetrics = [
	{
		value: '4',
		label: 'review states visible before publish',
		detail: 'Draft, internal review, client sign-off, ready to queue',
	},
	{
		value: '3',
		label: 'client workspaces visible in one planner view',
		detail: 'Account leads can scan multiple weeks without tab hopping',
	},
	{
		value: '1',
		label: 'readiness checklist attached to every queued post',
		detail: 'Assets, caption, link, and channel fit checked in one place',
	},
] as const;

const workflowColumns = [
	{
		day: 'Mon',
		date: '18',
		cards: [
			{
				channel: 'LinkedIn',
				status: 'Approved',
				title: 'Quarterly market readout',
				tone: 'success' as const,
			},
			{
				channel: 'Instagram',
				status: 'Needs legal note',
				title: 'Northbound teaser cutdown',
				tone: 'warning' as const,
			},
		],
	},
	{
		day: 'Tue',
		date: '19',
		cards: [
			{
				channel: 'X',
				status: 'Drafting',
				title: 'Client Q&A thread',
				tone: 'info' as const,
			},
		],
	},
	{
		day: 'Wed',
		date: '20',
		cards: [
			{
				channel: 'Instagram',
				status: 'Ready to queue',
				title: 'Launch carousel V4',
				tone: 'primary' as const,
			},
			{
				channel: 'LinkedIn',
				status: 'Awaiting client reply',
				title: 'Founder post revision',
				tone: 'warning' as const,
			},
		],
	},
	{
		day: 'Thu',
		date: '21',
		cards: [
			{
				channel: 'Facebook',
				status: 'Approved',
				title: 'Webinar registration push',
				tone: 'success' as const,
			},
		],
	},
	{
		day: 'Fri',
		date: '22',
		cards: [
			{
				channel: 'TikTok',
				status: 'Asset missing',
				title: 'Behind-the-scenes clip',
				tone: 'warning' as const,
			},
			{
				channel: 'LinkedIn',
				status: 'Ready to queue',
				title: 'Case-study pull quote',
				tone: 'primary' as const,
			},
		],
	},
] as const;

const reviewTimeline = [
	{
		note: 'Angle sharpened with campaign brief and client voice note',
		role: 'Strategist',
		tone: 'info' as const,
	},
	{
		note: 'AI redraft generated from approved proof points and legal guardrails',
		role: 'Draft assist',
		tone: 'primary' as const,
	},
	{
		note: 'Client approved V4 headline, requested softer CTA in slide three',
		role: 'Client',
		tone: 'success' as const,
	},
	{
		note: 'Publisher confirmed channel fit, alt text, and final queue slot',
		role: 'Publisher',
		tone: 'success' as const,
	},
] as const;

const readinessChecks = [
	'Caption approved',
	'Final asset uploaded',
	'Tracking link attached',
	'Channel formatting checked',
] as const;

const workspaceRows = [
	{
		client: 'Northbound Homes',
		summary: '6 scheduled this week',
		status: '2 waiting on client note',
		tone: 'warning' as const,
	},
	{
		client: 'Atlas Legal',
		summary: '4 items in internal review',
		status: '1 blocked on compliance',
		tone: 'info' as const,
	},
	{
		client: 'Lumen Robotics',
		summary: '5 approved for queue',
		status: 'All assets attached',
		tone: 'success' as const,
	},
] as const;

const faqItems = [
	{
		answer:
			'Yes. PublyApp keeps client review tied to the draft and campaign context, so feedback lands on the work instead of disappearing into a separate message thread.',
		question: 'Can clients collaborate without living in another tool all day?',
	},
	{
		answer:
			'Strategists, creators, and publishers work from the same record. Once a draft is approved, the next owner opens the same item with the final copy, asset pack, and readiness checklist already in place.',
		question:
			'How does handoff speed improve when multiple roles touch the same post?',
	},
	{
		answer:
			'The operating model is standardized, not rigid. Teams can preserve client-specific stages while keeping visibility, approval ownership, and publishing readiness consistent across accounts.',
		question: 'Our agency process is custom. Will one workflow slow us down?',
	},
	{
		answer:
			'Every scheduled item carries a readiness layer that checks the essentials before it reaches the queue. Teams stop discovering missing assets or unclear approvals at the last minute.',
		question: 'How do we know something is actually ready to publish?',
	},
] as const;

const getToneStyles = (theme: Theme, tone: AccentTone) => {
	if (tone === 'success') {
		return {
			backgroundColor: varAlpha(theme.vars.palette.success.mainChannel, 0.16),
			borderColor: varAlpha(theme.vars.palette.success.mainChannel, 0.3),
			color: theme.vars.palette.success.light,
		};
	}

	if (tone === 'warning') {
		return {
			backgroundColor: varAlpha(theme.vars.palette.warning.mainChannel, 0.16),
			borderColor: varAlpha(theme.vars.palette.warning.mainChannel, 0.3),
			color: theme.vars.palette.warning.light,
		};
	}

	if (tone === 'info') {
		return {
			backgroundColor: varAlpha(theme.vars.palette.info.mainChannel, 0.16),
			borderColor: varAlpha(theme.vars.palette.info.mainChannel, 0.3),
			color: theme.vars.palette.info.light,
		};
	}

	return {
		backgroundColor: varAlpha(theme.vars.palette.primary.mainChannel, 0.16),
		borderColor: varAlpha(theme.vars.palette.primary.mainChannel, 0.3),
		color: theme.vars.palette.primary.light,
	};
};

const getFrostCardStyles = (theme: Theme) => {
	return {
		background:
			'linear-gradient(180deg, rgba(255, 255, 255, 0.09), rgba(255, 255, 255, 0.04))',
		backdropFilter: 'blur(20px)',
		WebkitBackdropFilter: 'blur(20px)',
		border: `1px solid ${varAlpha(theme.vars.palette.common.whiteChannel, 0.14)}`,
		boxShadow: `0 24px 60px ${varAlpha(
			theme.vars.palette.common.blackChannel,
			0.22,
		)}`,
	};
};

const mutedTextColor = (theme: Theme) => {
	return varAlpha(theme.vars.palette.common.whiteChannel, 0.72);
};

const SectionShell = ({ children, id, sx }: SectionShellProps) => {
	return (
		<Box
			component="section"
			id={id}
			sx={[
				{
					position: 'relative',
					py: { xs: 8, md: 11 },
				},
				...(Array.isArray(sx) ? sx : [sx]),
			]}
		>
			<Container maxWidth="xl">{children}</Container>
		</Box>
	);
};

const SectionHeading = ({
	caption,
	description,
	title,
}: SectionHeadingProps) => {
	return (
		<Stack spacing={2} sx={{ maxWidth: 760 }}>
			<Typography
				variant="overline"
				sx={(theme) => {
					return {
						color: theme.vars.palette.primary.light,
						letterSpacing: '0.24em',
					};
				}}
			>
				{caption}
			</Typography>

			<Typography
				component="h2"
				sx={(theme) => {
					return {
						fontSize: {
							xs: theme.typography.pxToRem(34),
							md: theme.typography.pxToRem(48),
						},
						lineHeight: 1,
						fontWeight: theme.typography.fontWeightSemiBold,
						fontFamily: theme.typography.fontSecondaryFamily,
					};
				}}
			>
				{title}
			</Typography>

			<Typography
				component="p"
				variant="body1"
				sx={(theme) => {
					return {
						maxWidth: 640,
						fontSize: theme.typography.pxToRem(16),
						lineHeight: 1.7,
						color: mutedTextColor(theme),
					};
				}}
			>
				{description}
			</Typography>
		</Stack>
	);
};

const FrostCard = ({ children, sx }: FrostCardProps) => {
	return (
		<Box
			sx={[
				(theme) => {
					return {
						borderRadius: '28px',
						...getFrostCardStyles(theme),
					};
				},
				...(Array.isArray(sx) ? sx : [sx]),
			]}
		>
			{children}
		</Box>
	);
};

const ProductMockup = () => {
	return (
		<Box sx={{ position: 'relative' }}>
			<FrostCard
				sx={{
					position: 'relative',
					overflow: 'hidden',
					p: { xs: 2, md: 3 },
				}}
			>
				<Box
					sx={(theme) => {
						return {
							position: 'absolute',
							inset: 0,
							backgroundImage: `
								radial-gradient(circle at 12% 0%, ${varAlpha(
									theme.vars.palette.primary.mainChannel,
									0.22,
								)}, transparent 36%),
								radial-gradient(circle at 100% 10%, ${varAlpha(
									theme.vars.palette.info.mainChannel,
									0.18,
								)}, transparent 32%)
							`,
							pointerEvents: 'none',
						};
					}}
				/>

				<Stack spacing={2.5} sx={{ position: 'relative', zIndex: 1 }}>
					<Stack
						direction={{ xs: 'column', sm: 'row' }}
						spacing={1.5}
						justifyContent="space-between"
					>
						<Stack spacing={0.75}>
							<Typography
								variant="overline"
								sx={(theme) => {
									return {
										color: mutedTextColor(theme),
										letterSpacing: '0.18em',
									};
								}}
							>
								PublyApp agency delivery board
							</Typography>

							<Typography component="h2" variant="h4">
								One client week, one visible workflow.
							</Typography>
						</Stack>

						<Stack
							direction="row"
							spacing={1}
							useFlexGap
							flexWrap="wrap"
							alignItems="flex-start"
						>
							<Chip
								icon={<Groups2Rounded />}
								label="3 active client workspaces"
								size="small"
								sx={(theme) => {
									return {
										color: 'common.white',
										bgcolor: varAlpha(
											theme.vars.palette.common.whiteChannel,
											0.08,
										),
										border: `1px solid ${varAlpha(
											theme.vars.palette.common.whiteChannel,
											0.1,
										)}`,
									};
								}}
							/>

							<Chip
								icon={<CalendarMonthRounded />}
								label="9 items awaiting approval"
								size="small"
								sx={(theme) => {
									return {
										color: 'common.white',
										bgcolor: varAlpha(
											theme.vars.palette.common.whiteChannel,
											0.08,
										),
										border: `1px solid ${varAlpha(
											theme.vars.palette.common.whiteChannel,
											0.1,
										)}`,
									};
								}}
							/>
						</Stack>
					</Stack>

					<Box
						sx={{
							display: 'grid',
							gridTemplateColumns: { xs: '1fr', xl: '1.65fr 1fr' },
							gap: 2,
						}}
					>
						<FrostCard
							sx={{
								p: 2.25,
								borderRadius: '24px',
							}}
						>
							<Stack spacing={2}>
								<Stack
									direction={{ xs: 'column', sm: 'row' }}
									spacing={1}
									justifyContent="space-between"
								>
									<Stack spacing={0.5}>
										<Typography variant="subtitle1">Next seven days</Typography>
										<Typography
											variant="body2"
											sx={(theme) => {
												return { color: mutedTextColor(theme) };
											}}
										>
											Calendar, draft status, and approval signal in one view.
										</Typography>
									</Stack>

									<Chip
										icon={<CompareArrowsRounded />}
										label="Calendar + draft state"
										size="small"
										sx={(theme) => {
											return {
												alignSelf: 'flex-start',
												color: theme.vars.palette.primary.light,
												bgcolor: varAlpha(
													theme.vars.palette.primary.mainChannel,
													0.14,
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
										gridTemplateColumns: {
											xs: '1fr',
											sm: 'repeat(2, 1fr)',
											lg: 'repeat(5, 1fr)',
										},
										gap: 1.25,
									}}
								>
									{workflowColumns.map((column) => {
										return (
											<Box
												key={column.day}
												sx={(theme) => {
													return {
														borderRadius: '20px',
														p: 1.5,
														minHeight: 210,
														backgroundColor: varAlpha(
															theme.vars.palette.common.whiteChannel,
															0.04,
														),
														border: `1px solid ${varAlpha(
															theme.vars.palette.common.whiteChannel,
															0.08,
														)}`,
													};
												}}
											>
												<Stack spacing={1.25}>
													<Stack direction="row" justifyContent="space-between">
														<Typography variant="subtitle2">
															{column.day}
														</Typography>
														<Typography
															variant="caption"
															sx={(theme) => {
																return { color: mutedTextColor(theme) };
															}}
														>
															Apr {column.date}
														</Typography>
													</Stack>

													<Stack spacing={1}>
														{column.cards.map((card) => {
															return (
																<Box
																	key={`${column.day}-${card.title}`}
																	sx={(theme) => {
																		return {
																			borderRadius: '18px',
																			p: 1.25,
																			border: '1px solid transparent',
																			...getToneStyles(theme, card.tone),
																		};
																	}}
																>
																	<Stack spacing={0.75}>
																		<Typography
																			variant="caption"
																			sx={{ opacity: 0.88 }}
																		>
																			{card.channel}
																		</Typography>
																		<Typography variant="subtitle2">
																			{card.title}
																		</Typography>
																		<Typography
																			variant="caption"
																			sx={{ opacity: 0.88 }}
																		>
																			{card.status}
																		</Typography>
																	</Stack>
																</Box>
															);
														})}
													</Stack>
												</Stack>
											</Box>
										);
									})}
								</Box>
							</Stack>
						</FrostCard>

						<Stack spacing={2}>
							<FrostCard
								sx={{
									p: 2.25,
									borderRadius: '24px',
								}}
							>
								<Stack spacing={2}>
									<Stack
										direction={{ xs: 'column', sm: 'row' }}
										spacing={1}
										justifyContent="space-between"
									>
										<Stack spacing={0.5}>
											<Typography variant="subtitle1">Review thread</Typography>
											<Typography
												variant="body2"
												sx={(theme) => {
													return { color: mutedTextColor(theme) };
												}}
											>
												Approval state follows the draft instead of the chat.
											</Typography>
										</Stack>

										<Chip
											icon={<AutoAwesomeRounded />}
											label="AI draft assist"
											size="small"
											sx={(theme) => {
												return {
													alignSelf: 'flex-start',
													color: theme.vars.palette.info.light,
													bgcolor: varAlpha(
														theme.vars.palette.info.mainChannel,
														0.14,
													),
													border: `1px solid ${varAlpha(
														theme.vars.palette.info.mainChannel,
														0.24,
													)}`,
												};
											}}
										/>
									</Stack>

									<Box
										sx={(theme) => {
											return {
												borderRadius: '18px',
												p: 1.5,
												backgroundColor: varAlpha(
													theme.vars.palette.common.whiteChannel,
													0.04,
												),
												border: `1px solid ${varAlpha(
													theme.vars.palette.common.whiteChannel,
													0.08,
												)}`,
											};
										}}
									>
										<Stack spacing={1.25}>
											<Typography variant="subtitle2">
												Launch carousel V4
											</Typography>

											<Stack
												direction="row"
												spacing={1}
												useFlexGap
												flexWrap="wrap"
											>
												<Chip
													label="Internal review"
													size="small"
													sx={(theme) => {
														return {
															...getToneStyles(theme, 'info'),
															border: '1px solid transparent',
															fontWeight: theme.typography.fontWeightMedium,
														};
													}}
												/>
												<Chip
													label="Client sign-off"
													size="small"
													sx={(theme) => {
														return {
															...getToneStyles(theme, 'success'),
															border: '1px solid transparent',
															fontWeight: theme.typography.fontWeightMedium,
														};
													}}
												/>
												<Chip
													label="Ready for queue"
													size="small"
													sx={(theme) => {
														return {
															...getToneStyles(theme, 'primary'),
															border: '1px solid transparent',
															fontWeight: theme.typography.fontWeightMedium,
														};
													}}
												/>
											</Stack>

											<Stack spacing={1}>
												{reviewTimeline.map((item) => {
													return (
														<Stack
															key={item.role}
															direction="row"
															spacing={1.25}
															alignItems="flex-start"
														>
															<Box
																sx={(theme) => {
																	return {
																		mt: '6px',
																		width: 10,
																		height: 10,
																		borderRadius: '999px',
																		flexShrink: 0,
																		...getToneStyles(theme, item.tone),
																	};
																}}
															/>

															<Stack spacing={0.4}>
																<Typography variant="subtitle2">
																	{item.role}
																</Typography>
																<Typography
																	variant="body2"
																	sx={(theme) => {
																		return { color: mutedTextColor(theme) };
																	}}
																>
																	{item.note}
																</Typography>
															</Stack>
														</Stack>
													);
												})}
											</Stack>
										</Stack>
									</Box>
								</Stack>
							</FrostCard>

							<FrostCard
								sx={{
									p: 2.25,
									borderRadius: '24px',
								}}
							>
								<Stack spacing={1.75}>
									<Stack spacing={0.5}>
										<Typography variant="subtitle1">
											Publishing readiness
										</Typography>
										<Typography
											variant="body2"
											sx={(theme) => {
												return { color: mutedTextColor(theme) };
											}}
										>
											The queue only sees work that already passed the
											checklist.
										</Typography>
									</Stack>

									<Stack spacing={1}>
										{readinessChecks.map((check) => {
											return (
												<Stack
													key={check}
													direction="row"
													spacing={1}
													alignItems="center"
													sx={(theme) => {
														return {
															borderRadius: '16px',
															px: 1.25,
															py: 1,
															backgroundColor: varAlpha(
																theme.vars.palette.common.whiteChannel,
																0.04,
															),
															border: `1px solid ${varAlpha(
																theme.vars.palette.common.whiteChannel,
																0.08,
															)}`,
														};
													}}
												>
													<CheckCircleRounded
														color="success"
														fontSize="small"
													/>
													<Typography variant="body2">{check}</Typography>
												</Stack>
											);
										})}
									</Stack>

									<Box
										sx={(theme) => {
											return {
												borderRadius: '18px',
												p: 1.5,
												backgroundColor: varAlpha(
													theme.vars.palette.primary.mainChannel,
													0.12,
												),
												border: `1px solid ${varAlpha(
													theme.vars.palette.primary.mainChannel,
													0.22,
												)}`,
											};
										}}
									>
										<Stack spacing={0.5}>
											<Typography variant="caption" sx={{ opacity: 0.8 }}>
												Queue health
											</Typography>
											<Typography variant="h5">
												5 posts ready to publish on schedule
											</Typography>
											<Typography
												variant="body2"
												sx={(theme) => {
													return { color: mutedTextColor(theme) };
												}}
											>
												Blocked items stay visible before the publisher opens
												the queue.
											</Typography>
										</Stack>
									</Box>
								</Stack>
							</FrostCard>
						</Stack>
					</Box>

					<Box
						sx={{
							display: 'grid',
							gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
							gap: 1.25,
						}}
					>
						{workspaceRows.map((workspace) => {
							return (
								<FrostCard
									key={workspace.client}
									sx={{
										p: 1.5,
										borderRadius: '20px',
									}}
								>
									<Stack spacing={0.8}>
										<Typography variant="subtitle2">
											{workspace.client}
										</Typography>
										<Typography
											variant="body2"
											sx={(theme) => {
												return { color: mutedTextColor(theme) };
											}}
										>
											{workspace.summary}
										</Typography>
										<Box
											sx={(theme) => {
												return {
													alignSelf: 'flex-start',
													borderRadius: '999px',
													px: 1,
													py: 0.5,
													border: '1px solid transparent',
													...getToneStyles(theme, workspace.tone),
												};
											}}
										>
											<Typography variant="caption">
												{workspace.status}
											</Typography>
										</Box>
									</Stack>
								</FrostCard>
							);
						})}
					</Box>
				</Stack>
			</FrostCard>

			<Box
				sx={{
					display: { xs: 'grid', lg: 'none' },
					gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
					gap: 1.25,
					mt: 1.75,
				}}
			>
				{[
					'Campaign view for every client week',
					'Approval state travels with the draft',
					'Readiness checks close the handoff',
				].map((annotation) => {
					return (
						<FrostCard
							key={annotation}
							sx={{
								p: 1.25,
								borderRadius: '18px',
							}}
						>
							<Typography variant="body2">{annotation}</Typography>
						</FrostCard>
					);
				})}
			</Box>

			<FrostCard
				sx={{
					display: { xs: 'none', lg: 'block' },
					position: 'absolute',
					left: -28,
					top: 40,
					p: 1.25,
					maxWidth: 220,
					borderRadius: '18px',
				}}
			>
				<Typography variant="body2">
					Campaign view for every client week.
				</Typography>
			</FrostCard>

			<FrostCard
				sx={{
					display: { xs: 'none', lg: 'block' },
					position: 'absolute',
					right: -24,
					top: 160,
					p: 1.25,
					maxWidth: 210,
					borderRadius: '18px',
				}}
			>
				<Typography variant="body2">
					Approval state travels with the draft.
				</Typography>
			</FrostCard>

			<FrostCard
				sx={{
					display: { xs: 'none', lg: 'block' },
					position: 'absolute',
					left: 28,
					bottom: 26,
					p: 1.25,
					maxWidth: 220,
					borderRadius: '18px',
				}}
			>
				<Typography variant="body2">
					Readiness checks close the handoff before queue time.
				</Typography>
			</FrostCard>
		</Box>
	);
};

const GeneratedHomepage0001Page = () => {
	return (
		<Box
			component="main"
			id="top"
			sx={(theme) => {
				return {
					position: 'relative',
					overflow: 'hidden',
					minHeight: '100vh',
					color: 'common.white',
					backgroundColor: '#09111F',
					backgroundImage: `
						radial-gradient(circle at 0% 0%, ${varAlpha(
							theme.vars.palette.primary.mainChannel,
							0.28,
						)}, transparent 32%),
						radial-gradient(circle at 100% 0%, ${varAlpha(
							theme.vars.palette.info.mainChannel,
							0.18,
						)}, transparent 28%),
						linear-gradient(180deg, #09111F 0%, #0C1728 45%, #09111F 100%)
					`,
					'&::before': {
						content: '""',
						position: 'absolute',
						inset: 0,
						backgroundImage: `
							linear-gradient(${varAlpha(
								theme.vars.palette.common.whiteChannel,
								0.04,
							)} 1px, transparent 1px),
							linear-gradient(90deg, ${varAlpha(
								theme.vars.palette.common.whiteChannel,
								0.04,
							)} 1px, transparent 1px)
						`,
						backgroundSize: '72px 72px',
						maskImage:
							'linear-gradient(180deg, rgba(0, 0, 0, 0.72), transparent 90%)',
						pointerEvents: 'none',
					},
				};
			}}
		>
			<SectionShell
				id="hero"
				sx={{ pt: { xs: 3, md: 4 }, pb: { xs: 7, md: 9 } }}
			>
				<Stack spacing={{ xs: 6, md: 8 }}>
					<Stack
						direction={{ xs: 'column', md: 'row' }}
						spacing={2}
						justifyContent="space-between"
						alignItems={{ xs: 'flex-start', md: 'center' }}
					>
						<Stack direction="row" spacing={1.25} alignItems="center">
							<Box
								sx={(theme) => {
									return {
										width: 14,
										height: 14,
										borderRadius: '999px',
										background:
											'linear-gradient(135deg, #6EE7F9 0%, #2563EB 100%)',
										boxShadow: `0 0 24px ${varAlpha(
											theme.vars.palette.primary.mainChannel,
											0.42,
										)}`,
									};
								}}
							/>
							<Typography
								variant="subtitle1"
								sx={(theme) => {
									return {
										fontWeight: theme.typography.fontWeightSemiBold,
										letterSpacing: '0.04em',
									};
								}}
							>
								PublyApp
							</Typography>
						</Stack>

						<Stack
							direction="row"
							spacing={1}
							useFlexGap
							flexWrap="wrap"
							alignItems="center"
						>
							<Button color="inherit" href="#comparison" sx={{ opacity: 0.82 }}>
								Comparison
							</Button>
							<Button color="inherit" href="#proof" sx={{ opacity: 0.82 }}>
								Workflow proof
							</Button>
							<Button color="inherit" href="#faq" sx={{ opacity: 0.82 }}>
								FAQ
							</Button>
							<Button
								variant="outlined"
								href={FRONT_PATH_NAMES.auth.signup}
								endIcon={<ArrowForwardRounded />}
								sx={(theme) => {
									return {
										borderColor: varAlpha(
											theme.vars.palette.common.whiteChannel,
											0.16,
										),
										color: 'common.white',
										'&:hover': {
											borderColor: varAlpha(
												theme.vars.palette.common.whiteChannel,
												0.3,
											),
											backgroundColor: varAlpha(
												theme.vars.palette.common.whiteChannel,
												0.04,
											),
										},
									};
								}}
							>
								Book a walkthrough
							</Button>
						</Stack>
					</Stack>

					<Box
						sx={{
							display: 'grid',
							gridTemplateColumns: {
								xs: '1fr',
								lg: 'minmax(0, 0.95fr) minmax(0, 1.05fr)',
							},
							gap: { xs: 4, lg: 5 },
							alignItems: 'center',
						}}
					>
						<Stack spacing={3}>
							<Chip
								label="For agencies dealing with client approval bottlenecks"
								size="small"
								sx={(theme) => {
									return {
										alignSelf: 'flex-start',
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

							<Stack spacing={2.5}>
								<Typography
									component="h1"
									sx={(theme) => {
										return {
											maxWidth: 720,
											fontSize: {
												xs: theme.typography.pxToRem(42),
												md: theme.typography.pxToRem(72),
											},
											lineHeight: { xs: 1.04, md: 0.98 },
											fontWeight: theme.typography.fontWeightSemiBold,
											fontFamily: theme.typography.fontSecondaryFamily,
											letterSpacing: '-0.04em',
										};
									}}
								>
									Replace tool sprawl with one publishing workflow clients can
									actually move through.
								</Typography>

								<Typography
									component="p"
									variant="body1"
									sx={(theme) => {
										return {
											maxWidth: 620,
											fontSize: theme.typography.pxToRem(18),
											lineHeight: 1.75,
											color: mutedTextColor(theme),
										};
									}}
								>
									PublyApp brings campaign planning, AI-assisted drafting,
									review, and publishing readiness into one operational view, so
									strategists, creators, and publishers stop rebuilding context
									at every handoff.
								</Typography>
							</Stack>

							<Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
								{[
									'Campaign visibility',
									'Approval clarity',
									'Publishing readiness',
								].map((label) => {
									return (
										<Chip
											key={label}
											label={label}
											size="small"
											sx={(theme) => {
												return {
													color: 'common.white',
													bgcolor: varAlpha(
														theme.vars.palette.common.whiteChannel,
														0.08,
													),
													border: `1px solid ${varAlpha(
														theme.vars.palette.common.whiteChannel,
														0.1,
													)}`,
												};
											}}
										/>
									);
								})}
							</Stack>

							<Stack
								direction={{ xs: 'column', sm: 'row' }}
								spacing={1.5}
								useFlexGap
							>
								<Button
									href={FRONT_PATH_NAMES.auth.signup}
									size="large"
									variant="contained"
									endIcon={<ArrowForwardRounded />}
									sx={(theme) => {
										return {
											minWidth: 210,
											background:
												'linear-gradient(135deg, #60A5FA 0%, #2563EB 100%)',
											boxShadow: `0 18px 36px ${varAlpha(
												theme.vars.palette.primary.mainChannel,
												0.32,
											)}`,
										};
									}}
								>
									Book a walkthrough
								</Button>

								<Button
									href="#proof"
									size="large"
									variant="outlined"
									endIcon={<ChevronRightRounded />}
									sx={(theme) => {
										return {
											minWidth: 190,
											borderColor: varAlpha(
												theme.vars.palette.common.whiteChannel,
												0.16,
											),
											color: 'common.white',
											'&:hover': {
												borderColor: varAlpha(
													theme.vars.palette.common.whiteChannel,
													0.3,
												),
												backgroundColor: varAlpha(
													theme.vars.palette.common.whiteChannel,
													0.04,
												),
											},
										};
									}}
								>
									See the workflow
								</Button>
							</Stack>

							<Box
								sx={{
									display: 'grid',
									gridTemplateColumns: {
										xs: '1fr',
										sm: 'repeat(3, minmax(0, 1fr))',
									},
									gap: 1.5,
									pt: 1,
								}}
							>
								{[
									{
										title: 'Less context switching',
										copy: 'Campaign, draft, approval, and queue state live in the same operating view.',
									},
									{
										title: 'Fewer blind handoffs',
										copy: 'The next role opens the same record with the latest decision already attached.',
									},
									{
										title: 'Operational visibility',
										copy: 'Account leads can see what is blocked, approved, and publish-ready across clients.',
									},
								].map((item) => {
									return (
										<FrostCard
											key={item.title}
											sx={{
												p: 1.75,
												borderRadius: '22px',
											}}
										>
											<Stack spacing={0.9}>
												<Typography variant="subtitle2">
													{item.title}
												</Typography>
												<Typography
													variant="body2"
													sx={(theme) => {
														return { color: mutedTextColor(theme) };
													}}
												>
													{item.copy}
												</Typography>
											</Stack>
										</FrostCard>
									);
								})}
							</Box>
						</Stack>

						<ProductMockup />
					</Box>
				</Stack>
			</SectionShell>

			<SectionShell id="comparison">
				<Stack spacing={4}>
					<SectionHeading
						caption="Comparison-led"
						title="The real bottleneck is everything between the brief and the queue."
						description="Agencies rarely lose time on the act of publishing. They lose it while reconstructing context across docs, chats, review tools, and schedulers. PublyApp replaces that fragmented path with one clearer operating system."
					/>

					<FrostCard
						sx={{
							overflow: 'hidden',
						}}
					>
						<TableContainer>
							<Table
								sx={(theme) => {
									return {
										'& .MuiTableCell-root': {
											borderColor: varAlpha(
												theme.vars.palette.common.whiteChannel,
												0.08,
											),
											verticalAlign: 'top',
											px: { xs: 2, md: 3 },
											py: 2.25,
										},
									};
								}}
							>
								<TableHead>
									<TableRow>
										<TableCell sx={{ width: { md: '20%' } }}>
											<Typography variant="overline">Workflow layer</Typography>
										</TableCell>
										<TableCell sx={{ width: { md: '40%' } }}>
											<Typography variant="overline">
												Fragmented stack
											</Typography>
										</TableCell>
										<TableCell sx={{ width: { md: '40%' } }}>
											<Typography variant="overline">PublyApp</Typography>
										</TableCell>
									</TableRow>
								</TableHead>

								<TableBody>
									{comparisonRows.map((row) => {
										return (
											<TableRow key={row.label}>
												<TableCell>
													<Typography variant="subtitle2">
														{row.label}
													</Typography>
												</TableCell>
												<TableCell>
													<Typography
														variant="body2"
														sx={(theme) => {
															return { color: mutedTextColor(theme) };
														}}
													>
														{row.fragmented}
													</Typography>
												</TableCell>
												<TableCell>
													<Stack
														direction="row"
														spacing={1.25}
														alignItems="flex-start"
													>
														<CheckCircleRounded
															color="success"
															fontSize="small"
															sx={{ mt: '2px' }}
														/>
														<Typography
															variant="body2"
															sx={{ color: 'common.white' }}
														>
															{row.publy}
														</Typography>
													</Stack>
												</TableCell>
											</TableRow>
										);
									})}
								</TableBody>
							</Table>
						</TableContainer>
					</FrostCard>

					<Box
						sx={{
							display: 'grid',
							gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
							gap: 1.5,
						}}
					>
						{proofMetrics.map((metric) => {
							return (
								<FrostCard
									key={metric.label}
									sx={{
										p: 2,
										borderRadius: '24px',
									}}
								>
									<Stack spacing={1.2}>
										<Typography
											sx={(theme) => {
												return {
													fontSize: theme.typography.pxToRem(40),
													lineHeight: 1,
													fontWeight: theme.typography.fontWeightSemiBold,
												};
											}}
										>
											{metric.value}
										</Typography>
										<Typography variant="subtitle2">{metric.label}</Typography>
										<Typography
											variant="body2"
											sx={(theme) => {
												return { color: mutedTextColor(theme) };
											}}
										>
											{metric.detail}
										</Typography>
									</Stack>
								</FrostCard>
							);
						})}
					</Box>
				</Stack>
			</SectionShell>

			<SectionShell id="benefits">
				<Stack spacing={4}>
					<SectionHeading
						caption="Core benefits"
						title="Why agency teams switch once the workflow becomes visible."
						description="The value is not another content tool. It is one operating model that cuts approval friction, reduces revision churn, and keeps publishing readiness visible across multiple client accounts."
					/>

					<Box
						sx={{
							display: 'grid',
							gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, 1fr)' },
							gap: 1.5,
						}}
					>
						{benefitCards.map((benefit) => {
							return (
								<FrostCard
									key={benefit.title}
									sx={{
										p: 2.5,
										borderRadius: '28px',
										height: '100%',
									}}
								>
									<Stack spacing={2.25} sx={{ height: '100%' }}>
										<Box
											sx={(theme) => {
												return {
													width: 48,
													height: 48,
													display: 'grid',
													placeItems: 'center',
													borderRadius: '16px',
													color: theme.vars.palette.primary.light,
													backgroundColor: varAlpha(
														theme.vars.palette.primary.mainChannel,
														0.14,
													),
													border: `1px solid ${varAlpha(
														theme.vars.palette.primary.mainChannel,
														0.24,
													)}`,
												};
											}}
										>
											{benefit.icon}
										</Box>

										<Stack spacing={1.1}>
											<Typography variant="h5">{benefit.title}</Typography>
											<Typography
												variant="body2"
												sx={(theme) => {
													return {
														fontSize: theme.typography.pxToRem(14),
														lineHeight: 1.75,
														color: mutedTextColor(theme),
													};
												}}
											>
												{benefit.description}
											</Typography>
										</Stack>

										<Divider
											sx={(theme) => {
												return {
													borderColor: varAlpha(
														theme.vars.palette.common.whiteChannel,
														0.08,
													),
												};
											}}
										/>

										<Stack spacing={1.15}>
											{benefit.points.map((point) => {
												return (
													<Stack
														key={point}
														direction="row"
														spacing={1}
														alignItems="flex-start"
													>
														<TaskAltRounded
															color="primary"
															fontSize="small"
															sx={{ mt: '2px' }}
														/>
														<Typography
															variant="body2"
															sx={(theme) => {
																return { color: mutedTextColor(theme) };
															}}
														>
															{point}
														</Typography>
													</Stack>
												);
											})}
										</Stack>
									</Stack>
								</FrostCard>
							);
						})}
					</Box>
				</Stack>
			</SectionShell>

			<SectionShell id="proof">
				<Stack spacing={4}>
					<SectionHeading
						caption="Workflow proof"
						title="Show the team where the work stands before publish day becomes chaos."
						description="Agencies do not need abstract charts as proof. They need visible coordination: which client work is blocked, who owns the next decision, and what is actually ready for the queue."
					/>

					<Box
						sx={{
							display: 'grid',
							gridTemplateColumns: { xs: '1fr', xl: '1.05fr 0.95fr' },
							gap: 1.5,
						}}
					>
						<FrostCard
							sx={{
								p: 2.5,
								borderRadius: '28px',
							}}
						>
							<Stack spacing={2}>
								<Stack spacing={0.75}>
									<Typography variant="h5">
										Multi-workflow visibility
									</Typography>
									<Typography
										variant="body2"
										sx={(theme) => {
											return { color: mutedTextColor(theme) };
										}}
									>
										Account leads can read the week across client teams without
										building a status update from scratch.
									</Typography>
								</Stack>

								<Stack spacing={1.25}>
									{workspaceRows.map((workspace) => {
										return (
											<Box
												key={`${workspace.client}-proof`}
												sx={(theme) => {
													return {
														borderRadius: '20px',
														p: 1.5,
														backgroundColor: varAlpha(
															theme.vars.palette.common.whiteChannel,
															0.04,
														),
														border: `1px solid ${varAlpha(
															theme.vars.palette.common.whiteChannel,
															0.08,
														)}`,
													};
												}}
											>
												<Stack
													direction={{ xs: 'column', md: 'row' }}
													spacing={1}
													justifyContent="space-between"
												>
													<Stack spacing={0.45}>
														<Typography variant="subtitle2">
															{workspace.client}
														</Typography>
														<Typography
															variant="body2"
															sx={(theme) => {
																return { color: mutedTextColor(theme) };
															}}
														>
															{workspace.summary}
														</Typography>
													</Stack>

													<Box
														sx={(theme) => {
															return {
																alignSelf: 'flex-start',
																borderRadius: '999px',
																px: 1,
																py: 0.5,
																border: '1px solid transparent',
																...getToneStyles(theme, workspace.tone),
															};
														}}
													>
														<Typography variant="caption">
															{workspace.status}
														</Typography>
													</Box>
												</Stack>
											</Box>
										);
									})}
								</Stack>

								<FrostCard
									sx={{
										p: 1.75,
										borderRadius: '22px',
									}}
								>
									<Stack spacing={1}>
										<Typography variant="subtitle2">
											Operational difference
										</Typography>
										<Typography
											variant="body2"
											sx={(theme) => {
												return { color: mutedTextColor(theme) };
											}}
										>
											Instead of asking who has the latest copy or whether a
											client already approved it, teams open one record and see
											the answer immediately.
										</Typography>
									</Stack>
								</FrostCard>
							</Stack>
						</FrostCard>

						<Stack spacing={1.5}>
							<FrostCard
								sx={{
									p: 2.5,
									borderRadius: '28px',
								}}
							>
								<Stack spacing={2}>
									<Stack spacing={0.75}>
										<Typography variant="h5">Approval clarity</Typography>
										<Typography
											variant="body2"
											sx={(theme) => {
												return { color: mutedTextColor(theme) };
											}}
										>
											Everyone can see the current owner and the next decision
											without leaving the draft.
										</Typography>
									</Stack>

									<Stack spacing={1.1}>
										{[
											{
												title: 'Internal review',
												copy: 'Message and proof points locked before client share.',
												tone: 'info' as const,
											},
											{
												title: 'Client sign-off',
												copy: 'Feedback attached to the latest draft version.',
												tone: 'success' as const,
											},
											{
												title: 'Queue ready',
												copy: 'Caption, asset, and publish checks already cleared.',
												tone: 'primary' as const,
											},
										].map((lane) => {
											return (
												<Stack
													key={lane.title}
													direction="row"
													spacing={1.1}
													alignItems="flex-start"
												>
													<Box
														sx={(theme) => {
															return {
																mt: '6px',
																width: 11,
																height: 11,
																borderRadius: '999px',
																flexShrink: 0,
																...getToneStyles(theme, lane.tone),
															};
														}}
													/>
													<Stack spacing={0.3}>
														<Typography variant="subtitle2">
															{lane.title}
														</Typography>
														<Typography
															variant="body2"
															sx={(theme) => {
																return { color: mutedTextColor(theme) };
															}}
														>
															{lane.copy}
														</Typography>
													</Stack>
												</Stack>
											);
										})}
									</Stack>
								</Stack>
							</FrostCard>

							<FrostCard
								sx={{
									p: 2.5,
									borderRadius: '28px',
								}}
							>
								<Stack spacing={2}>
									<Stack spacing={0.75}>
										<Typography variant="h5">Publishing readiness</Typography>
										<Typography
											variant="body2"
											sx={(theme) => {
												return { color: mutedTextColor(theme) };
											}}
										>
											Publishers spend time shipping, not verifying whether the
											basics are ready.
										</Typography>
									</Stack>

									<Stack spacing={0.9}>
										{readinessChecks.map((check) => {
											return (
												<Stack
													key={`${check}-proof`}
													direction="row"
													spacing={1}
													alignItems="center"
												>
													<CheckCircleRounded
														color="success"
														fontSize="small"
													/>
													<Typography variant="body2">{check}</Typography>
												</Stack>
											);
										})}
									</Stack>
								</Stack>
							</FrostCard>
						</Stack>
					</Box>
				</Stack>
			</SectionShell>

			<SectionShell id="faq">
				<Stack spacing={4}>
					<SectionHeading
						caption="FAQ"
						title="Questions agency teams ask before replacing the old stack."
						description="The common concern is not whether another tool can draft copy. It is whether the workflow can handle client collaboration, faster handoffs, and enough structure to standardize delivery."
					/>

					<Stack spacing={1.25}>
						{faqItems.map((item) => {
							return (
								<Accordion
									key={item.question}
									disableGutters
									sx={(theme) => {
										return {
											borderRadius: '24px !important',
											...getFrostCardStyles(theme),
											'&::before': { display: 'none' },
										};
									}}
								>
									<AccordionSummary
										expandIcon={
											<ExpandMoreRounded sx={{ color: 'common.white' }} />
										}
										sx={{ px: { xs: 2, md: 3 }, py: 0.5 }}
									>
										<Typography
											component="h3"
											variant="subtitle1"
											sx={{ pr: 2 }}
										>
											{item.question}
										</Typography>
									</AccordionSummary>

									<AccordionDetails sx={{ px: { xs: 2, md: 3 }, pt: 0, pb: 3 }}>
										<Typography
											component="p"
											variant="body1"
											sx={(theme) => {
												return {
													maxWidth: 920,
													fontSize: theme.typography.pxToRem(15),
													lineHeight: 1.8,
													color: mutedTextColor(theme),
												};
											}}
										>
											{item.answer}
										</Typography>
									</AccordionDetails>
								</Accordion>
							);
						})}
					</Stack>
				</Stack>
			</SectionShell>

			<SectionShell
				id="final-cta"
				sx={{ pt: { xs: 6, md: 8 }, pb: { xs: 10, md: 14 } }}
			>
				<FrostCard
					sx={{
						p: { xs: 2.5, md: 4 },
						borderRadius: '34px',
					}}
				>
					<Box
						sx={{
							display: 'grid',
							gridTemplateColumns: { xs: '1fr', lg: '1.2fr 0.8fr' },
							gap: 3,
							alignItems: 'center',
						}}
					>
						<Stack spacing={2.5}>
							<Chip
								label="Final CTA"
								size="small"
								sx={(theme) => {
									return {
										alignSelf: 'flex-start',
										color: theme.vars.palette.primary.light,
										bgcolor: varAlpha(
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

							<Stack spacing={1.5}>
								<Typography
									component="h2"
									sx={(theme) => {
										return {
											fontSize: {
												xs: theme.typography.pxToRem(34),
												md: theme.typography.pxToRem(54),
											},
											lineHeight: 1,
											fontWeight: theme.typography.fontWeightSemiBold,
											fontFamily: theme.typography.fontSecondaryFamily,
										};
									}}
								>
									Run the next client delivery cycle from one clearer operating
									system.
								</Typography>

								<Typography
									component="p"
									variant="body1"
									sx={(theme) => {
										return {
											maxWidth: 680,
											fontSize: theme.typography.pxToRem(17),
											lineHeight: 1.75,
											color: mutedTextColor(theme),
										};
									}}
								>
									See how PublyApp handles campaign planning, AI-assisted
									drafting, approvals, and publishing readiness for the kind of
									client workflow that usually spans too many tabs.
								</Typography>
							</Stack>

							<Stack
								direction={{ xs: 'column', sm: 'row' }}
								spacing={1.5}
								useFlexGap
							>
								<Button
									href={FRONT_PATH_NAMES.auth.signup}
									size="large"
									variant="contained"
									endIcon={<ArrowForwardRounded />}
									sx={(theme) => {
										return {
											minWidth: 210,
											background:
												'linear-gradient(135deg, #60A5FA 0%, #2563EB 100%)',
											boxShadow: `0 18px 36px ${varAlpha(
												theme.vars.palette.primary.mainChannel,
												0.32,
											)}`,
										};
									}}
								>
									Book a walkthrough
								</Button>

								<Button
									href="#proof"
									size="large"
									variant="outlined"
									startIcon={<PublishRounded />}
									sx={(theme) => {
										return {
											minWidth: 180,
											borderColor: varAlpha(
												theme.vars.palette.common.whiteChannel,
												0.16,
											),
											color: 'common.white',
											'&:hover': {
												borderColor: varAlpha(
													theme.vars.palette.common.whiteChannel,
													0.3,
												),
												backgroundColor: varAlpha(
													theme.vars.palette.common.whiteChannel,
													0.04,
												),
											},
										};
									}}
								>
									See the workflow
								</Button>
							</Stack>
						</Stack>

						<FrostCard
							sx={{
								p: 2.25,
								borderRadius: '28px',
							}}
						>
							<Stack spacing={1.4}>
								<Typography variant="subtitle1">
									What the walkthrough should answer
								</Typography>

								{[
									'How one team manages multiple client calendars without losing status visibility',
									'How approvals stay attached to the draft from strategist to client to publisher',
									'How publishing readiness is checked before a post reaches the queue',
								].map((item) => {
									return (
										<Stack
											key={item}
											direction="row"
											spacing={1}
											alignItems="flex-start"
										>
											<TaskAltRounded
												color="primary"
												fontSize="small"
												sx={{ mt: '2px' }}
											/>
											<Typography
												variant="body2"
												sx={(theme) => {
													return { color: mutedTextColor(theme) };
												}}
											>
												{item}
											</Typography>
										</Stack>
									);
								})}
							</Stack>
						</FrostCard>
					</Box>
				</FrostCard>
			</SectionShell>
		</Box>
	);
};

export default GeneratedHomepage0001Page;
