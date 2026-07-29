import type { TFunction } from 'i18next';

declare const t: TFunction;

t(($) => $.hello);

// @ts-expect-error -- selector mode must reject keys absent from the resource.
t(($) => $.selectorModeMustRejectThisMissingKey);
