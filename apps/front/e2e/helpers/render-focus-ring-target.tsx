import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Badge } from '~/components/ui/badge';
import { BulkActionsTrigger } from '~/components/ui/bulk-actions-trigger';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { DropdownMenu } from '~/components/ui/dropdown-menu';
import { Input } from '~/components/ui/input';
import { Select, SelectTrigger, SelectValue } from '~/components/ui/select';
import { Switch } from '~/components/ui/switch';
import { Textarea } from '~/components/ui/textarea';

/**
 * Loaded ONLY via `vite.ssrLoadModule()` from `render-focus-ring.ts` — never
 * imported directly by a `.spec.ts` file. Same constraint as
 * `entity-crumb-render-target.tsx`: Playwright's own test-file loader
 * transforms every `.tsx` file it touches with ITS `playwright/jsx-runtime`,
 * which would turn every JSX element here (and inside the real primitives,
 * once dragged into that same transform) into `{ __pw_type: 'jsx', ... }`
 * descriptor objects rather than real React elements. Loading this file
 * through Vite's own SSR module graph instead (same `vite.config.ts`, same
 * `@vitejs/plugin-react`, same `~/*` alias the real app uses) keeps every
 * JSX element compiled with React's actual automatic runtime.
 *
 * What this renders, for #823: the REAL shipping ui primitives — the exact
 * components users tab through — reduced to static markup so the e2e spec
 * can paint them against the real compiled production stylesheet and measure
 * the focus-visible ring the browser ACTUALLY resolves (`@layer` precedence
 * included). The class strings therefore come from the primitive modules
 * themselves; nothing here hand-copies a `focus-visible:` utility.
 *
 * Every probe carries `data-e2e-focus-probe="<id>"` ON ITS HOST ELEMENT (the
 * element whose class list holds the ring utilities). The e2e spec asserts
 * both halves of that contract: the attribute must be present in the markup,
 * and the FIRST tag of each snippet must be the one carrying it — if a
 * primitive starts rendering a wrapper, or an attr lands somewhere else, the
 * probe would silently measure the wrong node and the spec must go red, not
 * green-on-the-wrong-element.
 */

type FocusProbeCase = {
	id: string;
	markup: string;
};

const PROBE_ATTR = 'data-e2e-focus-probe';

/** The probe set. Deliberately the full focusable-primitive surface named in
 * DESIGN.md's Focus rings section (3px ring family + checkbox's 2px), not a
 * cherry-picked subset: the #823 defect class (an unlayered rule beating the
 * layered `focus-visible:*` utilities) hits ANY consumer of the ring
 * utilities, so the proof must cover every shipping primitive shape. */
const probeNodes: { id: string; node: ReactElement }[] = [
	{
		id: 'button-default',
		node: <Button {...{ [PROBE_ATTR]: 'button-default' }}>Probe</Button>,
	},
	{
		id: 'button-outline',
		node: (
			<Button variant="outline" {...{ [PROBE_ATTR]: 'button-outline' }}>
				Probe
			</Button>
		),
	},
	// A bare Badge renders an UNFOCUSABLE <span>; its ring utilities exist for
	// the badge-as-link pattern (`render={<a href/>}`), which is what keyboard
	// users actually reach. The probes therefore render that exact documented
	// pattern (see badge.test.tsx) — a span probe would silently measure a
	// control no keyboard can ever focus.
	{
		id: 'badge-link',
		node: (
			<Badge render={<a href="#" {...{ [PROBE_ATTR]: 'badge-link' }} />}>
				Probe
			</Badge>
		),
	},
	{
		id: 'badge-outline-link',
		node: (
			<Badge
				variant="outline"
				render={<a href="#" {...{ [PROBE_ATTR]: 'badge-outline-link' }} />}
			>
				Probe
			</Badge>
		),
	},
	{
		id: 'select-trigger',
		node: (
			<Select>
				<SelectTrigger {...{ [PROBE_ATTR]: 'select-trigger' }}>
					<SelectValue placeholder="Probe" />
				</SelectTrigger>
			</Select>
		),
	},
	{
		id: 'input',
		node: <Input placeholder="Probe" {...{ [PROBE_ATTR]: 'input' }} />,
	},
	// #1400: the selection-bar bulk-actions trigger is a real shipping
	// focusable primitive (ghost sm button inside the floating bar). It only
	// mounts inside a menu root, so the probe mirrors that documented pattern
	// exactly like the select-trigger probe above.
	{
		id: 'bulk-actions-trigger',
		node: (
			<DropdownMenu>
				<BulkActionsTrigger
					{...{ [PROBE_ATTR]: 'bulk-actions-trigger' }}
					triggerLabel="Probe"
				/>
			</DropdownMenu>
		),
	},
	{ id: 'switch', node: <Switch {...{ [PROBE_ATTR]: 'switch' }} /> },
	{ id: 'checkbox', node: <Checkbox {...{ [PROBE_ATTR]: 'checkbox' }} /> },
	{ id: 'textarea', node: <Textarea {...{ [PROBE_ATTR]: 'textarea' }} /> },
];

/**
 * Renders every probe through `react-dom/server` and returns the static
 * markup snippets. Throws if a primitive ever stops carrying its probe
 * attribute (silent contract drift must fail loud, exactly like
 * `entity-crumb-render-target.tsx`'s success-branch pin).
 */
export const renderFocusProbeCaseMarkup = (): FocusProbeCase[] =>
	probeNodes.map(({ id, node }) => {
		const markup = renderToStaticMarkup(node);
		if (!markup.includes(`${PROBE_ATTR}="${id}"`)) {
			throw new Error(
				`renderFocusProbeCaseMarkup: the real component for probe "${id}" ` +
					`did not render ${PROBE_ATTR}="${id}" — the primitive's render ` +
					'path changed (a new wrapper, a renamed slot); fix the probe, ' +
					'do not loosen the spec.',
			);
		}
		return { id, markup };
	});
