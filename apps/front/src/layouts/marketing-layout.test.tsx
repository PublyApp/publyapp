/** @vitest-environment jsdom */
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { renderMarketing } from '~/components/marketing/marketing.test-helper';

import { MarketingLayout } from './marketing-layout';

afterEach(cleanup);

describe('MarketingLayout', () => {
	test('composes the social proof and CTA bands between the page body and the footer', async () => {
		await renderMarketing(
			<MarketingLayout pathname="/">
				<p>page body</p>
			</MarketingLayout>,
		);

		const body = screen.getByText('page body');
		const proof = screen.getByTestId('marketing-social-proof');
		const cta = screen.getByTestId('marketing-cta-band');
		const footer = screen.getByTestId('marketing-footer');
		const follows = (a: Node, b: Node) =>
			Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

		expect(follows(body, proof)).toBe(true);
		expect(follows(proof, cta)).toBe(true);
		expect(follows(cta, footer)).toBe(true);
	});
});
