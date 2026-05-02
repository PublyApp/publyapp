import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { varAlpha } from 'minimal-shared/utils';

import { LegalDocPage } from '#app/routes/marketing/_components/legal-doc-page.tsx';
import {
	COOKIES_INVENTORY,
	COOKIES_LAST_UPDATED,
	COOKIES_SECTION_IDS,
	COOKIES_TOC,
} from '#app/routes/marketing/_data/legal-cookies.ts';

// ----------------------------------------------------------------------

const H2_SX = {
	fontSize: { xs: 22, md: 26 },
	fontWeight: 700,
	color: 'text.primary',
	mb: 2,
} as const;

const P_SX = {
	fontSize: 15,
	color: 'text.secondary',
	lineHeight: 1.75,
} as const;

// ----------------------------------------------------------------------

const CookieInventoryTable = () => {
	return (
		<Box
			component="table"
			sx={{
				width: '100%',
				borderCollapse: 'collapse',
				fontSize: 14,
				my: 3,
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
					<Box component="th">Cookie name</Box>
					<Box component="th">Purpose</Box>
					<Box component="th">Duration</Box>
				</Box>
			</Box>
			<Box component="tbody">
				{COOKIES_INVENTORY.map((row) => {
					return (
						<Box component="tr" key={row.name}>
							<Box
								component="td"
								sx={{
									fontFamily: 'monospace',
									fontSize: 13,
									color: 'text.primary',
								}}
							>
								{row.name}
							</Box>
							<Box component="td" sx={{ color: 'text.secondary' }}>
								{row.purpose}
							</Box>
							<Box component="td" sx={{ color: 'text.secondary' }}>
								{row.duration}
							</Box>
						</Box>
					);
				})}
			</Box>
		</Box>
	);
};

// ----------------------------------------------------------------------

const CookiePreferencesCallout = () => {
	return (
		<Box
			sx={(theme) => ({
				mt: 3,
				p: 3,
				borderRadius: '12px',
				border: '1px solid',
				borderColor: varAlpha(theme.vars.palette.primary.mainChannel, 0.24),
				bgcolor: varAlpha(theme.vars.palette.primary.mainChannel, 0.06),
			})}
		>
			<Typography
				sx={{ fontSize: 14, fontWeight: 600, color: 'text.primary', mb: 1 }}
			>
				Manage your cookie preferences
			</Typography>
			<Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 2 }}>
				View and precisely modify your active consent parameters for
				non-essential external tracking scripts.
			</Typography>
			<Box
				component="button"
				type="button"
				onClick={() => {
					// Placeholder until the consent banner ships (out of scope per spec)
					// eslint-disable-next-line no-console
					console.info('[cookies] open preferences clicked');
				}}
				sx={(theme) => ({
					display: 'inline-flex',
					alignItems: 'center',
					gap: 1,
					fontSize: 13,
					fontWeight: 600,
					px: 2,
					py: 1,
					border: 'none',
					borderRadius: '8px',
					bgcolor: 'primary.main',
					color: 'common.white',
					cursor: 'pointer',
					transition: 'transform 240ms ease, box-shadow 240ms ease',
					'&:hover': {
						transform: 'translateY(-1px)',
						boxShadow: `0 8px 16px -4px ${varAlpha(theme.vars.palette.primary.mainChannel, 0.35)}`,
					},
				})}
			>
				Open cookie preferences
			</Box>
		</Box>
	);
};

// ----------------------------------------------------------------------

