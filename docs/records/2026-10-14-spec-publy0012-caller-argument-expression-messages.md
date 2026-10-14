# PUBLY0012: CallerArgumentExpression message text (owner-accepted exception)

Date: 2026-10-14. Amends, without editing, `2026-09-09-spec-explicit-csharp-member-access.md`.

## Context

The spec (lines 29-31) says the PUBLY0012 qualification "must not change overload resolution,
accessibility, runtime behavior, public API shape, or the meaning of a nameof expression."

The Q1 slice (qualifying apps/api production source) found one place where that is not strictly
true. `JsonElementExtensions.GetValueAs*` takes a `[CallerArgumentExpression]` parameter, so the
compiler captures the call-site argument text. Qualifying the argument changes the captured text and
therefore the exception message, for example `"Email is not a string"` becomes
`"this.Email is not a string"`. About 85 call sites are affected.

## Decision (owner, 2026-10-14)

Accepted. Qualification may change the text captured by `[CallerArgumentExpression]` parameters.

- These exceptions map to a generic 500, so the text reaches server logs only.
- No API response, wire contract, or behaviour changes.

## Scope

Later PUBLY0012 slices (specs, `Lib/Testing`, apphost, scripts-cs) inherit the same exception. A test
that asserts on captured-expression text should be updated to the qualified text rather than the
qualification being avoided.
