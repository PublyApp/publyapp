/**
 * The named shape of a value decoded from JSON — or from any other untyped
 * source: an HTTP problem body, a PostHog event payload, a serialized error
 * handed to SSR code.
 *
 * This is the `packages/shared-ts` twin of `packages/scripts-ts/src/json-value.ts`.
 * The two packages cannot import from each other, so the shape is declared
 * once per package on purpose; keep the two definitions structurally
 * identical. It exists so boundary readers can say what they actually accept
 * instead of `unknown`: a function that parses `JsonValue` is honest about its
 * input, while `unknown` would claim it accepts values it never sees (a
 * `Date`, a class instance, a `Map`). It is also what makes the anti-slop
 * `no-unsafe-dictionary-type` rule satisfiable by a real type rather than by a
 * suppression.
 *
 * Reads that may also be absent use `JsonValue | undefined`; there is
 * deliberately no `null` special case — `null` is a JSON value.
 */
export type JsonValue =
	| string
	| number
	| boolean
	| null
	| readonly JsonValue[]
	| JsonObject;

/**
 * A JSON object. Declared with an index signature rather than
 * `Record<string, JsonValue>` so it is a named domain type, not the "unsafe
 * dictionary" shape the lint rule rejects.
 */
export type JsonObject = { [key: string]: JsonValue };