const CookiesPage = () => {
	return (
		<LegalDocPage
			eyebrow="Legal"
			title="Cookie Policy"
			lastUpdated={COOKIES_LAST_UPDATED}
			toc={COOKIES_TOC}
		>
			<Stack spacing={6}>
				{/* 1. What Are Cookies */}
				<Box component="section">
					<Typography
						component="h2"
						id={COOKIES_SECTION_IDS.whatAreCookies}
						sx={H2_SX}
					>
						1. What Are Cookies
					</Typography>
					<Stack spacing={2}>
						<Typography sx={P_SX}>
							Cookies are small text files that are stored locally by your web
							browser on your computer or mobile device when you visit a
							website. Modern web applications utilize these files to ensure the
							environment functions continuously and efficiently. For example,
							they allow our platform to remember your active login state and
							preserve custom preferences during your navigation between
							different pages in your workspace.
						</Typography>
						<Typography sx={P_SX}>
							Functionally, cookies generally drop into two major retention
							categories:{' '}
							<Box component="strong" sx={{ color: 'text.primary' }}>
								Session cookies
							</Box>{' '}
							are temporary and uniformly deleted from your device the instant
							you fully close your browser window. Conversely,{' '}
							<Box component="strong" sx={{ color: 'text.primary' }}>
								Persistent cookies
							</Box>{' '}
							remain secured on your hard drive until you meticulously erase
							them or until they successfully reach their predetermined
							expiration date programmed by the issuer.
						</Typography>
						<Typography sx={P_SX}>
							Additionally, cookies fall under different ownership scopes.{' '}
							<Box component="strong" sx={{ color: 'text.primary' }}>
								First-party cookies
							</Box>{' '}
							are established immediately by the PublyApp domain you are
							directly visiting and are essential for core site interactions.{' '}
							<Box component="strong" sx={{ color: 'text.primary' }}>
								Third-party cookies
							</Box>
							, established externally by our tightly integrated service
							partners, permit crucial analytics, continuous customer support
							embedded widgets, and reliable external payment gateways to
							function globally inside your dashboard.
						</Typography>
					</Stack>
				</Box>

				{/* 2. Cookies We Set — prose + inline inventory table */}
				<Box component="section">
					<Typography
						component="h2"
						id={COOKIES_SECTION_IDS.cookiesWeSet}
						sx={H2_SX}
					>
						2. Cookies We Set
					</Typography>
					<Typography sx={P_SX}>
						Below is a comprehensive and strictly monitored inventory of the
						technical cookies actively deployed when interacting closely with
						the PublyApp platform. This catalog dictates both required utility
						identifiers and supplemental telemetry hooks.
					</Typography>
					<CookieInventoryTable />
				</Box>

				{/* 3. Third-Party Cookies */}
				<Box component="section">
					<Typography
						component="h2"
						id={COOKIES_SECTION_IDS.thirdParty}
						sx={H2_SX}
					>
						3. Third-Party Cookies
					</Typography>
					<Stack spacing={2}>
						<Typography sx={P_SX}>
							To safely scale our infrastructure, PublyApp delegates specialized
							operations directly to trusted third-party providers who, in
							return, securely inject cookies through our ecosystem interface.
							For deep analytics tracking, we currently deploy Google Analytics
							to methodically track systemic user trends and usage pathways. For
							reliable internal communication workflows, our helpdesk utilizes
							Intercom tracking strings to tie anonymous chat initiations
							explicitly back to your verified session.
						</Typography>
						<Typography sx={P_SX}>
							Furthermore, compliant subscription billing operates
							comprehensively via Stripe, which relies deeply on its own
							localized security parameters. Each partner strictly processes
							resulting tracking states aligned cleanly to their autonomous
							legal frameworks. Users uniformly looking for granular definitions
							over externally mandated cookies are highly encouraged to review
							robust provider-hosted privacy policies. Please note explicitly
							that forcefully disabling all third-party cookies at the browser
							tier intrinsically prevents payment flows and real-time chat from
							operating reliably.
						</Typography>
					</Stack>
				</Box>

				{/* 4. Managing Your Cookie Preferences — prose + inline callout */}
				<Box component="section">
					<Typography
						component="h2"
						id={COOKIES_SECTION_IDS.managingPreferences}
						sx={H2_SX}
					>
						4. Managing Your Cookie Preferences
					</Typography>
					<Stack spacing={2}>
						<Typography sx={P_SX}>
							We actively respect individual tracking autonomy and consistently
							offer a streamlined pathway permitting your personal configuration
							of these technologies. Upon an initial localized visit, you will
							explicitly encounter our digital consent banner explicitly
							outlining optional analytics trackers versus mandatory session
							constraints. You hold the inherent right at any time to
							confidently revoke initial consents entirely.
						</Typography>
						<Typography sx={P_SX}>
							For individuals seeking exhaustive technical control bypassing our
							interfaces, modifying overarching preferences directly inside
							browser architectural settings supplies definitive constraints.
							All standard browser engines natively allow you to globally
							disable or rigidly filter cookies manually. Visit the official
							support domains governing Google Chrome, Apple Safari, or Mozilla
							Firefox for localized instructional documentation concerning
							global token rejection capabilities.
						</Typography>
					</Stack>
					<CookiePreferencesCallout />
				</Box>

				{/* 5. Updates to This Policy */}
				<Box component="section">
					<Typography
						component="h2"
						id={COOKIES_SECTION_IDS.updates}
						sx={H2_SX}
					>
						5. Updates to This Policy
					</Typography>
					<Stack spacing={2}>
						<Typography sx={P_SX}>
							As internet protocols fiercely evolve and integrated data
							collection architectures shift inherently over progressive cycles,
							we systematically reserve the explicit right to independently
							amend this Cookie Policy. Routine updates act solely to seamlessly
							introduce completely new embedded tools or accurately deprecate
							fully retired legacy vendors previously attached deeply to our
							active system.
						</Typography>
						<Typography sx={P_SX}>
							Any definitive configuration changes comprehensively rewrite the
							&ldquo;Last updated&rdquo; timeline stamp structurally anchored
							tightly at the header of this documented text. In cases where
							structural shifts entirely redefine overarching user workflows,
							our administrative team actively deploys digital notifications
							pushed cleanly via workspace alerts or strictly dispatched
							alongside formal corporate legal email channels.
						</Typography>
					</Stack>
				</Box>
			</Stack>
		</LegalDocPage>
	);
};

export default CookiesPage;
