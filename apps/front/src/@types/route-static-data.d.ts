/**
 * TanStack Router `staticData` augmentation for the i18n namespace registry.
 *
 * The registry itself lives in `packages/shared-ts` (it describes the catalogue, which is shared),
 * but this augmentation is an app-only type surface: declaring it there would make
 * `@tanstack/react-router` a dependency of a non-React, non-TanStack package that every other
 * consumer inherits. So the data moves and the route-type wiring stays here.
 */
import type { SupportedNamespace } from '@org/shared-ts/lib/i18n/namespaces';

declare module '@tanstack/react-router' {
	interface StaticDataRouteOption {
		i18nNamespaces?: readonly SupportedNamespace[];
		/** The page portals its own section links (with API counts) into the
		 * secondary panel, so the shell must not render the static nav too. */
		pageOwnsSecondaryPanel?: boolean;
	}
}
