/**
 * Real-`<Trans>` render guard (#1269).
 *
 * The four `<Trans>` call-site component tests mock `react-i18next`
 * (85 of 213 front test files do), so the suite is structurally blind to any
 * react-i18next regression — the i18next 26 / react-i18next 17 bump swapped
 * `html-parse-stringify` 3 → 4, the parser behind `<Trans>`, and nothing in
 * CI would have noticed a rendering change.
 *
 * This guard mounts every production `<Trans>` key through the REAL
 * react-i18next with the REAL EN and FR resources (the same JSON files the
 * app ships) and pins the rendered DOM in two modes:
 *
 * - **Call-site mode** — exactly what each route renders today:
 *   `components={{ strong: <strong className="text-foreground" /> }}`.
 * - **Bare-resource mode** — the same key with no `components` map, so
 *   rendering rides on the resource's raw `<strong>` markup and therefore on
 *   `transKeepBasicHtmlNodesFor` (default `['br', 'strong', 'i', 'p']`). This
 *   mode is the parser canary: with the keep-list emptied, `<Trans>` no longer
 *   lifts `<strong>` out of the resource string and it lands in the DOM as
 *   escaped text (`&lt;strong&gt;…`) instead of an element.
 *
 * Expected sentences are pinned verbatim below (NOT re-derived from the
 * resource files — an expectation computed from the same string it renders
 * could never detect drift). The guard goes red when a key breaks, when an
 * EN/FR resource string drifts from these pins, or when basic-HTML-node
 * parsing behaviour changes.
 *
 * Paired proof (2026-08-23, both flips observed locally against this exact
 * file, then reverted):
 * - Emptying `transKeepBasicHtmlNodesFor` in this test's init (`react: {
 *   useSuspense: false, transKeepBasicHtmlNodesFor: [] }`) turns the guard
 *   red: all 10 bare-resource assertions fail (`the resource's <strong> must
 *   survive parsing: expected +0 to be …`), while the call-site assertions
 *   stay green — that is expected and documented above: with a `components`
 *   map the tag name is a known component name, so the keep-list plays no
 *   role on that path.
 * - Appending "X" to the EN resource of `reset-password-description` turns
 *   exactly that key's two EN sentence-pin assertions red (call-site +
 *   bare-resource) while every other assertion stays green.
 */
/**
 * @vitest-environment jsdom
 */
import { cleanup, render } from '@testing-library/react';
import { createInstance, type i18n as I18nInstance } from 'i18next';
import { I18nextProvider, initReactI18next, Trans } from 'react-i18next';
import { afterEach, describe, expect, test, vi } from 'vitest';

import resourceEN from '../../i18n/locales/en';
import resourceFR from '../../i18n/locales/fr';

type Language = 'en' | 'fr';

// react-i18next types i18nKey against the known translation-key union.
type AuthTranslationKey = Extract<keyof typeof resourceEN.auth, string>;

// auth.json is flat: every value is a plain translation string.
const AUTH_RESOURCES: Record<Language, Record<string, string>> = {
	en: resourceEN.auth,
	fr: resourceFR.auth,
};

/**
 * Every production `<Trans>` call site (`rg "<Trans" apps/front/src`):
 * reset-password.tsx ×2, accept-invitation.tsx ×1 (both mismatch views share
 * one `<Trans>` fed by INVITATION_MISMATCH_I18N_KEYS), verify-email.tsx ×1.
 * All render in the `auth` namespace with a `components={{ strong }}` map and
 * interpolate emails — mirrored exactly below.
 *
 * `expectedText` pins the exact rendered text per language: resource markup
 * stripped, values interpolated. These pins are what make resource edits red;
 * update them deliberately when copy changes.
 */
