import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { varAlpha } from 'minimal-shared/utils';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { ContentBand } from '#app/routes/marketing/_components/content-band.tsx';
import { CtaBand } from '#app/routes/marketing/_components/cta-band.tsx';
import { MarketingHero } from '#app/routes/marketing/_components/marketing-hero.tsx';
import {
	SECURITY_CONTACT_EMAIL,
	SECURITY_PILLARS,
	SUB_PROCESSORS,
	TRUST_BADGES,
} from '#app/routes/marketing/_data/security.ts';

// ----------------------------------------------------------------------

const SubProcessorsTable = () => {
	return (
		<Box sx={{ overflowX: 'auto' }}>
			<Box
				component="table"
				sx={{
					width: '100%',
					minWidth: 480,
					borderCollapse: 'collapse',
					fontSize: 14,
					'& th, & td': {
						textAlign: 'left',
						px: 2,
						py: 1.5,
						borderBottom: '1px solid',
						borderColor: 'divider',
					},
					'& th': {
						fontSize: 12,
						fontWeight: 700,
						textTransform: 'uppercase',
						letterSpacing: '0.08em',
						color: 'text.secondary',
					},
					'& td': {
						color: 'text.primary',
					},
				}}
			>
				<Box component="thead">
					<Box component="tr">
						<Box component="th" scope="col">
							Vendor
						</Box>
						<Box component="th" scope="col">
							Purpose
						</Box>
						<Box component="th" scope="col">
							Region
						</Box>
					</Box>
				</Box>
				<Box component="tbody">
					{SUB_PROCESSORS.map((row) => {
						return (
							<Box component="tr" key={row.id}>
								<Box component="td" sx={{ fontWeight: 600 }}>
									{row.vendor}
								</Box>
								<Box component="td" sx={{ color: 'text.secondary' }}>
									{row.purpose}
								</Box>
								<Box
									component="td"
									sx={{
										color: 'text.secondary',
										fontFamily: 'monospace',
										fontSize: 13,
									}}
								>
									{row.region}
								</Box>
							</Box>
						);
					})}
				</Box>
			</Box>
		</Box>
	);
};

// ----------------------------------------------------------------------

