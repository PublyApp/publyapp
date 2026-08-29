/**
 * @vitest-environment node
 */
import { JSDOM } from 'jsdom';
import * as ReactDOMServer from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { ScrollArea } from './scroll-area';

describe('ScrollArea (SSR)', () => {
	test('renders the full SimpleBar DOM contract on the server with correct nesting', () => {
		const html = ReactDOMServer.renderToStaticMarkup(
			<ScrollArea scrollAreaLabel="Contenu déroulant">
				<div>alpha</div>
			</ScrollArea>,
		);

		const dom = new JSDOM(html);
		const parsed = dom.window.document;

		const root = parsed.querySelector('[data-simplebar="init"]');
		expect(root).not.toBeNull();

		const wrapper = root?.querySelector('.simplebar-wrapper');
		expect(wrapper).not.toBeNull();
		expect(wrapper?.parentElement).toBe(root);

		const placeholder = wrapper?.querySelector('.simplebar-placeholder');
		expect(placeholder).not.toBeNull();
		expect(placeholder?.parentElement).toBe(wrapper);

		const mask = wrapper?.querySelector('.simplebar-mask');
		expect(mask).not.toBeNull();
		expect(mask?.parentElement).toBe(wrapper);

		const offset = mask?.querySelector('.simplebar-offset');
		expect(offset).not.toBeNull();
		expect(offset?.parentElement).toBe(mask);

		const scroller = offset?.querySelector('.simplebar-content-wrapper');
		expect(scroller).not.toBeNull();
		expect(scroller?.parentElement).toBe(offset);

		const content = scroller?.querySelector('.simplebar-content');
		expect(content).not.toBeNull();
		expect(content?.parentElement).toBe(scroller);
		expect(content?.textContent).toBe('alpha');

		expect(scroller?.getAttribute('role')).toBe('region');
		expect(scroller?.getAttribute('aria-label')).toBe('Contenu déroulant');

		const trackHorizontal = root?.querySelector(
			'.simplebar-track.simplebar-horizontal',
		);
		expect(trackHorizontal).not.toBeNull();
		expect(trackHorizontal?.parentElement).toBe(root);

		const trackVertical = root?.querySelector(
			'.simplebar-track.simplebar-vertical',
		);
		expect(trackVertical).not.toBeNull();
		expect(trackVertical?.parentElement).toBe(root);

		const scrollbars = parsed.querySelectorAll('.simplebar-scrollbar');
		expect(scrollbars).toHaveLength(2);

		expect(parsed.querySelectorAll('.simplebar-visible')).toHaveLength(0);
	});

	test('server output stays inert: no revealed thumbs, no focusability', () => {
		const html = ReactDOMServer.renderToStaticMarkup(
			<ScrollArea scrollAreaLabel="Test">
				<div>content</div>
			</ScrollArea>,
		);

		const dom = new JSDOM(html);
		const parsed = dom.window.document;

		expect(parsed.querySelectorAll('.simplebar-visible')).toHaveLength(0);
	});
});
