import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { IndexRoute } from './index';

describe('front-2 index route', () => {
	test('renders minimal shell headline', () => {
		const html = renderToStaticMarkup(<IndexRoute />);
		expect(html).toContain('Welcome to front-2');
		expect(html).toContain('Minimal buildable TanStack Start shell.');
		expect(html).toContain('HeroUI placeholder');
	});
});
