import { describe, expect, test } from 'vitest';

import {
	resolveMutationFailureIntent,
	resolveMutationSuccessIntent,
} from './policy';
import type { MutationFailureFeedback, MutationSuccessFeedback } from './types';

describe('resolveMutationFailureIntent', () => {
	test('keeps aborted failures silent', () => {
		expect(resolveMutationFailureIntent({ kind: 'abort' }, {})).toEqual({
			kind: 'silent',
			reason: 'abort',
		});
	});

	test('keeps unauthorized failures silent', () => {
		expect(
			resolveMutationFailureIntent(
				{
					kind: 'problem',
					status: 401,
					translationKey: 'unauthorized',
					detail: 'Unauthorized',
					title: 'Unauthorized',
				},
				{},
			),
		).toEqual({ kind: 'silent', reason: 'unauthorized' });
	});

	test('keeps form-handled validation silent', () => {
		expect(
			resolveMutationFailureIntent(
				{
					kind: 'validation',
					status: 422,
					translationKey: 'validation-failed',
					detail: undefined,
					title: undefined,
					fieldErrors: { email: ['Already used'] },
				},
				{ validationHandledByForm: true },
			),
		).toEqual({ kind: 'silent', reason: 'handled-validation' });
	});

	test('keeps globally handled failures silent', () => {
		expect(
			resolveMutationFailureIntent(
				{
					kind: 'problem',
					status: 500,
					translationKey: 'server-error',
					detail: 'Server error',
					title: 'Server error',
				},
				{ skipGlobalErrorHandler: true },
			),
		).toEqual({ kind: 'silent', reason: 'local-error-owner' });
	});

	test('keeps 403 failures visible with their translation key', () => {
		expect(
			resolveMutationFailureIntent(
				{
					kind: 'problem',
					status: 403,
					translationKey: 'forbidden',
					detail: undefined,
					title: 'Forbidden',
				},
				{},
			),
		).toEqual({
			kind: 'error',
			failure: {
				kind: 'problem',
				status: 403,
				translationKey: 'forbidden',
				detail: undefined,
				title: 'Forbidden',
			},
			translationKey: 'forbidden',
			fallbackMessage: 'Forbidden',
		});
	});

	test('keeps unhandled validation failures visible with detail fallback', () => {
		const failure = {
			kind: 'validation' as const,
			status: 422,
			translationKey: undefined,
			detail: 'Validation failed',
			title: 'Invalid request',
			fieldErrors: { email: ['Invalid'] },
		};

		expect(resolveMutationFailureIntent(failure, {})).toEqual({
			kind: 'error',
			failure,
			fallbackMessage: 'Validation failed',
		});
	});

	test('keeps network and unknown failures visible', () => {
		expect(
			resolveMutationFailureIntent({ kind: 'network', message: 'Offline' }, {}),
		).toEqual({
			kind: 'error',
			failure: { kind: 'network', message: 'Offline' },
			fallbackMessage: 'Offline',
		});

		expect(
			resolveMutationFailureIntent(
				{ kind: 'unknown', message: 'Unexpected' },
				{},
			),
		).toEqual({
			kind: 'error',
			failure: { kind: 'unknown', message: 'Unexpected' },
			fallbackMessage: 'Unexpected',
		});
	});

	test('does not silence validation when the form does not own it', () => {
		const failure = {
			kind: 'validation' as const,
			status: 422,
			translationKey: 'validation-failed',
			detail: undefined,
			title: undefined,
			fieldErrors: { email: ['Invalid'] },
		};

		expect(
			resolveMutationFailureIntent(failure, {
				validationHandledByForm: false,
			}),
		).toEqual({
			kind: 'error',
			failure,
			translationKey: 'validation-failed',
		});
	});

	test('does not let the auth backstop flag silence a failure', () => {
		const failure = {
			kind: 'problem' as const,
			status: 500,
			translationKey: undefined,
			detail: 'Server error',
			title: undefined,
		};

		expect(
			resolveMutationFailureIntent(failure, {
				skipAuthedErrorBackstop: true,
			}),
		).toEqual({
			kind: 'error',
			failure,
			fallbackMessage: 'Server error',
		});
	});
});

describe('resolveMutationSuccessIntent', () => {
	test('uses an explicit success message as the translation key', () => {
		expect(
			resolveMutationSuccessIntent(
				{ translationKey: 'response-key', message: 'Response message' },
				{ successMessage: 'explicit-success' },
			),
		).toEqual({ kind: 'success', translationKey: 'explicit-success' });
	});

	test('extracts a response translation key and message when requested', () => {
		expect(
			resolveMutationSuccessIntent(
				{ translationKey: 'response-key', message: 'Response message' },
				{ showSuccessToast: true },
			),
		).toEqual({
			kind: 'success',
			translationKey: 'response-key',
			fallbackMessage: 'Response message',
		});
	});

	test('extracts only a response message when no key exists', () => {
		expect(
			resolveMutationSuccessIntent(
				{ message: 'Response message' },
				{ showSuccessToast: true },
			),
		).toEqual({ kind: 'success', fallbackMessage: 'Response message' });
	});

	test('ignores non-string response fields', () => {
		expect(
			resolveMutationSuccessIntent(
				{ translationKey: 42, message: false },
				{ showSuccessToast: true },
			),
		).toEqual({ kind: 'success' });
	});

	test('does not stringify arbitrary response payloads', () => {
		expect(
			resolveMutationSuccessIntent('created', { showSuccessToast: true }),
		).toEqual({ kind: 'success' });
		expect(
			resolveMutationSuccessIntent(['created'], { showSuccessToast: true }),
		).toEqual({ kind: 'success' });
		expect(
			resolveMutationSuccessIntent(null, { showSuccessToast: true }),
		).toEqual({ kind: 'success' });
	});

	test('keeps configured silent success silent', () => {
		expect(
			resolveMutationSuccessIntent(
				{ message: 'Done' },
				{ silentSuccess: true },
			),
		).toEqual({ kind: 'silent', reason: 'configured-silent-success' });
	});
});

test('requires exactly one success feedback mode', () => {
	const validFailureFeedback: MutationFailureFeedback = {
		validationHandledByForm: true,
	};
	void validFailureFeedback;

	const explicitAndResponse: MutationSuccessFeedback = {
		successMessage: 'success',
		// @ts-expect-error successMessage cannot be combined with showSuccessToast.
		showSuccessToast: true,
	};
	void explicitAndResponse;

	const explicitAndSilent: MutationSuccessFeedback = {
		successMessage: 'success',
		// @ts-expect-error successMessage cannot be combined with silentSuccess.
		silentSuccess: true,
	};
	void explicitAndSilent;

	const responseAndSilent: MutationSuccessFeedback = {
		showSuccessToast: true,
		// @ts-expect-error showSuccessToast cannot be combined with silentSuccess.
		silentSuccess: true,
	};
	void responseAndSilent;

	// @ts-expect-error showSuccessToast must be true when selected.
	const disabledResponse: MutationSuccessFeedback = { showSuccessToast: false };
	void disabledResponse;
});
