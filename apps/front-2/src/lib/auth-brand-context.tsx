import { createContext, useContext, useEffect } from 'react';
import type { AuthBrand } from '~/layouts/auth-layout';

/**
 * Lets an auth route (e.g. `accept-invitation.tsx`) override the brand panel
 * copy rendered by the single `AuthLayout` instance `__root.tsx` now mounts
 * for every auth-surface route — so a route-specific headline no longer needs
 * its own nested `<AuthLayout>` wrapper (which used to double-wrap the page
 * once the root started rendering `AuthLayout` for every auth path).
 */
const AuthBrandContext = createContext<
	((brand: AuthBrand | undefined) => void) | undefined
>(undefined);

export const AuthBrandProvider = AuthBrandContext.Provider;

/**
 * Sets the shell's auth brand for as long as the calling route is mounted,
 * and clears it on unmount so the next auth route falls back to the default
 * brand copy instead of inheriting a stale one.
 */
export const useSetAuthBrand = (brand: AuthBrand | undefined): void => {
	const setBrand = useContext(AuthBrandContext);

	useEffect(() => {
		setBrand?.(brand);
		return () => setBrand?.(undefined);
	}, [setBrand, brand]);
};