const TRANS_PRODUCTION_KEYS = [
	{
		key: 'reset-link-sent-description',
		callSite: 'routes/reset-password.tsx (request form → sent confirmation)',
		values: { email: 'ada@example.com' },
		en: "ada@example.com is valid, you'll receive an email with a link to reset your password.",
		fr: 'Si ada@example.com est valide, vous recevrez un email avec un lien pour réinitialiser votre mot de passe.',
	},
	{
		key: 'reset-password-description',
		callSite: 'routes/reset-password.tsx (set-new-password form)',
		values: { email: 'grace@example.com' },
		en: 'Enter your new password for grace@example.com',
		fr: 'Entrez votre nouveau mot de passe pour grace@example.com',
	},
	{
		key: 'auth-invitation-existing-user-mismatch-description',
		callSite: 'routes/accept-invitation.tsx (existing-user mismatch view)',
		values: {
			invitationEmail: 'invited@example.com',
			currentUserEmail: 'other@example.com',
		},
		en: 'This invitation belongs to invited@example.com. You are currently signed in as other@example.com. Log out, then sign in as the invited user to continue.',
		fr: "Cette invitation appartient à invited@example.com. Vous êtes actuellement connecté en tant que other@example.com. Déconnectez-vous, puis connectez-vous avec l'utilisateur invité pour continuer.",
	},
	{
		key: 'auth-invitation-new-user-mismatch-description',
		callSite: 'routes/accept-invitation.tsx (new-user mismatch view)',
		values: {
			invitationEmail: 'invited@example.com',
			currentUserEmail: 'other@example.com',
		},
		en: 'This invitation is for invited@example.com, but you are signed in as other@example.com. Log out to continue creating the invited account.',
		fr: 'Cette invitation est destinée à invited@example.com, mais vous êtes actuellement connecté en tant que other@example.com. Déconnectez-vous pour continuer la création du compte invité.',
	},
	{
		key: 'verify-email-sent-description',
		callSite: 'routes/verify-email.tsx (verification email sent)',
		values: { email: 'linus@example.com' },
		en: "linus@example.com is valid, you'll receive an email with a link to verify your account.",
		fr: 'Si linus@example.com est valide, vous recevrez un email avec un lien pour vérifier votre compte.',
	},
] as const;

let instance: I18nInstance | undefined;

afterEach(() => {
	cleanup();
	instance = undefined;
});

/** Mirrors the production init shape (`createI18nFromResources`). */
const makeRealI18n = (
	language: Language,
	keepBasicHtmlNodesFor?: readonly string[],
): I18nInstance => {
	const reactOptions: Record<string, unknown> = { useSuspense: false };
	if (keepBasicHtmlNodesFor) {
		reactOptions.transKeepBasicHtmlNodesFor = [...keepBasicHtmlNodesFor];
	}
	const i = createInstance();
	void i.use(initReactI18next).init({
		lng: language,
		fallbackLng: false,
		supportedLngs: ['en', 'fr'],
		defaultNS: 'common',
		ns: ['auth'],
		resources: { [language]: { auth: AUTH_RESOURCES[language] } },
		interpolation: { escapeValue: false },
		react: reactOptions,
		initAsync: false,
	});
	return i;
};

/** Renders one production key exactly as the call sites do. */
const renderProductionTrans = (
	language: Language,
	i18nKey: AuthTranslationKey,
	values: Record<string, string>,
): HTMLElement => {
	instance = makeRealI18n(language);
	const { container } = render(
		<I18nextProvider i18n={instance}>
			<Trans
				i18nKey={i18nKey}
				ns="auth"
				values={values}
				components={{ strong: <strong className="text-foreground" /> }}
			/>
		</I18nextProvider>,
	);
	return container;
};

/**
 * Renders one production key riding only on the resource's own markup (no
 * `components` map) — the path that depends on transKeepBasicHtmlNodesFor.
 */
const renderBareResourceTrans = (
	language: Language,
	i18nKey: AuthTranslationKey,
	values: Record<string, string>,
): HTMLElement => {
	// Default react options → default transKeepBasicHtmlNodesFor. Only the
	// paired-proof mutation empties that list.
	instance = makeRealI18n(language);
	const { container } = render(
		<I18nextProvider i18n={instance}>
			<Trans i18nKey={i18nKey} ns="auth" values={values} />
		</I18nextProvider>,
	);
	return container;
};

