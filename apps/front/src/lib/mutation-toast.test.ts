/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	loggerError: vi.fn(),
	sonnerImportCount: 0,
	rejectSonnerImport: false,
	toastDefault: vi.fn(),
	toast: {
		error: vi.fn(),
		info: vi.fn(),
		success: vi.fn(),
		warning: vi.fn(),
	},
}));

vi.mock('@org/shared-ts/lib/logger/iso-logger', () => ({
	logger: { error: mocks.loggerError },
}));

import { createI18nFromResources } from './i18n.shared';

type MutationToastModule = typeof import('./mutation-toast');

let adapter: MutationToastModule;

const makeI18n = () =>
	createI18nFromResources('fr', ['common', 'response-message'], {
		fr: {
			common: {
				'an-error-occurred': 'Une erreur est survenue',
				'frontend-success': 'Succès frontend',
			},
			'response-message': {
				'backend-success': 'Succès backend',
				'backend-failure': 'Échec backend',
			},
		},
	});

const flushToast = async (): Promise<void> => {
	await vi.waitFor(() => {
		const calls =
			mocks.toastDefault.mock.calls.length > 0 ||
			Object.values(mocks.toast).some((method) => method.mock.calls.length > 0);
		expect(calls).toBe(true);
	});
};

beforeEach(async () => {
	vi.resetModules();
	mocks.loggerError.mockClear();
	mocks.sonnerImportCount = 0;
	mocks.rejectSonnerImport = false;
	mocks.toastDefault.mockClear();
	for (const method of Object.values(mocks.toast)) {
		method.mockClear();
	}
	vi.doMock('sonner', async () => {
		mocks.sonnerImportCount += 1;
		if (mocks.rejectSonnerImport) {
			throw new Error('sonner import failed');
		}

		return { toast: Object.assign(mocks.toastDefault, mocks.toast) };
	});
	adapter = await import('./mutation-toast');
	adapter.registerMutationToastI18n(makeI18n());
});

afterEach(() => {
	adapter.registerMutationToastI18n(undefined);
	vi.unstubAllGlobals();
});

