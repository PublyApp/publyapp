import { describe, expect, test } from 'vitest';

import resourceEN from '~/i18n/locales/en/common.json';
import resourceFR from '~/i18n/locales/fr/common.json';
import {
	createI18nFromResources,
	type I18nResources,
	type SupportedLanguage,
} from '~/lib/i18n.shared';

import {
	renderInvalidCellMessage,
	type InvalidCell,
} from './_invite-user-form-state';

const RESOURCES: I18nResources = {
	en: { common: resourceEN },
	fr: { common: resourceFR },
};

const makeT = (language: SupportedLanguage) =>
	createI18nFromResources(language, ['common'], RESOURCES).t.bind(
		createI18nFromResources(language, ['common'], RESOURCES),
	);

describe('renderInvalidCellMessage renders clear words, never raw interpolation markup', () => {
	for (const language of ['en', 'fr'] as const) {
		test(`(${language}): boolean cell WITH a reference shows the reference, no "{{"`, () => {
			const t = makeT(language);
			const invalidCell: InvalidCell = {
				column: 'level',
				cell: 'B2',
				value: '1',
				kind: 'boolean',
			};

			const message = renderInvalidCellMessage(invalidCell, t);

			console.log(`[${language}] boolean WITH cell →`, JSON.stringify(message));
			expect(message).not.toContain('{{');
			expect(message).not.toContain('}}');
			expect(message).toContain('B2');
			expect(message).toContain('1');
		});

		test(`(${language}): boolean cell WITHOUT a reference omits the cell, no "{{"`, () => {
			const t = makeT(language);
			const invalidCell: InvalidCell = {
				column: 'level',
				value: '1',
				kind: 'boolean',
			};

			const message = renderInvalidCellMessage(invalidCell, t);

			console.log(`[${language}] boolean WITHOUT cell →`, JSON.stringify(message));
			expect(message).not.toContain('{{');
			expect(message).not.toContain('}}');
			expect(message).toContain('1');
		});

		test(`(${language}): formula-error cell WITH a reference shows the reference, no "{{"`, () => {
			const t = makeT(language);
			const invalidCell: InvalidCell = {
				column: 'email',
				cell: 'A3',
				value: '#REF!',
				kind: 'formula-error',
			};

			const message = renderInvalidCellMessage(invalidCell, t);

			console.log(`[${language}] formula-error WITH cell →`, JSON.stringify(message));
			expect(message).not.toContain('{{');
			expect(message).not.toContain('}}');
			expect(message).toContain('A3');
			expect(message).toContain('#REF!');
		});

		test(`(${language}): formula-error cell WITHOUT a reference omits the cell, no "{{"`, () => {
			const t = makeT(language);
			const invalidCell: InvalidCell = {
				column: 'email',
				value: '#REF!',
				kind: 'formula-error',
			};

			const message = renderInvalidCellMessage(invalidCell, t);

			console.log(`[${language}] formula-error WITHOUT cell →`, JSON.stringify(message));
			expect(message).not.toContain('{{');
			expect(message).not.toContain('}}');
			expect(message).toContain('#REF!');
		});
	}
});
