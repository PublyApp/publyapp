import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { RouterLink } from '#app/components/router-link.tsx';
import { LegalDocPage } from '#app/routes/marketing/_components/legal-doc-page.tsx';
import {
	PRIVACY_LAST_UPDATED,
	PRIVACY_SECTION_IDS,
	PRIVACY_TOC,
} from '#app/routes/marketing/_data/legal-privacy.ts';

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

const LINK_SX = {
	color: 'primary.main',
	textDecoration: 'underline',
} as const;

// ----------------------------------------------------------------------

const PrivacyPage = () => {
	return (
		<LegalDocPage
			eyebrow="Legal"
			title="Privacy Policy"
			lastUpdated={PRIVACY_LAST_UPDATED}
			toc={PRIVACY_TOC}
		>
			<Stack spacing={6}>
				{/* 1. What We Collect */}
				<Box component="section">
					<Typography
						component="h2"
						id={PRIVACY_SECTION_IDS.whatWeCollect}
						sx={H2_SX}
					>
						1. What We Collect
					</Typography>
					<Stack spacing={2}>
						<Typography sx={P_SX}>
							To provide and improve the PublyApp Service, we collect several
							different types of information from and about you. This primarily
							includes account information such as your name, corporate email
							address, and basic profile details required during the
							registration process. We also securely process and temporarily
							store the content and communications you explicitly post, route,
							or manage through our Service interfaces.
						</Typography>
						<Typography sx={P_SX}>
							In addition to direct inputs, we automatically collect usage data
							and device information when you interact with our platform. This
							system data includes your device's Internet Protocol (IP) address,
							browser type and version, identifying access logs, and detailed
							telemetry regarding your interaction pathing within the dashboard.
							Payment information needed for subscription management is
							collected directly by our integrated payment processor (Stripe);
							PublyApp does not store your full credit card numbers or raw
							billing credentials.
						</Typography>
					</Stack>
				</Box>

				{/* 2. How We Use Your Data */}
				<Box component="section">
					<Typography
						component="h2"
						id={PRIVACY_SECTION_IDS.howWeUseYourData}
						sx={H2_SX}
					>
						2. How We Use Your Data
					</Typography>
					<Stack spacing={2}>
						<Typography sx={P_SX}>
							Our primary purpose in processing your data is to reliably
							provide, maintain, and continuously improve the Service you
							subscribe to. We leverage your account and usage information to
							facilitate core application mechanics, administer subscription
							billing, manage account provisioning, and resolve technical
							support queries you escalate to us.
						</Typography>
						<Typography sx={P_SX}>
							We also utilize algorithmic analysis of aggregate usage patterns
							to enhance platform security, actively prevent fraudulent
							activity, and identify potential infrastructural bottlenecks
							before they affect performance. Furthermore, we use your contact
							information to send critical transactional communications—such as
							payment receipts and security alerts. With your explicit consent,
							we may occasionally dispatch marketing updates regarding new
							platform features, which you can opt out of at any time via your
							communication preferences.
						</Typography>
						<Typography sx={P_SX}>
							Finally, data usage is governed by our obligation back to legal
							and compliance requirements, ensuring that PublyApp meets
							regulatory standards in processing user telemetry within
							respective regional jurisdictions.
						</Typography>
					</Stack>
				</Box>

				{/* 3. Data Sharing and Third Parties */}
				<Box component="section">
					<Typography
						component="h2"
						id={PRIVACY_SECTION_IDS.dataSharingAndThirdParties}
						sx={H2_SX}
					>
						3. Data Sharing and Third Parties
					</Typography>
					<Stack spacing={2}>
						<Typography sx={P_SX}>
							PublyApp does not—and will never—sell your personal data to data
							brokers or advertising networks. We only share information with
							specific third-party sub-processors whose services are strictly
							required to operate our platform. These vendors include cloud
							hosting providers (e.g., AWS), transactional email relays, and
							secure payment gateways (e.g., Stripe). An updated list of our
							authorized sub-processors is available.
						</Typography>
						<Typography sx={P_SX}>
							Data sharing also intrinsically occurs when you authorize
							third-party integrations (such as linking your social media
							accounts to our platform). During these integration points, data
							flows between PublyApp and the authenticated social API according
							to the permissions scoped during connection setup. Additionally,
							we may disclose your information if required to do so by a valid
							and binding legal request, or in the event of a merger,
							acquisition, or asset sale, subject to standard confidentiality
							procedures.
						</Typography>
					</Stack>
				</Box>

				{/* 4. Cookies and Tracking */}
				<Box component="section">
					<Typography
						component="h2"
						id={PRIVACY_SECTION_IDS.cookiesAndTracking}
						sx={H2_SX}
					>
						4. Cookies and Tracking
					</Typography>
					<Stack spacing={2}>
						<Typography sx={P_SX}>
							PublyApp uses cookies and similar tracking technologies to track
							activity on our Service and store certain configuration
							information. Essential cookies are deployed automatically as they
							are strictly necessary for the platform to function—these maintain
							your secure login sessions, handle cross-site request forgery
							protection, and preserve core user preferences.
						</Typography>
						<Typography sx={P_SX}>
							We separately utilize analytics and performance cookies to
							understand aggregate user behavior, diagnose usability issues, and
							measure the health of our infrastructure. You have the right to
							govern the use of non-essential cookies via our preference banner
							presented upon your first visit. For detailed information on
							specific tracking technologies deployed and comprehensive
							configuration opt-outs, please refer to our{' '}
							<Box
								component={RouterLink}
								href={FRONT_PATH_NAMES.marketing.cookies}
								sx={LINK_SX}
							>
								Cookie Policy
							</Box>
							.
						</Typography>
					</Stack>
				</Box>

				{/* 5. Data Retention */}
				<Box component="section">
					<Typography
						component="h2"
						id={PRIVACY_SECTION_IDS.dataRetention}
						sx={H2_SX}
					>
						5. Data Retention
					</Typography>
					<Stack spacing={2}>
						<Typography sx={P_SX}>
							We retain your personal data only for as long as is strictly
							necessary for the purposes outlined in this Privacy Policy. Your
							core account profile, configuration states, and user-generated
							content are kept active for the entire duration of your service
							subscription. Upon initiation of formal account deletion, this
							active data is securely purged from primary production databases
							within 90 days.
						</Typography>
						<Typography sx={P_SX}>
							Due to overarching legal stipulations and tax compliance mandates,
							immutable records—such as subscription billing invoices,
							transactional histories, and formal consent logs—must be retained
							for a mandatory period of 7 years. Additionally, routine
							operational log data (which includes IP access points and internal
							routing telemetry) is routinely truncated and destroyed on a
							rolling 30-day lifecycle.
						</Typography>
					</Stack>
				</Box>

				{/* 6. Your Rights (GDPR/CCPA) */}
				<Box component="section">
					<Typography
						component="h2"
						id={PRIVACY_SECTION_IDS.yourRights}
						sx={H2_SX}
					>
						6. Your Rights (GDPR/CCPA)
					</Typography>
					<Stack spacing={2}>
						<Typography sx={P_SX}>
							Depending on your jurisdiction, comprehensive data privacy
							frameworks (such as the GDPR in Europe and the CCPA in California)
							afford you significant control over your personal data. You
							possess the definitive right to access the data we hold concerning
							you, request rectification of any inaccurate information, and
							mandate the complete erasure of your platform footprint under
							standard conditions.
						</Typography>
						<Typography sx={P_SX}>
							You also retain rights to restrict specific processing avenues,
							object to certain automated decision-making processes, demand data
							portability in standard machine-readable formats, and withdraw
							previously granted consent at arbitrary intervals. To exercise any
							of these fundamental rights, you may utilize the self-service
							privacy tools embedded directly within your dashboard settings, or
							you can formally email our Data Protection Officer at{' '}
							<Box
								component="a"
								href="mailto:privacy@publyapp.com"
								sx={LINK_SX}
							>
								privacy@publyapp.com
							</Box>
							.
						</Typography>
					</Stack>
				</Box>

				{/* 7. International Transfers */}
				<Box component="section">
					<Typography
						component="h2"
						id={PRIVACY_SECTION_IDS.internationalTransfers}
						sx={H2_SX}
					>
						7. International Transfers
					</Typography>
					<Stack spacing={2}>
						<Typography sx={P_SX}>
							Given the global nature of our infrastructure, information
							collected through the Service may be transferred to, and processed
							in, servers residing outside of your home country—specifically
							within the United States. Data protection laws in these processing
							locations may deviate from the legal standards guaranteed in your
							jurisdiction.
						</Typography>
						<Typography sx={P_SX}>
							To ensure absolute compliance when transferring data across
							borders, PublyApp enforces robust legal safeguards. For transfers
							originating from within the European Economic Area (EEA), we
							explicitly rely on approved Standard Contractual Clauses (SCCs)
							and active participation regarding the framework established by
							the EU-US Data Privacy Framework (DPF) to ensure technical parity
							in security standards globally.
						</Typography>
					</Stack>
				</Box>

				{/* 8. Children's Privacy */}
				<Box component="section">
					<Typography
						component="h2"
						id={PRIVACY_SECTION_IDS.childrensPrivacy}
						sx={H2_SX}
					>
						8. Children&apos;s Privacy
					</Typography>
					<Stack spacing={2}>
						<Typography sx={P_SX}>
							The PublyApp platform operates explicitly as a
							business-to-business (B2B) utility and professional SaaS product.
							At no point is our Service fundamentally structured, intended, or
							marketed to appeal to individuals strictly under the age of 16 (or
							equivalent minimum age in varying jurisdictions). We do not
							knowingly solicit nor independently collect personally identifying
							information from minors.
						</Typography>
						<Typography sx={P_SX}>
							If you represent a parent, legal guardian, or regulatory
							administrator and become aware that a minor has provisioned
							personal data onto our platform without requisite consent, please
							immediately notify us. Upon independent verification that data
							relating to a minor sits within our infrastructure, we will take
							unilateral, accelerated steps to entirely and irretrievably remove
							that information from our active servers.
						</Typography>
					</Stack>
				</Box>

				{/* 9. Security Measures */}
				<Box component="section">
					<Typography
						component="h2"
						id={PRIVACY_SECTION_IDS.securityMeasures}
						sx={H2_SX}
					>
						9. Security Measures
					</Typography>
					<Stack spacing={2}>
						<Typography sx={P_SX}>
							Protecting the integrity, availability, and confidentiality of
							your data is paramount. We maintain rigorous, industry-standard
							security architectures across our stack. All data transferred
							between your endpoint and our servers is strictly encrypted in
							transit explicitly using{' '}
							<Box component="strong" sx={{ color: 'text.primary' }}>
								TLS 1.3
							</Box>{' '}
							protocols. Additionally, sensitive database fields encompassing
							personal user definitions are heavily encrypted at rest utilizing{' '}
							<Box component="strong" sx={{ color: 'text.primary' }}>
								AES-256
							</Box>{' '}
							standard cryptographic ciphers.
						</Typography>
						<Typography sx={P_SX}>
							PublyApp commits to ongoing compliance against rigorous objective
							frameworks, including annual SOC 2 Type II independent audits. We
							routinely execute exhaustive third-party penetration testing
							routines and mandate absolute least-privilege zero-trust access
							controls for all internal employees. In the deeply unlikely event
							of a verified systemic data breach, active incident response
							protocols demand structural notifications be issued within 72
							hours alongside comprehensive mitigation reports.
						</Typography>
					</Stack>
				</Box>

				{/* 10. Changes to This Policy */}
				<Box component="section">
					<Typography
						component="h2"
						id={PRIVACY_SECTION_IDS.changesToThisPolicy}
						sx={H2_SX}
					>
						10. Changes to This Policy
					</Typography>
					<Stack spacing={2}>
						<Typography sx={P_SX}>
							We actively reserve the right to amend, rewrite, or definitively
							update this Privacy Policy at our sole discretion to actively
							reflect changing legal regulations, nuanced business practices, or
							structural platform shifts. While minor phrasing fixes may be
							applied without broadcast, any material changes altering your
							overarching rights heavily dictate active notifications.
						</Typography>
						<Typography sx={P_SX}>
							If a foundational revision is made, we guarantee notification will
							be delivered explicitly via the primary email address tied to your
							account hierarchy, alongside a prominent banner displayed
							inherently within the dashboard itself, fundamentally supplying at
							least 30 days of notice before the revisions take binding effect.
							Your continued uninterrupted utilization of the Service precisely
							past that date acts as comprehensive acknowledgment and agreement
							to be bound inherently by the revised text.
						</Typography>
					</Stack>
				</Box>

				{/* 11. Contact Our DPO */}
				<Box component="section">
					<Typography
						component="h2"
						id={PRIVACY_SECTION_IDS.contactOurDpo}
						sx={H2_SX}
					>
						11. Contact Our DPO
					</Typography>
					<Stack spacing={2}>
						<Typography sx={P_SX}>
							To ask questions, submit feedback, officially invoke your
							protected privacy rights, or directly escalate complex compliance
							demands regarding this structured Privacy Policy, please engage
							with our formal internal compliance team. Our appointed Data
							Protection Officer can be contacted continuously and securely at{' '}
							<Box component="a" href="mailto:dpo@publyapp.com" sx={LINK_SX}>
								dpo@publyapp.com
							</Box>
							.
						</Typography>
						<Typography sx={P_SX}>
							For paper correspondence or formal legally mandated servicing
							routes requiring physical receipt validation, queries should be
							directly addressed against our corporate headquarters via
							registered mail. We rigorously self-enforce an absolute
							service-level agreement guaranteeing actionable first-responses
							mapping complex privacy concerns strictly inside a 30-day window.
						</Typography>
					</Stack>
				</Box>
			</Stack>
		</LegalDocPage>
	);
};

export default PrivacyPage;
