import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { IndexRoute } from './index';

describe('front-2 index route', () => {
	test('renders minimal shell headline', () => {
		const html = renderToStaticMarkup(<IndexRoute />);
		expect(html).toContain('Welcome to the front-2 shell');
		expect(html).toContain(
			'Explore navigation, theme, and auth surface foundations from here.',
		);
		expect(html).toContain('Gray UI shell is active');
	});
});
