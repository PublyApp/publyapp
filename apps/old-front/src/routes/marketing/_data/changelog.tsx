import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

import { BLOG_P_SX } from '#app/routes/marketing/_components/blog-article-page.tsx';
import {
	BLOG_CODE_INLINE_SX,
	BLOG_LINK_SX,
	BLOG_OL_SX,
	BlogCallout,
	BlogCodeBlock,
} from '#app/routes/marketing/_components/blog-content-elements.tsx';
import type { ChangelogEntryType } from '#app/routes/marketing/_components/entry-type-pill.tsx';

// ----------------------------------------------------------------------

// Re-export so consumers can import both the type and the entries from
// one module without bouncing through entry-type-pill.tsx.
export type { ChangelogEntryType };

export type ChangelogEntry = {
	version: string; // 'v1.4.2' — also serves as the anchor source
	date: string; // ISO 'YYYY-MM-DD'
	title: string;
	types: ChangelogEntryType[]; // multi-tag supported
	body: ReactNode; // inline JSX, composes from blog-content-elements
	heroImageSlug?: string; // optional Unsplash slug for an inline image
	relatedBlogSlug?: string; // optional companion blog post → "Read full release notes →"
	published?: boolean; // hide without deleting; treat undefined as published
};

// ----------------------------------------------------------------------

