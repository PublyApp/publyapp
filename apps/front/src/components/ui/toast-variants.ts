/**
 * The toast variant class names, owned in one place so the toast contrast
 * guard can tie its measured variant list to the product: `toaster.tsx`
 * spreads this into Sonner's classNames and
 * `e2e/toast-contrast.spec.ts` asserts that its own measured list covers
 * every semantic variant here. Adding a variant here is supposed to fail
 * the guard until it is measured.
 */
export const toastVariantClassNames = {
	success: 'publy-toast-success',
	error: 'publy-toast-error',
	info: 'publy-toast-info',
	warning: 'publy-toast-warning',
	loading: 'publy-toast-loading',
	default: 'publy-toast-default',
} as const;
