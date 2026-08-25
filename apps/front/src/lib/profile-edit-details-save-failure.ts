import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

/**
 * #1342 — one classifier for the save-failure handling shared verbatim by the
 * staff (`profiles/$profileId`) and tenant (`tenants/$tenantId/profiles`)
 * profile-edit drawers. It answers a single question — "does this failure
 * belong to this form?" — and, when it does, hands back plain data instead of
 * react-hook-form calls, so the routing rules stay unit-testable:
 *
 * - A `validation` failure (a 422 problem whose `errors` map carries entries)
 *   is form-owned: mappable keys go to their fields, unmappable keys become
 *   inline root messages next to the mapped ones (pre-existing behavior).
 * - A 422 whose `errors` map is **empty** classifies as a bare `problem` in
 *   `to-api-failure` (`toValidationFailure` requires non-empty errors), yet
 *   the API did reject *this* save with 422 — the form owns it and must show
 *   its root banner (previously it fell through to the toast path and the
 *   drawer went silent).
 * - Anything else (401/403/500/network/abort…) is not form-owned and keeps
 *   flowing to the caller's local-failure toast.
 */
export type ProfileSaveFailureOutcome<Field extends string> =
	| {
			kind: 'field-errors';
			fieldErrors: Map<Field, string>;
			rootMessages: string[];
	  }
	| { kind: 'root-message'; message: string }
	| { kind: 'not-form-owned' };

type ResolveProfileSaveFailureInput<Field extends string> = {
	error: unknown;
	isKnownField: (field: string) => field is Field;
	/** Used for the empty-errors banner when the problem carries no detail/title. */
	fallbackMessage: string;
};

export const resolveProfileSaveFailure = <Field extends string>({
	error,
	isKnownField,
	fallbackMessage,
}: ResolveProfileSaveFailureInput<Field>): ProfileSaveFailureOutcome<Field> => {
	const failure = toApiFailure(error);

	if (failure.kind === 'validation') {
		const fieldErrors = new Map<Field, string>();
		const rootMessages: string[] = [];
		for (const [field, messages] of Object.entries(failure.fieldErrors)) {
			if (isKnownField(field)) {
				fieldErrors.set(field, messages.join(' '));
			} else {
				rootMessages.push(...messages);
			}
		}
		return {
			kind: 'field-errors',
			fieldErrors,
			rootMessages: Array.from(new Set(rootMessages)),
		};
	}

	// A bare 422 problem (`errors` map empty or absent): nothing to map, but
	// the API still rejected this save — surface the problem's own message
	// (or the fallback) in the root banner instead of staying silent (#1342).
	if (failure.kind === 'problem' && failure.status === 422) {
		return {
			kind: 'root-message',
			message: getFailureMessage(failure, { fallback: fallbackMessage }),
		};
	}

	return { kind: 'not-form-owned' };
};