// Placeholder entries. Sorted desc by date (most recent first). Replace
// pre-launch with real release notes. The helpers below derive years +
// per-year filtering from this single array.
export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
	{
		version: 'v1.4.2',
		date: '2026-04-28',
		title: 'Cross-tab theme sync',
		types: ['feature'],
		relatedBlogSlug: 'multi-tenant-architecture-lessons',
		heroImageSlug: '1551288049-bebda4e38f71',
		body: (
			<>
				<Typography sx={BLOG_P_SX}>
					Theme switches now propagate across every open dashboard tab in under
					200ms — no refresh, no flicker. Power users running multiple queue
					windows on a second monitor reported the visual disparity was worth
					fixing first.
				</Typography>
				<Typography sx={BLOG_P_SX}>
					The fix uses{' '}
					<Box component="code" sx={BLOG_CODE_INLINE_SX}>
						BroadcastChannel
					</Box>{' '}
					with a{' '}
					<Box component="code" sx={BLOG_CODE_INLINE_SX}>
						localStorage
					</Box>{' '}
					fallback for browsers that throttle inactive-tab events. The
					optimistic-update path means the local DOM updates instantly even
					before the preference round-trips to the server.
				</Typography>
			</>
		),
	},
	{
		version: 'v1.4.1',
		date: '2026-04-21',
		title: 'Fixed dashboard topbar bottom border regression',
		types: ['fix'],
		body: (
			<Typography sx={BLOG_P_SX}>
				A recent infrastructure deploy introduced a CSS regression that dropped
				the 1px inset border on the main application header at non-retina pixel
				ratios. Resolved globally by enforcing sub-pixel rendering on every
				sticky navigation shell.
			</Typography>
		),
	},
	{
		version: 'v1.4.0',
		date: '2026-04-14',
		title: 'New marketing site & homepage redesign',
		types: ['feature', 'breaking'],
		body: (
			<>
				<Typography sx={BLOG_P_SX}>
					The PublyApp public surface has been completely overhauled —
					transparent pricing, a dedicated engineering blog, this changelog
					you're reading, and a top-to-bottom design refresh.
				</Typography>
				<BlogCallout variant="warning" title="Heads up">
					Legacy API v1 endpoints (published before 2024) are now officially
					deprecated from public documentation. They keep working through Q3
					2026; sunset date is on the API status page.
				</BlogCallout>
			</>
		),
	},
	{
		version: 'v1.3.5',
		date: '2026-04-07',
		title: 'Approval workflows for team plans',
		types: ['feature'],
		body: (
			<>
				<Typography sx={BLOG_P_SX}>
					Team admins can now define sequential approval chains across
					departments. Assigned gatekeepers approve, reject with feedback, or
					directly edit queued content. Audit logs ship in the queue composer
					sidebar.
				</Typography>
				<Box component="ol" sx={BLOG_OL_SX}>
					<li>Set up roles in Team settings → Approval workflows</li>
					<li>Pin gatekeepers to specific content types or networks</li>
					<li>Drafts auto-route based on author + content type rules</li>
				</Box>
			</>
		),
	},
	{
		version: 'v1.3.4',
		date: '2026-03-31',
		title: 'Bulk schedule import from CSV + recurring queues',
		types: ['feature', 'improvement'],
		body: (
			<>
				<Typography sx={BLOG_P_SX}>
					Heavy-duty CSV parser support for mapping custom column schemas
					directly into your advocate queue. New conflict-resolution modal flags
					timestamp clashes with existing recurring slots before they ship.
				</Typography>
				<BlogCodeBlock language="CSV" withChrome={false}>
					{`scheduled_at,network,channel,body
2026-04-01T09:00:00Z,linkedin,@brand,"Q2 launch — see thread"
2026-04-01T09:30:00Z,twitter,@brand,"1/ Today we're rolling out…"`}
				</BlogCodeBlock>
			</>
		),
	},
	{
		version: 'v1.3.3',
		date: '2026-03-24',
		title: 'Faster initial load on the queue dashboard',
		types: ['performance'],
		body: (
			<Typography sx={BLOG_P_SX}>
				The queue dashboard's initial paint dropped from 1.8s to 720ms (p75)
				after we deferred the analytics widgets to a second render pass and
				split the queue grid out of the main bundle.
			</Typography>
		),
	},
	{
		version: 'v1.3.2',
		date: '2026-03-17',
		title: 'Rate-limit hardening on the public API',
		types: ['security'],
		body: (
			<Typography sx={BLOG_P_SX}>
				Per-tenant request quotas are now enforced at the edge instead of the
				application tier. Expected impact: zero (most tenants are well under
				quota); upper bound is 1000 req/min per token, see the API docs for new{' '}
				<Box component="code" sx={BLOG_CODE_INLINE_SX}>
					X-RateLimit-*
				</Box>{' '}
				headers.
			</Typography>
		),
	},
	{
		version: 'v1.3.1',
		date: '2026-03-10',
		title: 'Updated API docs for the new analytics endpoints',
		types: ['documentation'],
		body: (
			<Typography sx={BLOG_P_SX}>
				The{' '}
				<Box component="a" href="#" sx={BLOG_LINK_SX}>
					API reference
				</Box>{' '}
				now covers the new /v2/analytics endpoints with full request / response
				examples and copy-paste curl snippets. Includes the v2 cursor-pagination
				model.
			</Typography>
		),
	},
	{
		version: 'v1.3.0',
		date: '2026-02-28',
		title: 'Brand voice profiles + tone consistency checker',
		types: ['feature'],
		body: (
			<Typography sx={BLOG_P_SX}>
				Define a brand voice profile per workspace; the composer flags tone
				drift before publish. Currently English-only — Spanish and French are
				next.
			</Typography>
		),
	},
	{
		version: 'v1.2.9',
		date: '2026-02-14',
		title: 'Legacy webhook payload schema deprecation',
		types: ['deprecation'],
		body: (
			<Typography sx={BLOG_P_SX}>
				The pre-2024 webhook payload shape (snake_case, no envelope) is
				deprecated. v2 payloads (camelCase, wrapped in{' '}
				<Box component="code" sx={BLOG_CODE_INLINE_SX}>
					{'{ event, data }'}
				</Box>
				) have been the default for new endpoints since Jan. Migration guide on
				the docs site; sunset date Q4 2026.
			</Typography>
		),
	},
	{
		version: 'v1.2.8',
		date: '2025-12-12',
		title: 'Holiday-mode auto-pause for the entire workspace',
		types: ['feature'],
		body: (
			<Typography sx={BLOG_P_SX}>
				One toggle pauses all queues + suppresses non-urgent notifications until
				a date you set. Resumes automatically; no need to remember on January
				2nd.
			</Typography>
		),
	},
	{
		version: 'v1.2.7',
		date: '2025-11-04',
		title: 'Dark mode in the dashboard (finally)',
		types: ['feature'],
		body: (
			<Typography sx={BLOG_P_SX}>
				The dashboard now respects your system preference and exposes a manual
				toggle in the top-right. Marketing surface stayed light-only; dark for
				the dashboard is opt-in per workspace.
			</Typography>
		),
	},
	{
		version: 'v1.2.6',
		date: '2025-09-22',
		title: 'Composer typing latency cut by half',
		types: ['performance'],
		body: (
			<Typography sx={BLOG_P_SX}>
				Keystroke-to-paint in the composer dropped from 88ms (p75) to 41ms after
				the mention-suggestion query was moved off the main thread and the
				content tree switched to a structural-sharing immutable model. Most
				noticeable on threads beyond 30 entries.
			</Typography>
		),
	},
	{
		version: 'v1.2.5',
		date: '2025-08-15',
		title: 'SSO via Google Workspace and Microsoft 365',
		types: ['feature', 'security'],
		body: (
			<>
				<Typography sx={BLOG_P_SX}>
					Workspace admins can now configure SAML 2.0 SSO against Google
					Workspace or Microsoft Entra ID. SCIM 2.0 user provisioning is
					supported on the same connectors — deactivated upstream users lose
					dashboard access on the next sync window.
				</Typography>
				<BlogCallout variant="info" title="Available on Team plans and above">
					Existing email/password members keep working alongside SSO; admins can
					enforce SSO-only on a per-domain basis from Security settings.
				</BlogCallout>
			</>
		),
	},
	{
		version: 'v1.2.4',
		date: '2025-06-30',
		title: 'Daylight-saving shift broke recurring queues',
		types: ['fix'],
		body: (
			<Typography sx={BLOG_P_SX}>
				Recurring queues defined in non-UTC timezones could drift by an hour
				across DST boundaries. Now stored as a wall-clock time + IANA timezone
				pair instead of a UTC offset, which keeps "every Monday at 9am Paris"
				anchored to local 9am year-round.
			</Typography>
		),
	},
	{
		version: 'v1.2.3',
		date: '2025-05-12',
		title: 'Inline image editing in the composer',
		types: ['feature', 'improvement'],
		body: (
			<Typography sx={BLOG_P_SX}>
				Crop, rotate, and adjust brightness without leaving the composer.
				Adjustments stay non-destructive — the original asset is preserved and
				every edit can be reverted up until publish.
			</Typography>
		),
	},
	{
		version: 'v1.2.2',
		date: '2025-03-18',
		title: 'Mandatory 2FA for workspace owners',
		types: ['security'],
		body: (
			<Typography sx={BLOG_P_SX}>
				Workspace owner accounts now require TOTP or WebAuthn second-factor on
				sign-in. Members and admins can opt in voluntarily; the requirement will
				roll out to admins later this year.
			</Typography>
		),
	},
	{
		version: 'v1.2.1',
		date: '2025-02-04',
		title: 'New self-serve API onboarding tutorial',
		types: ['documentation'],
		body: (
			<Typography sx={BLOG_P_SX}>
				A guided 15-minute walkthrough that takes you from creating an API token
				to publishing your first scheduled post. Includes copy-paste snippets in
				Node, Python, and Go.
			</Typography>
		),
	},
	{
		version: 'v1.2.0',
		date: '2024-12-09',
		title: 'Custom emoji reactions in the inbox',
		types: ['feature'],
		body: (
			<Typography sx={BLOG_P_SX}>
				Upload custom workspace emoji and react to inbox conversations the same
				way you would in Slack. Reactions are visible to teammates and surface
				as filters in saved views.
			</Typography>
		),
	},
	{
		version: 'v1.1.4',
		date: '2024-10-22',
		title: 'Worker pool rebalance — queue backlog down 70%',
		types: ['performance'],
		body: (
			<Typography sx={BLOG_P_SX}>
				Background workers are now allocated by queue priority class instead of
				a flat round-robin. Under sustained load the high-priority backlog
				cleared 3x faster while low-priority throughput stayed flat.
			</Typography>
		),
	},
	{
		version: 'v1.1.3',
		date: '2024-09-03',
		title: 'Drag handle disappearing on Safari 17',
		types: ['fix'],
		body: (
			<Typography sx={BLOG_P_SX}>
				A Safari 17 quirk hid the row drag handle on hover when a parent element
				had{' '}
				<Box component="code" sx={BLOG_CODE_INLINE_SX}>
					backdrop-filter
				</Box>{' '}
				applied. Worked around by promoting the handle to its own stacking
				context.
			</Typography>
		),
	},
	{
		version: 'v1.1.2',
		date: '2024-07-16',
		title: 'Slack notifications for queue events',
		types: ['feature'],
		body: (
			<Typography sx={BLOG_P_SX}>
				Send a Slack DM or channel message when a queue item is approved,
				rejected, fails to publish, or breaches its SLA. Configure per-queue
				from Notifications → Integrations.
			</Typography>
		),
	},
	{
		version: 'v1.1.1',
		date: '2024-05-28',
		title: 'Renamed "channels" to "destinations" in the API',
		types: ['breaking'],
		body: (
			<>
				<Typography sx={BLOG_P_SX}>
					The legacy "channel" resource has been renamed to "destination" across
					the API to disambiguate from the Slack/Discord notion of "channel".
					Aliases remain in place until v1.3.0 (Q1 2026); update your client
					code before then.
				</Typography>
				<BlogCodeBlock language="diff" withChrome={false}>
					{`- POST /v1/channels
+ POST /v1/destinations`}
				</BlogCodeBlock>
			</>
		),
	},
	{
		version: 'v1.1.0',
		date: '2024-03-04',
		title: 'Multi-workspace support',
		types: ['feature'],
		body: (
			<Typography sx={BLOG_P_SX}>
				A single account can now belong to multiple workspaces. Switch via the
				top-left workspace picker; permissions, billing, and queues stay fully
				isolated per workspace.
			</Typography>
		),
	},
	{
		version: 'v1.0.2',
		date: '2023-11-21',
		title: 'Notification badge stuck after "mark all read"',
		types: ['fix'],
		body: (
			<Typography sx={BLOG_P_SX}>
				The header notification count could remain visible after marking all
				items read until the next page navigation. Fixed by invalidating the
				unread-count query alongside the mark-all mutation.
			</Typography>
		),
	},
	{
		version: 'v1.0.1',
		date: '2023-09-08',
		title: 'CSRF token rotation on every session',
		types: ['security'],
		body: (
			<Typography sx={BLOG_P_SX}>
				Session-bound CSRF tokens now rotate on each authenticated request
				rather than once per session, narrowing the window for replay attacks
				against long-lived dashboard tabs.
			</Typography>
		),
	},
	{
		version: 'v1.0.0',
		date: '2023-06-15',
		title: 'PublyApp 1.0 — General Availability',
		types: ['feature', 'breaking'],
		heroImageSlug: '1499750310107-5fef28a66643',
		body: (
			<>
				<Typography sx={BLOG_P_SX}>
					After ten months of beta, PublyApp is generally available. The 1.0
					release includes hardened SLAs, audit-grade logging, and the first
					formally-supported public API surface.
				</Typography>
				<Typography sx={BLOG_P_SX}>
					Beta workspaces have been migrated automatically. The few breaking
					changes were called out in advance — see the migration notes in the
					docs.
				</Typography>
			</>
		),
	},
	{
		version: 'v0.9.5',
		date: '2023-03-19',
		title: 'Inbox keyboard shortcuts overhaul',
		types: ['improvement'],
		body: (
			<Typography sx={BLOG_P_SX}>
				Full keyboard navigation through the inbox:{' '}
				<Box component="code" sx={BLOG_CODE_INLINE_SX}>
					j
				</Box>
				/
				<Box component="code" sx={BLOG_CODE_INLINE_SX}>
					k
				</Box>{' '}
				to move,{' '}
				<Box component="code" sx={BLOG_CODE_INLINE_SX}>
					e
				</Box>{' '}
				to archive,{' '}
				<Box component="code" sx={BLOG_CODE_INLINE_SX}>
					r
				</Box>{' '}
				to reply,{' '}
				<Box component="code" sx={BLOG_CODE_INLINE_SX}>
					?
				</Box>{' '}
				to see the cheatsheet. Shortcuts are remappable from preferences.
			</Typography>
		),
	},
	{
		version: 'v0.9.0',
		date: '2022-11-30',
		title: 'Public beta opens to anyone with an invite code',
		types: ['feature'],
		body: (
			<Typography sx={BLOG_P_SX}>
				Closed alpha graduates to public beta. Invite codes now distribute on a
				first-come basis from the public landing page; no more manual approval
				queue.
			</Typography>
		),
	},
	{
		version: 'v0.8.0',
		date: '2022-08-22',
		title: 'First-class scheduling primitives',
		types: ['feature'],
		body: (
			<Typography sx={BLOG_P_SX}>
				Replaces the cron-string-in-a-text-input scheduler with a structured
				composer: visual cadence picker, timezone-aware previews, and conflict
				detection across recurring slots.
			</Typography>
		),
	},
	{
		version: 'v0.7.0',
		date: '2022-04-11',
		title: 'Initial composer release',
		types: ['feature'],
		body: (
			<Typography sx={BLOG_P_SX}>
				The first version of what most users now think of as PublyApp: a unified
				composer that targets multiple destinations from a single editor with
				preview-per-destination.
			</Typography>
		),
	},
	{
		version: 'v0.5.0',
		date: '2021-10-14',
		title: 'Database migration to Postgres 14',
		types: ['performance'],
		body: (
			<Typography sx={BLOG_P_SX}>
				Cut over from Postgres 12 to 14 over a 90-second maintenance window.
				Improved JSON path query performance and parallel index builds shaved
				noticeable latency off the dashboard's largest list views.
			</Typography>
		),
	},
	{
		version: 'v0.4.0',
		date: '2021-05-22',
		title: 'User accounts and workspaces',
		types: ['feature'],
		body: (
			<Typography sx={BLOG_P_SX}>
				The first persistent identity model. Replaces the demo-mode anonymous
				sessions with real accounts, workspace boundaries, and per-workspace
				permissions.
			</Typography>
		),
	},
	{
		version: 'v0.2.0',
		date: '2020-09-08',
		title: 'First closed alpha',
		types: ['feature'],
		body: (
			<Typography sx={BLOG_P_SX}>
				Hand-picked alpha cohort gets access to the prototype dashboard. No
				auth, no billing, no SLAs — just enough to validate that the workflow
				idea makes sense to people other than the team building it.
			</Typography>
		),
	},
	{
		version: 'v0.1.0',
		date: '2020-04-01',
		title: 'Project starts',
		types: ['feature'],
		body: (
			<Typography sx={BLOG_P_SX}>
				First commit on what became the production codebase. Internal-only
				sandbox; mostly schemas, naming arguments, and a single endpoint that
				returns "hello world" with carefully chosen JSON envelope conventions.
			</Typography>
		),
	},
	{
		version: 'v0.0.7',
		date: '2019-11-08',
		title: 'Internal prototype runs on Vite',
		types: ['performance'],
		body: (
			<Typography sx={BLOG_P_SX}>
				Migrated the internal prototype off Webpack onto Vite for the dev loop.
				Cold start dropped from 18s to 800ms; HMR became actually instant. This
				one quietly changed how often the team experimented.
			</Typography>
		),
	},
	{
		version: 'v0.0.6',
		date: '2019-05-21',
		title: 'TypeScript migration of the prototype',
		types: ['improvement'],
		body: (
			<Typography sx={BLOG_P_SX}>
				Converted the JavaScript prototype to TypeScript over a quiet sprint.
				Started catching real bugs the same week — most of them in the date /
				timezone code that would later become the scheduling primitives.
			</Typography>
		),
	},
	{
		version: 'v0.0.5',
		date: '2018-09-10',
		title: 'Open-sourced the prototype on GitHub',
		types: ['feature'],
		body: (
			<Typography sx={BLOG_P_SX}>
				The early prototype went public on GitHub under an MIT license. No real
				contributions came in for months, but the act of making it public forced
				better commit hygiene and a readable README.
			</Typography>
		),
	},
	{
		version: 'v0.0.4',
		date: '2018-03-02',
		title: 'Switched the core UI from Vue to React',
		types: ['improvement', 'breaking'],
		body: (
			<Typography sx={BLOG_P_SX}>
				The Vue 2 prototype was rewritten from scratch in React. Reasoning was
				mostly about hiring leverage and ecosystem maturity at the time, not
				framework loyalty. The data layer survived the rewrite untouched.
			</Typography>
		),
	},
	{
		version: 'v0.0.3',
		date: '2017-08-19',
		title: 'Project name finalized after six months of arguing',
		types: ['documentation'],
		body: (
			<Typography sx={BLOG_P_SX}>
				"PublyApp" wins. Other contenders: Postship, Outroad, Brandloop, and a
				truly cursed list of two-syllable Latin combinations. README updated,
				all references renamed.
			</Typography>
		),
	},
	{
		version: 'v0.0.2',
		date: '2016-04-25',
		title: 'First architecture sketches',
		types: ['documentation'],
		body: (
			<Typography sx={BLOG_P_SX}>
				First serious whiteboarding session. Most of the diagrams are gone; one
				survived, scanned and pinned in the team wiki, of a four-tier system
				almost nothing of which made it to production.
			</Typography>
		),
	},
	{
		version: 'v0.0.1',
		date: '2015-09-13',
		title: 'Original idea logged in a notebook',
		types: ['feature'],
		body: (
			<Typography sx={BLOG_P_SX}>
				The idea that became PublyApp first appeared as half a page of notes in
				a personal notebook: "tool that lets a marketing team queue social posts
				the same way engineers queue deploys". Filed, mostly forgotten,
				revisited years later.
			</Typography>
		),
	},
];

