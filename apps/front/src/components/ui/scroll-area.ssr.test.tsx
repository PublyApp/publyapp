/**
 * @vitest-environment node
 */
import * as React from 'react';
import * as ReactDOMServer from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { ScrollArea } from './scroll-area';

// Rendered once and reused across assertions: the full HTML contract is the
// same no matter which subset of classes a given assertion probes, and we
// want a single capture to reason against — not N renders whose outputs a
// future drift could silently desync.
function render(label: string, child: React.ReactNode = <div>alpha</div>) {
	return ReactDOMServer.renderToStaticMarkup(
		<ScrollArea scrollAreaLabel={label}>{child}</ScrollArea>,
	);
}

describe('ScrollArea — SSR-safe render (node, no window/document)', () => {
	test('renders the full SimpleBar DOM contract as static markup without touching the DOM', () => {
		const html = render('Contenu déroulant');

		// Engine contract: every node SimpleBar's init() adopts must exist in
		// the server output, with the exact class names the engine reads.
		expect(html).toContain('data-simplebar="init"');
		expect(html).toContain('simplebar-wrapper');
		expect(html).toContain('simplebar-height-auto-observer-wrapper');
		expect(html).toContain('simplebar-height-auto-observer');
		expect(html).toContain('simplebar-mask');
		expect(html).toContain('simplebar-offset');
		expect(html).toContain('simplebar-content-wrapper');
		expect(html).toContain('simplebar-content');
		expect(html).toContain('simplebar-placeholder');

		// Two tracks (horizontal + vertical), each carrying a thumb.
		expect(html).toContain('simplebar-track simplebar-horizontal');
		expect(html).toContain('simplebar-track simplebar-vertical');
		// Exactly two .simplebar-scrollbar nodes — one per track.
		const scrollbarCount = html.split('simplebar-scrollbar').length - 1;
		expect(scrollbarCount).toBe(2);

		// The real scroller (the node that receives scrollTop writes) carries
		// the engine's region semantics and the consumer's accessible name.
		expect(html).toContain('role="region"');
		expect(html).toContain('aria-label="Contenu déroulant"');
		expect(html).toContain('tabindex="-1"');

		// Server output must stay inert: no revealed thumbs, no focus ring.
		expect(html).not.toContain('simplebar-visible');
		expect(html).not.toContain('simplebar-scrolling');
	});

	test('children land inside the content slot (no remount, same scaffold on both sides)', () => {
		const html = render(
			'Liste',
			<ul>
				<li>alpha</li>
				<li>beta</li>
			</ul>,
		);

		// Children are emitted inside the SimpleBar content slot — not outside
		// the scaffold — so the adopted tree matches between server and client.
		const contentIdx = html.indexOf('simplebar-content">');
		expect(contentIdx).toBeGreaterThan(-1);
		const markupFromContent = html.slice(contentIdx);
		expect(markupFromContent).toContain('<ul>');
		expect(markupFromContent).toContain('<li>alpha</li>');
		expect(markupFromContent).toContain('<li>beta</li>');
	});
});
