import { describe, expect, test } from 'vitest';

import type { CrumbSpec } from './breadcrumbs';
import { deriveBreadcrumbTrail } from './breadcrumbs';

/**
 * #851 unit coverage for the shell's trail derivation — the pure half of the
 * `useMatches()` pipeline. The rendered half (real router, real AppShell) is
 * `breadcrumb-loader.test.tsx` and the #973 contract guards.
 *
 * Matches are shaped exactly like the `select` projection the shell feeds in
 * from `useMatches()` (`app-shell.tsx`): pathname + params + staticData per
 * match, shallowest first.
 */

const label = (labelKey: string, to?: string): CrumbSpec => ({
	kind: 'label',
	labelKey,
	to,
});

const shellStatic = { crumbs: 'shell' as const };

describe('deriveBreadcrumbTrail (#851 useMatches pipeline, unit)', () => {
	test('the deepest non-shell match supplies the whole tail after the scope root', () => {
		const tail: readonly CrumbSpec[] = [
			label('nav-tenants', '/staff/tenants'),
			label('common:profiles'),
		];
		const trail = deriveBreadcrumbTrail([
			{ pathname: '/staff', params: {}, staticData: shellStatic },
			{
				pathname: '/staff/tenants/t-1/profiles/p-1/members',
				params: { tenantId: 't-1', profileId: 'p-1' },
				staticData: {
					crumbs: () => [...tail, label('common:members')],
				},
			},
		]);

		expect(trail.root).toEqual({
			labelKey: 'nav-tenants',
			path: '/staff/tenants',
		});
		// The route's leading `nav-tenants` label IS the root now, so the
		// duplicated segment is dropped rather than rendered twice.
		expect(trail.tail).toHaveLength(2);
		const lastSpec = trail.tail.at(-1);
		expect(lastSpec?.kind === 'label' ? lastSpec.labelKey : undefined).toBe(
			'common:members',
		);
		expect(trail.params).toEqual({ tenantId: 't-1', profileId: 'p-1' });
	});

	test("'shell' matches are skipped, so a nested opt-in still wins", () => {
		const trail = deriveBreadcrumbTrail([
			{ pathname: '/staff', params: {}, staticData: shellStatic },
			{
				pathname: '/staff/tenants/t-1',
				params: { tenantId: 't-1' },
				staticData: shellStatic,
			},
			{
				pathname: '/staff/tenants/t-1/users/u-1',
				params: { tenantId: 't-1', userId: 'u-1' },
				staticData: { crumbs: () => [label('entity-user')] },
			},
		]);

		expect(
			trail.tail.map((spec) =>
				spec.kind === 'label' ? spec.labelKey : spec.kind,
			),
		).toEqual(['entity-user']);
	});

	test('a tenant-scope pathname roots the trail at the workspace, not staff', () => {
		const trail = deriveBreadcrumbTrail([
			{ pathname: '/tenant', params: {}, staticData: shellStatic },
			{
				pathname: '/tenant/posts/post-1',
				params: { postId: 'post-1' },
				staticData: { crumbs: () => [label('entity-post')] },
			},
		]);

		expect(trail.root.path).toBe('/tenant');
		expect(trail.root.labelKey).toBe('nav-root-workspace');
	});

	test('the root is the page section, not the scope', () => {
		const trailFor = (pathname: string, crumbs: readonly CrumbSpec[]) =>
			deriveBreadcrumbTrail([
				{ pathname, params: {}, staticData: { crumbs: () => crumbs } },
			]);

		expect(
			trailFor('/staff/tenants', [label('nav-tenants', '/staff/tenants')]),
		).toMatchObject({
			root: { labelKey: 'nav-tenants', path: '/staff/tenants' },
			tail: [],
		});

		expect(
			trailFor('/staff/dashboard/activity', [
				label('nav-dashboard', '/staff/dashboard'),
				label('nav-dashboard-activity'),
			]),
		).toMatchObject({
			root: { labelKey: 'nav-dashboard', path: '/staff/dashboard' },
			tail: [{ kind: 'label', labelKey: 'nav-dashboard-activity' }],
		});

		// The staff-members section keeps "Équipe" as its root; "Utilisateurs"
		// is the page label underneath it.
		expect(
			trailFor('/staff/staff-users', [
				label('nav-staff-breadcrumb', '/staff/staff-users'),
			]),
		).toMatchObject({
			root: { labelKey: 'nav-staff', path: '/staff/staff-users' },
			tail: [{ kind: 'label', labelKey: 'nav-staff-breadcrumb' }],
		});

		expect(
			trailFor('/staff/jobs/dead-letter', [
				label('nav-staff-jobs', '/staff/jobs'),
			]),
		).toMatchObject({
			root: { labelKey: 'nav-staff-jobs', path: '/staff/jobs' },
			tail: [],
		});
	});

	test('with no opting-in match the trail is just the scope root', () => {
		const trail = deriveBreadcrumbTrail([
			{ pathname: '/staff', params: {}, staticData: shellStatic },
		]);

		expect(trail.tail).toEqual([]);
		expect(trail.params).toEqual({});
		expect(trail.root.labelKey).toBe('nav-root-staff');
	});
});
