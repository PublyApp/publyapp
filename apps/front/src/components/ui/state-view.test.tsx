import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { StateView } from './state-view';

afterEach(cleanup);

const TONES = ['info', 'neutral', 'warning', 'danger'] as const;

const assertTitleSentenceActionsOrder = () => {
	const title = screen.getByText('Title');
	const sentence = screen.getByText('Sentence');
	const action = screen.getByRole('button', { name: 'Act' });

	expect(
		title.compareDocumentPosition(sentence) & Node.DOCUMENT_POSITION_FOLLOWING,
	).toBeTruthy();
	expect(
		sentence.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING,
	).toBeTruthy();
};

describe('StateView — ShopKart OS status pictogram', () => {
	test.each(TONES)(
		'renders the %s tone as two rings around the tilted tile',
		(tone) => {
			render(
				<StateView
					icon={<svg data-testid="glyph" />}
					tone={tone}
					scale="page"
					title="Title"
					description="Sentence"
					actions={
						<button type="button" name="act">
							Act
						</button>
					}
					testId="state"
				/>,
			);

			const root = screen.getByTestId('state');
			expect(root.getAttribute('data-presentation')).toBe('status');
			expect(root.querySelectorAll('.publy-status-ring')).toHaveLength(2);
			expect(root.querySelector('.publy-empty-ring')).toBeNull();

			const cluster = root.querySelector('.publy-state-icon-cluster');
			expect(cluster?.getAttribute('aria-hidden')).toBe('true');
			expect(cluster?.getAttribute('data-tone')).toBe(tone);

			const tile = root.querySelector('.publy-state-icon');
			expect(tile?.getAttribute('data-presentation')).toBe('status');
			expect(tile?.getAttribute('data-tone')).toBe(tone);
			expect(tile?.querySelector('[data-testid="glyph"]')).not.toBeNull();
		},
	);

	test('keeps the title, the one sentence and the actions in that order', () => {
		render(
			<StateView
				icon={<span />}
				tone="danger"
				scale="page"
				title="Title"
				description="Sentence"
				actions={
					<button type="button" name="act">
						Act
					</button>
				}
				testId="state"
			/>,
		);

		assertTitleSentenceActionsOrder();
	});

	test('folds the raw error under a collapsed technical-details disclosure', () => {
		render(
			<StateView
				icon={<span />}
				tone="danger"
				scale="page"
				title="Title"
				description="Sentence"
				details="Raw failure cause"
				detailsLabel="Technical details"
				testId="state"
			/>,
		);

		const disclosure = screen.getByTestId('state').querySelector('details');
		expect(disclosure).not.toBeNull();
		expect(disclosure?.hasAttribute('open')).toBe(false);
		expect(screen.getByText('Technical details')).toBeTruthy();
		expect(screen.getByText('Raw failure cause').tagName).toBe('PRE');
	});
});

describe('StateView — ShopKart OS empty pictogram', () => {
	test('renders two neutral rings around the tilted tile', () => {
		render(
			<StateView
				icon={<svg data-testid="glyph" />}
				scale="inline"
				presentation="empty"
				title="Title"
				description="Sentence"
				actions={
					<button type="button" name="act">
						Act
					</button>
				}
				testId="empty"
			/>,
		);

		const root = screen.getByTestId('empty');
		expect(root.getAttribute('data-presentation')).toBe('empty');
		expect(root.getAttribute('data-tone')).toBe('neutral');
		expect(root.querySelectorAll('.publy-empty-ring')).toHaveLength(2);
		expect(root.querySelector('.publy-status-ring')).toBeNull();

		const tile = root.querySelector('.publy-state-icon');
		expect(tile?.getAttribute('data-presentation')).toBe('empty');
		expect(tile?.querySelector('[data-testid="glyph"]')).not.toBeNull();
		assertTitleSentenceActionsOrder();
	});
});

describe('StateView — ShopKart OS pictogram geometry (app.css)', () => {
	const css = readFileSync(
		resolve(process.cwd(), 'src/styles/app.css'),
		'utf8',
	);

	test('empty tile: 120px rings, 56px tile at −6°, icon counter-rotated +6°', () => {
		expect(css).toContain(
			".publy-state-icon-cluster[data-presentation='empty'] {\n\t\tposition: relative;\n\t\twidth: 120px;\n\t\theight: 120px;",
		);
		expect(css).toContain(
			".publy-state-icon[data-presentation='empty'] {\n\t\tposition: absolute;\n\t\ttop: 32px;\n\t\tleft: 32px;\n\t\twidth: 56px;\n\t\theight: 56px;",
		);
		expect(css).toContain('transform: rotate(-6deg);');
		expect(css).toContain(
			".publy-state-icon[data-presentation='empty'] svg {\n\t\twidth: 28px;\n\t\theight: 28px;\n\t\tstroke-width: 1.5;\n\t\ttransform: rotate(6deg);",
		);
	});

	test('every state colour token has a dark counterpart (tile and rings stay readable)', () => {
		const dark = css.slice(css.indexOf('html.dark'));

		for (const token of [
			'--publy-card',
			'--publy-border',
			'--publy-foreground-muted',
			'--publy-chip-invited-bg',
			'--publy-chip-invited-border',
			'--publy-chip-invited-text',
			'--publy-chip-pending-bg',
			'--publy-chip-pending-border',
			'--publy-chip-pending-text',
			'--publy-chip-suspended-bg',
			'--publy-chip-suspended-border',
			'--publy-chip-suspended-text',
		]) {
			expect(dark).toContain(`${token}:`);
		}
	});

	test('status tile: 144px rings, 64px tile radius 20px at −6°, icon 32px @1.75', () => {
		expect(css).toContain(
			".publy-state-icon-cluster[data-presentation='status'] {\n\t\tposition: relative;\n\t\twidth: 144px;\n\t\theight: 144px;",
		);
		expect(css).toContain(
			".publy-state-icon[data-presentation='status'] {\n\t\twidth: 64px;\n\t\theight: 64px;\n\t\tborder: 1px solid var(--publy-border);\n\t\tborder-radius: 20px;",
		);
		expect(css).toContain(
			".publy-state-icon[data-presentation='status'] svg {\n\twidth: 32px;\n\theight: 32px;\n\tstroke-width: 1.75;\n\ttransform: rotate(6deg);",
		);
	});
});