const countOccurrences = (haystack: string, needle: string): number =>
	haystack.split(needle).length - 1;

describe('real-<Trans> render guard (#1269)', () => {
	test('react-i18next is NOT mocked in this file', () => {
		// #1269 exists because the rest of the suite fakes `<Trans>` with a
		// regex. If a `vi.mock('react-i18next', …)` sneaks into this file, the
		// plugin object loses its real shape and these fail loudly.
		expect(
			vi.isMockFunction(Trans),
			'Trans must be the real react-i18next component, not a vi.fn',
		).toBe(false);
		expect(
			(initReactI18next as unknown as { type?: string }).type,
			'initReactI18next must be the real react-i18next plugin object',
		).toBe('3rdParty');
	});

	test('every production <Trans> key exists in BOTH language resources', () => {
		for (const { key } of TRANS_PRODUCTION_KEYS) {
			expect(
				AUTH_RESOURCES.en[key],
				`en/auth.json must contain ${key}`,
			).toBeTypeOf('string');
			expect(
				AUTH_RESOURCES.fr[key],
				`fr/auth.json must contain ${key}`,
			).toBeTypeOf('string');
		}
	});

	for (const language of ['en', 'fr'] as const) {
		describe(language, () => {
			for (const spec of TRANS_PRODUCTION_KEYS) {
				const { key, callSite, values } = spec;
				test(`${key} (${callSite}) renders real <strong> elements around each interpolated email`, () => {
					const container = renderProductionTrans(language, key, values);

					const expectedEmails = Object.values(values);
					const strongs = [...container.querySelectorAll('strong')];

					// Tag names: one real <strong> per interpolated value…
					expect(
						strongs.length,
						`${language}/${key}: expected one <strong> per interpolated value`,
					).toBe(expectedEmails.length);
					for (const strong of strongs) {
						expect(strong.tagName).toBe('STRONG');
					}
					// …carrying the production className from the components map.
					for (const strong of strongs) {
						expect(strong.className).toBe('text-foreground');
					}

					// Text content: each email sits inside exactly one <strong>.
					expect(strongs.map((el) => el.textContent)).toEqual(expectedEmails);

					// Never escaped-markup text (`&lt;strong&gt;…`): that is how a
					// broken parser renders these resources.
					const text = container.textContent ?? '';
					expect(text).not.toContain('&lt;');
					for (const email of expectedEmails) {
						expect(countOccurrences(text, email)).toBe(1);
					}

					// Full-sentence pin against the verbatim expected text for this
					// language — NOT a value recomputed from the resource file, so
					// any EN/FR wording drift flips this red.
					expect(
						text,
						`${language}/${key}: rendered sentence drifted from the pinned copy`,
					).toBe(spec[language]);
				});
			}
		});
	}

	for (const language of ['en', 'fr'] as const) {
		describe(`${language} (bare resource, no components map)`, () => {
			for (const spec of TRANS_PRODUCTION_KEYS) {
				const { key, callSite, values } = spec;
				test(`${key} (${callSite}) keeps the resource's own <strong> as real DOM elements`, () => {
					const container = renderBareResourceTrans(language, key, values);

					const expectedEmails = Object.values(values);

					// The keep-list path: the resource's bare <strong> must come
					// out of html-parse-stringify as real elements, one per
					// interpolated value, not as escaped text nodes.
					const strongs = [...container.querySelectorAll('strong')];
					expect(
						strongs.length,
						`${language}/${key}: the resource's <strong> must survive parsing`,
					).toBe(expectedEmails.length);
					expect(strongs.map((el) => el.textContent)).toEqual(expectedEmails);

					// And never the degraded form.
					const text = container.textContent ?? '';
					expect(text).not.toContain('&lt;');

					// Same verbatim sentence pin in bare-resource mode.
					expect(text).toBe(spec[language]);
				});
			}
		});
	}
});