// ----------------------------------------------------------------------
// Helpers — derive years + per-year filtering from CHANGELOG_ENTRIES.
// All consumers should go through these; never iterate CHANGELOG_ENTRIES
// directly outside this module.

export const getPublishedEntries = (): ChangelogEntry[] => {
	return CHANGELOG_ENTRIES.filter((e) => {
		return e.published !== false;
	});
};

const yearOf = (entry: ChangelogEntry): number => {
	return new Date(entry.date).getUTCFullYear();
};

// Available years, deduped, sorted descending. Empty array if no entries.
export const getAvailableYears = (): number[] => {
	const years = new Set<number>();
	for (const entry of getPublishedEntries()) {
		years.add(yearOf(entry));
	}
	return Array.from(years).sort((a, b) => {
		return b - a;
	});
};

export const getLatestYear = (): number | null => {
	const years = getAvailableYears();
	return years.length > 0 ? years[0]! : null;
};

// Entries for a given year, sorted desc by date. Returns [] if year empty.
export const getEntriesForYear = (year: number): ChangelogEntry[] => {
	return getPublishedEntries()
		.filter((e) => {
			return yearOf(e) === year;
		})
		.sort((a, b) => {
			return new Date(b.date).getTime() - new Date(a.date).getTime();
		});
};
