import sharedEn from '@org/shared-ts/lib/i18n/locales/en';

/**
 * The English catalogue lives in `packages/shared-ts` (issue #2250: shared-ts is its single home,
 * and the app loads it at runtime through `@org/shared-ts/lib/i18n/backend`'s per-namespace
 * loaders). This barrel is the app-wide *value and type* surface over that catalogue — tests, the
 * `<Trans>` guard and `Front2Resource` read it — so it publishes exactly what the shared barrel
 * publishes, in the shared barrel's order, and nothing else. `locales.test.ts` asserts the
 * published namespaces are `I18N_NAMESPACES`, in registry order.
 */
export type Front2Resource = typeof sharedEn;
export type LooseResource = ToPrimitive<Front2Resource>;

export default sharedEn;