const SecurityPage = () => {
	return (
		<>
			<MarketingHero
				eyebrow="Security & Trust"
				eyebrowIcon="ph:shield-check-bold"
				title="Built for teams that take security seriously"
				subhead="Bank-grade encryption, SOC 2 Type II compliance, and infrastructure that scales seamlessly with your enterprise requirements."
				secondaryCta={{
					label: `Email ${SECURITY_CONTACT_EMAIL}`,
					href: `mailto:${SECURITY_CONTACT_EMAIL}`,
				}}
			/>

			{/* Verified Compliance — inline grayscale pills (canvas-faithful) */}
			<Box
				component="section"
				sx={{
					py: { xs: 6, md: 8 },
				}}
			>
				<Container maxWidth="lg">
					<Typography
						sx={{
							fontSize: 12,
							fontWeight: 700,
							textTransform: 'uppercase',
							letterSpacing: '0.18em',
							color: 'text.secondary',
							textAlign: 'center',
							mb: 3,
						}}
					>
						Verified Compliance
					</Typography>
					<Box
						sx={{
							display: 'flex',
							flexWrap: 'wrap',
							justifyContent: 'center',
							gap: { xs: 2, sm: 3 },
						}}
					>
						{TRUST_BADGES.map((badge) => {
							return (
								<Stack
									key={badge.id}
									alignItems="center"
									spacing={1}
									sx={{
										minWidth: 140,
										px: 3,
										py: 2,
										bgcolor: 'background.paper',
										border: '1px solid',
										borderColor: 'divider',
										borderRadius: '16px',
										color: 'text.secondary',
										filter: 'grayscale(1)',
										opacity: 0.75,
										transition:
											'filter 240ms ease, opacity 240ms ease, transform 240ms ease, box-shadow 240ms ease',
										'&:hover': {
											filter: 'grayscale(0)',
											opacity: 1,
											transform: 'translateY(-2px)',
											boxShadow: '0 8px 16px -8px rgba(17,24,39,0.10)',
										},
									}}
								>
									<Iconify icon={badge.icon} width={28} />
									<Typography
										sx={{
											fontSize: 12,
											fontWeight: 600,
											color: 'text.primary',
										}}
									>
										{badge.label}
									</Typography>
								</Stack>
							);
						})}
					</Box>
				</Container>
			</Box>

			{/* Defense in depth */}
			<ContentBand
				eyebrow="How we protect you"
				title="Defense in depth"
				subhead="Six layers of protection conceptualized to secure every endpoint, transit path, and stored byte across our entire infrastructure."
			>
				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: {
							xs: '1fr',
							sm: 'repeat(2, 1fr)',
							md: 'repeat(3, 1fr)',
						},
						gap: 3,
					}}
				>
					{SECURITY_PILLARS.map((pillar) => {
						return (
							<Box
								key={pillar.id}
								sx={{
									p: 3,
									borderRadius: '20px',
									bgcolor: 'background.paper',
									border: '1px solid',
									borderColor: 'divider',
								}}
							>
								<Box
									sx={{
										width: 48,
										height: 48,
										borderRadius: '12px',
										display: 'inline-flex',
										alignItems: 'center',
										justifyContent: 'center',
										bgcolor: 'primary.lighter',
										color: 'primary.main',
										mb: 3,
									}}
								>
									<Iconify icon={pillar.icon} width={24} />
								</Box>
								<Typography
									sx={{
										fontSize: 18,
										fontWeight: 700,
										color: 'text.primary',
										mb: 1,
									}}
								>
									{pillar.title}
								</Typography>
								<Typography
									sx={{
										fontSize: 14,
										color: 'text.secondary',
										lineHeight: 1.6,
									}}
								>
									{pillar.body}
								</Typography>
							</Box>
						);
					})}
				</Box>
			</ContentBand>

			{/* Sub-processors */}
			<ContentBand
				eyebrow="Transparency"
				title="Who has access to your data"
				subhead="Full transparency on every external sub-processor that touches customer data flows."
			>
				<SubProcessorsTable />
			</ContentBand>

			{/* Vulnerability Reporting — horizontal alert card (canvas-faithful) */}
			<Box component="section" sx={{ py: { xs: 6, md: 8 } }}>
				<Container maxWidth="md">
					<Box
						sx={{
							p: { xs: 4, md: 5 },
							borderRadius: '24px',
							bgcolor: 'background.neutral',
							border: '1px solid',
							borderColor: 'divider',
							display: 'flex',
							flexDirection: { xs: 'column', md: 'row' },
							alignItems: { xs: 'flex-start', md: 'center' },
							gap: { xs: 3, md: 4 },
							transition: 'background-color 240ms ease',
							'&:hover': {
								bgcolor: 'background.paper',
							},
						}}
					>
						<Box
							sx={(theme) => ({
								width: 56,
								height: 56,
								flexShrink: 0,
								borderRadius: '50%',
								bgcolor: varAlpha(theme.vars.palette.primary.mainChannel, 0.1),
								color: 'primary.main',
								display: 'inline-flex',
								alignItems: 'center',
								justifyContent: 'center',
							})}
						>
							<Iconify icon="ph:shield-warning-bold" width={28} />
						</Box>
						<Box sx={{ flex: 1, minWidth: 0 }}>
							<Typography
								sx={{
									fontSize: 20,
									fontWeight: 700,
									color: 'text.primary',
									mb: 1,
								}}
							>
								Found a vulnerability?
							</Typography>
							<Typography
								sx={{
									fontSize: 14,
									color: 'text.secondary',
									lineHeight: 1.6,
									maxWidth: 560,
								}}
							>
								We take potential threats seriously. Report it to{' '}
								<Box
									component="a"
									href={`mailto:${SECURITY_CONTACT_EMAIL}`}
									sx={{
										fontWeight: 600,
										color: 'text.primary',
										textDecoration: 'underline',
										borderRadius: '2px',
										'&:hover': { color: 'primary.main' },
										'&:focus-visible': {
											outline: '2px solid',
											outlineColor: 'primary.main',
											outlineOffset: '2px',
										},
									}}
								>
									{SECURITY_CONTACT_EMAIL}
								</Box>
								. Our triage team responds within 24 hours, and we credit
								responsible researchers in our hall of fame after mitigation.
							</Typography>
						</Box>
					</Box>
				</Container>
			</Box>

			{/* Bottom CTA */}
			<CtaBand
				eyebrowLabel="Enterprise Ready"
				title="Want to talk to security in detail?"
				subhead="Our compliance engineering team will walk you through our operational controls, facilitate a custom risk assessment, and securely complete your vendor questionnaires."
				ctaLabel="Schedule a security call"
				ctaHref={FRONT_PATH_NAMES.marketing.contact}
				microcopy="Typical response within one business day."
			/>
		</>
	);
};

export default SecurityPage;
