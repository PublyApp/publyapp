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
