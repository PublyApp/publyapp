Status: Archived
Original location: docs/old-front/screens/tenant-workspace.md
Archive reason: Retired apps/old-front on 2026-08-22; reference preserved before deletion (tag old-front-final).
Superseded by: none

# Tenant workspace (old-front)

> Source: `apps/old-front/src/routes/authed/tenant/**`. This is the biggest missing slice (see parity-status). Factual inventory only.

## Routes

| Path | File | Flag | Notes |
|---|---|---|---|
| /app | _portal/tenant-portal-page.tsx | — | tenant picker portal (uses useGetRedirectCode, useGetUserAuthData) |
| /app/organizations | organizations/organizations-page.tsx | — | standalone picker (suspended-tenant target) |
| /app/:tenantId | posts/posts-calendar-page.tsx | — | default calendar (layout tenant-layout) |
| /app/:tenantId/posts | posts/posts-queue-page.tsx | — | queue |
| /app/:tenantId/posts/drafts | posts/posts-drafts-page.tsx | — | drafts |
| /app/:tenantId/posts/history | posts/posts-history-page.tsx | — | history |
| /app/:tenantId/settings | settings/general/settings-general-page.tsx | — | organization details (logo, name, subdomain, description, industry, website) + danger zone |
| /app/:tenantId/settings/members | settings/members/settings-members-page.tsx | tenant.settings.members OFF | members table (invite, role, status) |
| /app/:tenantId/settings/roles | settings/roles/settings-roles-page.tsx | OFF | roles table |
| /app/:tenantId/settings/workspaces | settings/workspaces/settings-workspaces-page.tsx | OFF | workspaces list |
| /app/:tenantId/settings/integrations | settings/integrations/settings-integrations-page.tsx | OFF | integrations |
| /app/:tenantId/settings/billing | settings/billing/settings-billing-page.tsx | OFF | billing |
| /app/:tenantId/settings/security | settings/security/settings-security-page.tsx | OFF | security |
| /app/:tenantId/account | account/profile/account-profile-page.tsx | — | personal info (avatar, firstname/lastname/email/bio) + preferences (language/timezone) + danger zone |
| /app/:tenantId/account/security | account/security/account-security-page.tsx | — | change password |
| /app/:tenantId/account/notifications | account/notifications/account-notifications-page.tsx | — | email notifications |

## Components per area

- Posts: calendar/queue/drafts/history are placeholder TODO pages (Typography h1 TODO). Composition/calendar/queue/history behaviours not yet implemented. See posts-*page.tsx.
- Settings general: FormRow + SettingsPageHeader + Card sections; all fields disabled (placeholder). Danger zone delete-organization disabled.
- Settings members/roles/workspaces/integrations/billing/security: each is a static disabled-form page (no API). Members page has invite UX but disabled.
- Account profile: FormRow avatar + firstname/lastname/email/bio (disabled), preferences (language/timezone selects disabled), danger zone.
- Account security/notifications: static forms, no API.
- Portal + organizations: TenantPickerView (shared component).
- Layouts: tenant-layout (access gate, tenant param), settings-layout (sidebar nav), account-layout (sidebar nav).
- Layout guards: tenant not found -> tenant-not-found-page; settings/account unknown tab -> fallback pages.

## Validation (zod) — copied verbatim where present

Tenant workspace pages are currently static (no forms active), so no zod schemas are attached to these routes. The only tenant-workspace validations in shared-ts are:

```ts
import {
	ACCOUNT_LEVEL_ENUM,
	DEFAULT_MAX_USER_PER_TENANT,
} from '@org/shared-ts/lib/constants';
import type InterZod from '@org/shared-ts/lib/zod/InterZod';

export const getNewTenantSchemaServerSide = (
	z: InterZod,
	options: { maxUsers?: number } = { maxUsers: DEFAULT_MAX_USER_PER_TENANT },
) => {
	return z.object({
		name: z.string().min(5),
		maxUsers: z
			.number()
			.min(1)
			.max(options.maxUsers || DEFAULT_MAX_USER_PER_TENANT),
		initialUsers: z
			.array(
				z.object({
					email: z.string().email(),
					accountLevel: z.enum([
						ACCOUNT_LEVEL_ENUM.ADMIN,
						ACCOUNT_LEVEL_ENUM.USER,
					]),
				}),
			)
			.min(1)
			.max(options.maxUsers || DEFAULT_MAX_USER_PER_TENANT)
			// verify email is unique
			.refine(
				(users) => {
					const emails = users.map((user) => user.email);
					return new Set(emails).size === emails.length;
				},
				{
					message: z.t('each-user-must-have-a-unique-email'),
				},
			)
			// at least one admin
			.refine(
				(users) => {
					return users.some(
						(user) => user.accountLevel === ACCOUNT_LEVEL_ENUM.ADMIN,
					);
				},
				{
					message: z.t('tenant-should-have-at-least-one-admin'),
				},
			),
	});
};

```

```ts
import { DEFAULT_MAX_USER_PER_TENANT } from '@org/shared-ts/lib/constants';
import type InterZod from '@org/shared-ts/lib/zod/InterZod';

import { getFileSchemaClientSide } from '../file/file-client.validations';
import { getNewTenantSchemaServerSide } from './tenant.validations';

export const getNewTenantSchemaClientSide = (
	z: InterZod,
	options: { maxUsers?: number } = { maxUsers: DEFAULT_MAX_USER_PER_TENANT },
) => {
	return getNewTenantSchemaServerSide(z, options).extend({
		logo: getFileSchemaClientSide(z).or(z.string()).optional(),
	});
};

```

## API calls

- Portal: `useGetRedirectCode`, `useGetUserAuthData` (via staff/tenant hooks).
- All other tenant workspace routes: **no API calls** (static placeholders, all inputs disabled). This is factual: the composition/calendar/queue/history behaviours are not yet wired.

## Feature flags

Tenant workspace secondary tabs are flag-OFF by default (see marketing.md flag file excerpt): `tenant.settings.members/roles/workspaces/integrations/billing/security` all false. Flipping them reveals the route but the pages are still static placeholders.

## States

- Loading: tenant-portal shows QueryDisplay loading.
- Empty: posts drafts/queue/history are empty TODO states.
- Error: tenant-not-found, settings-fallback, account-fallback.
