import { IconArrowLeft, IconRefresh } from '@tabler/icons-react';
import { useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';

/**
 * ShopKart OS's pair for a full-page error: the primary « Réessayer » with the
 * refresh icon, then the outline « Retour à l'accueil » with the left arrow.
 * 44 px targets; the caller's column stacks them under `sm` (ShopKart's
 * `ErrorState` action container).
 */
export const RetryButton = ({ onClick }: { onClick: () => void }) => {
	const { t } = useTranslation('common');

	return (
		<Button className="h-11 px-4" onClick={onClick} type="button">
			<IconRefresh data-icon="inline-start" />
			{t('common:retry')}
		</Button>
	);
};

/**
 * The shared `Button` rendering as a real anchor whose click the router owns:
 * going home is navigation, not an action, and it must stay client-side (a
 * bare navigation would reload the document and drop the SPA, #713).
 * `useRouter({ warn: false })` is `undefined` outside a `RouterProvider`, so
 * plain component renders keep the browser's own navigation.
 */
export const BackHomeButton = ({
	variant = 'outline',
}: {
	variant?: 'outline' | 'default';
}) => {
	const { t } = useTranslation('common');
	const router = useRouter({ warn: false });
	const label = t('common:go-to-home');

	return (
		<Button
			variant={variant}
			className="h-11 px-4"
			// The accessible name is on the link itself so the static
			// anchor-has-content check sees a named link; the visible icon and
			// text are Base UI's merged children.
			render={
				<a
					href="/"
					aria-label={label}
					onClick={(event) => {
						if (!router) {
							return;
						}
						event.preventDefault();
						void router.navigate({ to: '/' });
					}}
				/>
			}
		>
			<IconArrowLeft data-icon="inline-start" />
			{label}
		</Button>
	);
};

/**
 * The canonical pair (owner decision 04/11). `backOnly` is the one tone rule
 * kept from ShopKart's forbidden view: retrying cannot help a 403, so the
 * home button is the primary and there is no retry.
 *
 * Without a `retry` handler, « Réessayer » reloads the page — the same
 * user-visible outcome as ShopKart's `router.invalidate()` on a not-found.
 */
export const ErrorActions = ({
	retry,
	backOnly = false,
}: {
	retry?: () => void;
	backOnly?: boolean;
}) => {
	if (backOnly) {
		return <BackHomeButton variant="default" />;
	}

	return (
		<>
			<RetryButton onClick={retry ?? (() => window.location.reload())} />
			<BackHomeButton />
		</>
	);
};
