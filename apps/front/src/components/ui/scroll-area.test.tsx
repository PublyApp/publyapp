/**
 * @vitest-environment jsdom
 */
import { cleanup, render } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, test } from 'vitest';

import { ScrollArea } from './scroll-area';

afterEach(cleanup);

describe('ScrollArea (client)', () => {
	test('forwards the ref to the REAL scroller: scrollTop writes land on the content wrapper', () => {
		const ref = React.createRef<HTMLDivElement>();
		const Host = () => (
			<ScrollArea ref={ref} scrollAreaLabel="Liste">
				<div>alpha</div>
				<div>beta</div>
			</ScrollArea>
		);
		render(<Host />);

		expect(ref.current).not.toBeNull();
		expect(ref.current?.className).toContain('simplebar-content-wrapper');

		// Programmatic scrolling used to target the plain overflow-auto div;
		// it must keep working through the forwarded ref.
		if (!ref.current) throw new Error('ref not set');
		ref.current.scrollTop = 42;
		expect(ref.current.scrollTop).toBe(42);
		expect(ref.current.getAttribute('aria-label')).toBe('Liste');
	});

	test('does not introduce an extra tab stop and rejects the engine default label', () => {
		render(
			<ScrollArea scrollAreaLabel="Zone de journalisation">
				<button type="button">inside</button>
			</ScrollArea>,
		);

		const scroller = document.querySelector('.simplebar-content-wrapper');
		expect(scroller).not.toBeNull();
		// simplebar-react hardcodes tabIndex=0 on this element; our primitive
		// must keep it out of the tab order (-1 allows programmatic focus only).
		expect(scroller?.getAttribute('tabindex')).toBe('-1');
		// The engine's English-only default ("scrollable content") must never
		// leak through.
		expect(scroller?.getAttribute('aria-label')).toBe('Zone de journalisation');
		expect(document.body.textContent).not.toContain('scrollable content');
	});

	test('the engine adopts the React-rendered tree in place (no rebuild, no duplicate scaffolding)', () => {
		render(
			<ScrollArea scrollAreaLabel="Grille" data-testid="area">
				<div>cell</div>
			</ScrollArea>,
		);

		const area = document.querySelector('[data-testid="area"]');
		expect(area?.querySelectorAll('.simplebar-mask')).toHaveLength(1);
		expect(area?.querySelectorAll('.simplebar-content-wrapper')).toHaveLength(
			1,
		);
		// Content survives inside the original scaffold…
		const content = area?.querySelector('.simplebar-content');
		expect(content?.textContent).toBe('cell');
		// …and recalculate() ran against the adopted nodes: the placeholder was
		// measured and sized by the engine (its style is only ever written by
		// the engine, never by React).
		const placeholder = area?.querySelector('.simplebar-placeholder');
		expect(placeholder?.getAttribute('style')).toContain('height');
	});

	test('mounts without effects throwing (hydration smoke test)', () => {
		// #1750 Limite 1: renderToStaticMarkup n'exécute pas les effets.
		// Ce test vérifie que le montage (qui déclenche les effets) ne lève
		// pas d'erreur — un accès `window` dans un effet casserait ici.
		expect(() => {
			render(
				<ScrollArea scrollAreaLabel="Hydratation">
					<div>contenu</div>
				</ScrollArea>,
			);
		}).not.toThrow();
	});
});
