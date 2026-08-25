import { describe, expect, test } from 'vitest';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

import { resolveProfileSaveFailure } from './profile-edit-details-save-failure';

// Type-guard-shaped stand-ins for the drawers' `isProfileEditDetailsField`
// (`() => false` alone cannot satisfy a type-predicate signature).
const nothingIsKnown = (_field: string): _field is never => false;

// The drawers' `handleSaveFailure` contract, distilled to plain data so it can
// be pinned without rendering React: which failures belong to the form, and
// what the root banner shows when there is nothing to map.
describe('resolveProfileSaveFailure', () => {
	test('classifies a 422 with mapped field errors as form-owned field errors', () => {
		const outcome = resolveProfileSaveFailure({
			error: {
				status: 422,
				responseStatusCode: 422,
				title: 'Validation failed',
				errors: { Name: ['This profile name is unavailable.'] },
			},
			isKnownField: (field) => field === 'name',
			fallbackMessage: 'Unable to save this profile.',
		});

		expect(outcome.kind).toBe('field-errors');
		if (outcome.kind !== 'field-errors') {
			return;
		}
		expect(outcome.fieldErrors.get('name')).toBe(
			'This profile name is unavailable.',
		);
		expect(outcome.rootMessages).toEqual([]);
	});

	test('collects unmappable 422 fields as inline root messages', () => {
		const outcome = resolveProfileSaveFailure({
			error: {
				status: 422,
				responseStatusCode: 422,
				title: 'Validation failed',
				errors: { UnknownField: ['The profile payload is invalid.'] },
			},
			isKnownField: nothingIsKnown,
			fallbackMessage: 'Unable to save this profile.',
		});

		expect(outcome.kind).toBe('field-errors');
		if (outcome.kind !== 'field-errors') {
			return;
		}
		expect(outcome.fieldErrors.size).toBe(0);
		expect(outcome.rootMessages).toEqual(['The profile payload is invalid.']);
	});

	test('uses the problem title as the root message for an empty-errors 422', () => {
		const outcome = resolveProfileSaveFailure({
			error: {
				status: 422,
				responseStatusCode: 422,
				title: 'Validation failed',
				errors: {},
			},
			isKnownField: nothingIsKnown,
			fallbackMessage: 'Unable to save this profile.',
		});

		// #1342 — the pre-fix behavior sent this shape down the toast path
		// (`toValidationFailure` requires non-empty errors), leaving the form
		// silent; the banner is required instead, with the problem's own
		// message per the shared getFailureMessage chain.
		expect(outcome).toEqual({
			kind: 'root-message',
			message: 'Validation failed',
		});
	});

	test('falls back to the caller message for an empty bare 422 problem', () => {
		const outcome = resolveProfileSaveFailure({
			error: { status: 422, responseStatusCode: 422 },
			isKnownField: nothingIsKnown,
			fallbackMessage: 'Unable to save this profile.',
		});

		expect(outcome).toEqual({
			kind: 'root-message',
			message: 'Unable to save this profile.',
		});
	});

	test('prefers the problem detail over the fallback for an empty-errors 422', () => {
		const outcome = resolveProfileSaveFailure({
			error: {
				status: 422,
				responseStatusCode: 422,
				title: 'Validation Failed',
				detail: 'The profile name is reserved.',
				errors: {},
			},
			isKnownField: nothingIsKnown,
			fallbackMessage: 'Unable to save this profile.',
		});

		expect(outcome).toEqual({
			kind: 'root-message',
			message: 'The profile name is reserved.',
		});
	});

	test('does not treat a non-validation problem as form-owned', () => {
		const outcome = resolveProfileSaveFailure({
			error: {
				status: 500,
				responseStatusCode: 500,
				title: 'Internal error',
			},
			isKnownField: nothingIsKnown,
			fallbackMessage: 'Unable to save this profile.',
		});

		expect(outcome).toEqual({ kind: 'not-form-owned' });
	});

	test('does not treat a network failure as form-owned', () => {
		const outcome = resolveProfileSaveFailure({
			error: new TypeError('Failed to fetch'),
			isKnownField: nothingIsKnown,
			fallbackMessage: 'Unable to save this profile.',
		});

		expect(outcome).toEqual({ kind: 'not-form-owned' });
	});

	test('deduplicates repeated root messages across mapped and unmapped keys', () => {
		const outcome = resolveProfileSaveFailure({
			error: {
				status: 422,
				responseStatusCode: 422,
				title: 'Validation failed',
				errors: {
					Name: ['Same text.'],
					UnknownField: ['Same text.'],
				},
			},
			isKnownField: (field) => field === 'name',
			fallbackMessage: 'Unable to save this profile.',
		});

		expect(outcome.kind).toBe('field-errors');
		if (outcome.kind !== 'field-errors') {
			return;
		}
		expect([...outcome.fieldErrors.entries()]).toEqual([
			['name', 'Same text.'],
		]);
		expect(outcome.rootMessages).toEqual(['Same text.']);
	});

	// Compile-time pin of the documented `getFailureMessage` chain used for
	// the empty-errors banner (detail ?? title ?? translationKey ?? fallback).
	test('banner resolution follows the shared getFailureMessage order', () => {
		const failure = toApiFailure({
			status: 422,
			responseStatusCode: 422,
			title: 'Validation Failed',
			detail: 'Request body validation failed',
			errors: {},
		});
		expect(getFailureMessage(failure, { fallback: 'FALLBACK' })).toBe(
			'Request body validation failed',
		);
	});
});