describe('displayMutationFeedback', () => {
	test('translates an explicit frontend success key through common', async () => {
		await adapter.displayMutationFeedback({
			kind: 'success',
			translationKey: 'frontend-success',
		});

		expect(mocks.toast.success).toHaveBeenCalledWith('Succès frontend');
	});

	test('resolves an API key through response-message before common', async () => {
		await adapter.displayMutationFeedback({
			kind: 'success',
			translationKey: 'backend-success',
		});

		expect(mocks.toast.success).toHaveBeenCalledWith('Succès backend');
	});

	test('uses failure fallback text when the response key is absent', async () => {
		await adapter.displayMutationFeedback({
			kind: 'error',
			failure: {
				kind: 'problem',
				status: 500,
				translationKey: 'missing-backend-key',
				detail: undefined,
				title: undefined,
			},
			fallbackMessage: 'Safe fallback',
		});

		expect(mocks.toast.error).toHaveBeenCalledWith('Safe fallback');
	});

	test('uses the localized generic error when no key or fallback exists', async () => {
		await adapter.displayMutationFeedback({
			kind: 'error',
			failure: {
				kind: 'unknown',
				message: '',
			},
		});

		expect(mocks.toast.error).toHaveBeenCalledWith('Une erreur est survenue');
	});

	test('does not resolve an unknown failure key through common', async () => {
		await adapter.displayMutationFeedback({
			kind: 'error',
			failure: {
				kind: 'problem',
				status: 500,
				translationKey: 'frontend-success',
				detail: undefined,
				title: undefined,
			},
		});

		expect(mocks.toast.error).toHaveBeenCalledWith('Une erreur est survenue');
	});

	test('does not import Sonner for silent intents', async () => {
		await adapter.displayMutationFeedback({ kind: 'silent', reason: 'abort' });

		expect(mocks.sonnerImportCount).toBe(0);
		expect(mocks.toast.error).not.toHaveBeenCalled();
	});

	test('does not import Sonner or retain a request i18n instance during SSR', async () => {
		adapter.registerMutationToastI18n(undefined);
		vi.stubGlobal('window', undefined);
		adapter.registerMutationToastI18n(makeI18n());

		await adapter.displayMutationFeedback({
			kind: 'success',
			translationKey: 'frontend-success',
			fallbackMessage: 'Safe browser fallback',
		});

		expect(mocks.sonnerImportCount).toBe(0);

		vi.stubGlobal('window', {});
		await adapter.displayMutationFeedback({
			kind: 'success',
			translationKey: 'frontend-success',
			fallbackMessage: 'Safe browser fallback',
		});
		await flushToast();

		expect(mocks.toast.success).toHaveBeenCalledWith('Safe browser fallback');
	});

	test('caches the dynamic Sonner import across rapid calls', async () => {
		await Promise.all([
			adapter.displayMutationFeedback({
				kind: 'success',
				fallbackMessage: 'One',
			}),
			adapter.displayMutationFeedback({
				kind: 'success',
				fallbackMessage: 'Two',
			}),
		]);

		expect(mocks.sonnerImportCount).toBe(1);
		expect(mocks.toast.success).toHaveBeenCalledTimes(2);
	});

	test('swallows and logs a rejected Sonner import, then retries later', async () => {
		mocks.rejectSonnerImport = true;
		vi.resetModules();
		adapter = await import('./mutation-toast');
		adapter.registerMutationToastI18n(makeI18n());

		await expect(
			adapter.displayMutationFeedback({
				kind: 'success',
				fallbackMessage: 'First attempt',
			}),
		).resolves.toBeUndefined();
		expect(mocks.loggerError).toHaveBeenCalled();

		mocks.rejectSonnerImport = false;
		await adapter.displayMutationFeedback({
			kind: 'success',
			fallbackMessage: 'Retry succeeded',
		});

		expect(mocks.sonnerImportCount).toBe(2);
		expect(mocks.toast.success).toHaveBeenCalledWith('Retry succeeded');
	});
});

describe('displayLocalMutationFailure', () => {
	test('normalizes and displays an ordinary API rejection', async () => {
		await adapter.displayLocalMutationFailure(
			{
				responseStatusCode: 500,
				title: 'Server exploded',
			},
			'Caller fallback',
		);

		expect(mocks.toast.error).toHaveBeenCalledWith('Server exploded');
	});

	test('keeps aborts and 401 failures silent', async () => {
		await adapter.displayLocalMutationFailure(
			new DOMException('Aborted', 'AbortError'),
		);
		await adapter.displayLocalMutationFailure({ responseStatusCode: 401 });

		expect(mocks.toast.error).not.toHaveBeenCalled();
	});
});

describe('toastLocalMutationResult', () => {
	test('forwards a described neutral toast through the callable Sonner API', async () => {
		adapter.toastLocalMutationResult.default('Notice', 'Neutral description');
		await flushToast();

		expect(mocks.toastDefault).toHaveBeenCalledWith('Notice', {
			description: 'Neutral description',
		});
	});

	test('forwards optional descriptions through the presentation adapter', async () => {
		adapter.toastLocalMutationResult.success('Created', 'The record is ready');
		await flushToast();

		expect(mocks.toast.success).toHaveBeenCalledWith('Created', {
			description: 'The record is ready',
		});
	});

	test('forwards localized domain messages to matching Sonner methods', async () => {
		adapter.toastLocalMutationResult.success('Created');
		adapter.toastLocalMutationResult.error('Failed');
		adapter.toastLocalMutationResult.warning('Careful');
		adapter.toastLocalMutationResult.info('FYI');
		await flushToast();

		expect(mocks.toast.success).toHaveBeenCalledWith('Created');
		expect(mocks.toast.error).toHaveBeenCalledWith('Failed');
		expect(mocks.toast.warning).toHaveBeenCalledWith('Careful');
		expect(mocks.toast.info).toHaveBeenCalledWith('FYI');
	});
});
