/**
 * @vitest-environment jsdom
 *
 * Guard for fix/990 — a drawer whose `DrawerBody` + `DrawerFooter` are wrapped
 * in a plain `Form`/`<form>` breaks `.publy-drawer`'s flex column: the form is
 * a block flex item with `min-height: auto`, so it refuses to shrink, the
 * body's `min-h-0 flex-1 overflow-y-auto` is inert, and the footer is clipped
 * below the viewport edge with no scrollbar.
 *
 * jsdom has no layout engine, so no computed-height or scrolling assertion can
 * work. Instead this guards the real artifacts of the chain:
 *
 *  1. the actual SOURCE of the four form-bearing drawer call sites — their
 *     body+footer must sit inside `DrawerForm`, the drawer-owned form wrapper
 *     that applies the flex geometry;
 *  2. the actual rendered DOM of the real drawer components — the `<form>`
 *     emitted by `DrawerForm` carries `.publy-drawer-form`, sits directly in
 *     the `.publy-drawer` flex column, and has the body and footer as direct
 *     flex children;
 *  3. the actual `.publy-drawer-form` rule in app.css carrying the geometry.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { cleanup, render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
	Drawer,
	DrawerBody,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerForm,
	DrawerHeader,
	DrawerTitle,
} from './drawer';

vi.mock('react-i18next', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

const noop = () => undefined;

const FORM_DRAWER_CALL_SITES = [
	'../../routes/authed/staff/tenants/$tenantId/profiles/_profile-form-drawer.tsx',
	'../../routes/authed/staff/tenants/$tenantId/profiles/_profile-edit-details-drawer.tsx',
	'../../routes/authed/staff/tenants/$tenantId/_invite-user-drawer.tsx',
	'../../routes/authed/staff/staff-users/_change-email-dialog.tsx',
];

afterEach(cleanup);

describe('DrawerForm flex chain', () => {
	test.each(FORM_DRAWER_CALL_SITES)(
		'%s keeps DrawerBody + DrawerFooter inside the drawer-owned DrawerForm',
		(relativePath) => {
			const source = readFileSync(
				path.resolve(import.meta.dirname, relativePath),
				'utf8',
			);

			const formOpen = source.indexOf('<DrawerForm');
			const bodyOpen = source.indexOf('<DrawerBody');
			const footerClose = source.lastIndexOf('</DrawerFooter>');
			const formClose = source.lastIndexOf('</DrawerForm>');

			expect(formOpen).toBeGreaterThanOrEqual(0);
			expect(bodyOpen).toBeGreaterThan(formOpen);
			expect(footerClose).toBeGreaterThan(bodyOpen);
			expect(formClose).toBeGreaterThan(footerClose);
		},
	);

	const DrawerFormChain = () => {
		const methods = useForm<{ name: string }>({
			defaultValues: { name: '' },
		});

		return (
			<Drawer open={true} onOpenChange={noop}>
				<DrawerContent>
					<DrawerHeader>
						<DrawerTitle>Invite members</DrawerTitle>
						<DrawerDescription>
							Send invitations to teammates.
						</DrawerDescription>
					</DrawerHeader>
					<DrawerForm methods={methods} onSubmit={noop}>
						<DrawerBody>
							<p>Drawer body content</p>
						</DrawerBody>
						<DrawerFooter>
							<button type="submit">Send invites</button>
						</DrawerFooter>
					</DrawerForm>
				</DrawerContent>
			</Drawer>
		);
	};

	test('renders body + footer as direct flex children of a drawer-geometry form inside the drawer', () => {
		render(<DrawerFormChain />);

		const drawer = screen.getByRole('dialog');
		expect(drawer.className).toContain('publy-drawer');

		const form = drawer.querySelector('form');
		expect(form).not.toBeNull();
		expect(form?.className).toContain('publy-drawer-form');
		expect(form?.parentElement).toBe(drawer);

		const body = form?.querySelector('[data-slot="drawer-body"]');
		const footer = form?.querySelector('[data-slot="drawer-footer"]');
		expect(body?.parentElement).toBe(form);
		expect(footer?.parentElement).toBe(form);
	});

	test('app.css gives .publy-drawer-form the flex geometry that makes the body shrink and scroll', () => {
		const appCssSource = readFileSync(
			path.resolve(import.meta.dirname, '../../styles/app.css'),
			'utf8',
		);

		expect(appCssSource).toMatch(
			/\.publy-drawer-form\s*\{\s*@apply flex min-h-0 flex-1 flex-col;/,
		);
	});
});
