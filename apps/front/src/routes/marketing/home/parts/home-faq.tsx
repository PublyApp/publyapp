import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';

import { MotionViewport, varFade } from '#app/components/animate/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';

// ----------------------------------------------------------------------

type FaqItem = {
	question: string;
	answer: string;
	defaultOpen?: boolean;
};

const FAQS: FaqItem[] = [
	{
		question: 'How many social accounts can I connect?',
		answer:
			"Unlimited social profiles on the Scale plan, or up to 5 on Creator. Each connected profile counts once across PublyApp's queue, inbox, and analytics — no double-billing for cross-posting.",
	},
	{
		question: 'Does the AI caption writer use real brand data?',
		answer:
			'Yes, when you set up your workspace, you provide a brief brand guidelines document. Our AI uses this specifically to mirror your tone, vocabulary, and common emojis to ensure every post sounds authentically like you.',
		defaultOpen: true,
	},
	{
		question: 'Can I invite my team or clients to collaborate?',
		answer:
			'Yes — invite unlimited team members on Scale with role-based permissions for editors, approvers, and read-only clients. Every action is logged so you always know who scheduled, edited, or replied to what.',
	},
	{
		question: 'What happens if a social network API goes down?',
		answer:
			"We queue your scheduled posts and retry automatically when the network recovers. You'll get a notification with the affected post, and our system handles the re-publish without losing the time slot.",
	},
];

const SectionEyebrow = ({ label }: { label: string }) => {
	return (
		<Box
			sx={{
				display: 'inline-block',
				px: 1.5,
				py: 0.5,
				bgcolor: 'background.paper',
				borderRadius: '6px',
				boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)',
				border: '1px solid',
				borderColor: 'divider',
				mb: 2,
				fontSize: 12,
				fontWeight: 700,
				color: 'primary.main',
				letterSpacing: '0.1em',
				textTransform: 'uppercase',
			}}
		>
			{label}
		</Box>
	);
};

export const HomeFaq = () => {
	return (
		<Box
			component="section"
			id="faqs"
			sx={{
				py: { xs: 10, md: 12 },
				bgcolor: 'background.default',
			}}
		>
			<Container maxWidth="md" component={MotionViewport}>
				<Box sx={{ textAlign: 'center', mb: 8 }}>
					<m.div variants={varFade('inUp', { distance: 24 })}>
						<SectionEyebrow label="FAQ" />
					</m.div>

					<m.div variants={varFade('inUp', { distance: 24 })}>
						<Typography
							component="h2"
							sx={{
								fontSize: 36,
								fontWeight: 800,
								color: 'text.primary',
							}}
						>
							Frequently asked{' '}
							<Box component="span" sx={{ color: 'primary.main' }}>
								questions
							</Box>
						</Typography>
					</m.div>

					<m.div variants={varFade('inUp', { distance: 24 })}>
						<Typography sx={{ color: 'text.secondary', mt: 1 }}>
							Everything you need to know about getting started.
						</Typography>
					</m.div>
				</Box>

				<Stack spacing={2}>
					{FAQS.map((faq) => {
						return (
							<Accordion
								key={faq.question}
								defaultExpanded={faq.defaultOpen}
								disableGutters
								square
								elevation={0}
								sx={{
									bgcolor: 'background.paper',
									borderRadius: 2,
									boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)',
									border: '1px solid',
									borderColor: 'divider',
									overflow: 'hidden',
									'&:before': { display: 'none' },
									'&.Mui-expanded': { margin: 0, borderRadius: 2 },
								}}
							>
								<AccordionSummary
									expandIcon={
										<Iconify
											icon={'ph:plus-bold' as never}
											width={16}
											sx={{ color: 'text.disabled' }}
										/>
									}
									sx={{
										px: 3,
										py: 1.5,
										'& .MuiAccordionSummary-content': { my: 1.5 },
										'& .MuiAccordionSummary-expandIconWrapper': {
											transition: 'transform 0.25s ease, color 0.25s ease',
											'&.Mui-expanded': {
												transform: 'rotate(45deg)',
												color: 'primary.main',
												'& svg': { color: 'primary.main' },
											},
										},
									}}
								>
									<Typography
										component="h4"
										sx={{
											fontSize: 14,
											fontWeight: 600,
											color: 'text.primary',
										}}
									>
										{faq.question}
									</Typography>
								</AccordionSummary>
								<AccordionDetails sx={{ px: 3, pb: 3, pt: 0 }}>
									<Typography
										sx={{
											fontSize: 14,
											color: 'text.secondary',
											lineHeight: 1.7,
											pr: 4,
										}}
									>
										{faq.answer}
									</Typography>
								</AccordionDetails>
							</Accordion>
						);
					})}
				</Stack>
			</Container>
		</Box>
	);
};
