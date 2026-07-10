/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
	Link: ({
		children,
		to,
		params,
		...props
	}: {
		children: ReactNode;
		to: string;
		params?: Record<string, string>;
	}) => {
		// A typed `to` containing a `$` route param segment that ships without
		// matching `params` is a route the real TanStack router can't resolve
		// either — this mock must not silently render it as if it were a
		// working link (that's exactly the untyped-`to` bug this component
		// was fixed to prevent: see the `to`/`params` split in
		// _tenant-details-shell.tsx).
		for (const segment of to.split('/')) {
			if (!segment.startsWith('$')) {
				continue;
			}
			const paramName = segment.slice(1);
			if (!params || !(paramName in params)) {
				throw new Error(
					`Link "to" ("${to}") has a "$${paramName}" segment with no matching "params" entry.`,
				);
			}
		}

		let href = to;
		for (const [key, value] of Object.entries(params ?? {})) {
			href = href.replace(`$${key}`, value);
		}

		return (
			<a href={href} {...props}>
				{children}
			</a>
		);
	},
}));

import type { StaffTenantDetails } from '~/lib/query/staff-tenants';

import { TenantDetailsPageShell } from './_tenant-details-shell';

const tenant: StaffTenantDetails = {
	id: '11111111-1111-1111-1111-111111111111',
	name: 'Acme Corporation',
	code: 'ACME',
	status: 'Active',
	usersCount: 12,
	maxUsers: 50,
	logoUrl: null,
	createdAt: new Date('2026-07-01T09:00:00Z'),
	updatedAt: new Date('2026-07-02T10:00:00Z'),
};

describe('TenantDetailsPageShell tabs', () => {
	afterEach(() => {
		cleanup();
	});

	test('renders the active tab as a static aria-current element and every other tab as a router Link', () => {
		render(
			<TenantDetailsPageShell
				tenant={tenant}
				activeSection="basics"
				summary="Summary"
				testId="staff-tenant-details-page"
			>
				<div>content</div>
			</TenantDetailsPageShell>,
		);

		const active = screen.getByText('Basics');
		expect(active.getAttribute('aria-current')).toBe('page');
		expect(active.tagName).toBe('SPAN');

		const expectedHrefs: [string, string][] = [
			['Profiles', `/staff/tenants/${tenant.id}/profiles`],
			['Invitations', `/staff/tenants/${tenant.id}/invitations`],
			['Users', `/staff/tenants/${tenant.id}/users`],
		];

		for (const [label, href] of expectedHrefs) {
			const link = screen.getByRole('link', { name: label });
			expect(link.getAttribute('href')).toBe(href);
		}
	});

	test('source contains no raw anchor tag — tab navigation must go through the router Link, not a hard reload', () => {
		// jsdom shadows the global URL constructor with a browser-relative one, so
		// resolving a sibling file requires node:path against fileURLToPath, not
		// `new URL(relative, import.meta.url)`.
		const testFilePath = fileURLToPath(import.meta.url);
		const sourcePath = join(dirname(testFilePath), '_tenant-details-shell.tsx');
		const source = readFileSync(sourcePath, 'utf8');

		expect(source).not.toMatch(/<a\s+href=/);
	});
});
