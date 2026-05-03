import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

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
				title="Built for teams that take security seriously"
				subhead="Bank-grade encryption, SOC 2 Type II compliance, and infrastructure that scales seamlessly with your enterprise requirements."
			/>

			{/* Trust badges */}
			<ContentBand title="Verified compliance" bg="neutral">
				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: {
							xs: '1fr',
							sm: 'repeat(2, 1fr)',
							md: 'repeat(4, 1fr)',
						},
						gap: 3,
					}}
				>
					{TRUST_BADGES.map((badge) => {
						return (
							<Stack
								key={badge.id}
								spacing={1.5}
								alignItems="flex-start"
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
										width: 40,
										height: 40,
										borderRadius: '10px',
										display: 'inline-flex',
										alignItems: 'center',
										justifyContent: 'center',
										bgcolor: 'primary.lighter',
										color: 'primary.main',
									}}
								>
									<Iconify icon={badge.icon} width={20} />
								</Box>
								<Typography
									sx={{ fontSize: 15, fontWeight: 700, color: 'text.primary' }}
								>
									{badge.label}
								</Typography>
								<Typography
									sx={{
										fontSize: 13,
										color: 'text.secondary',
										lineHeight: 1.5,
									}}
								>
									{badge.description}
								</Typography>
							</Stack>
						);
					})}
				</Box>
			</ContentBand>

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
				bg="neutral"
			>
				<SubProcessorsTable />
			</ContentBand>

			{/* Vulnerability reporting */}
			<ContentBand
				title="Reporting a vulnerability"
				subhead="We take potential threats seriously. Report it to our security team — we respond within 24 hours and credit responsible researchers in our hall of fame after mitigation."
			>
				<Stack spacing={2} alignItems="flex-start">
					<Box
						component="a"
						href={`mailto:${SECURITY_CONTACT_EMAIL}`}
						sx={{
							fontSize: 18,
							fontWeight: 700,
							color: 'primary.main',
							textDecoration: 'underline',
							borderRadius: '2px',
							'&:focus-visible': {
								outline: '2px solid',
								outlineColor: 'primary.main',
								outlineOffset: '2px',
							},
						}}
					>
						{SECURITY_CONTACT_EMAIL}
					</Box>
				</Stack>
			</ContentBand>

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
