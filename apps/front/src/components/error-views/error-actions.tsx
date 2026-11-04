import { IconArrowLeft, IconRefresh } from '@tabler/icons-react';
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
 * The shared `Button` rendering as a real anchor: it must work in router-less
 * component tests too, and going home is navigation, not an action.
 */
export const BackHomeButton = ({
	variant = 'outline',
}: {
	variant?: 'outline' | 'default';
}) => {
	const { t } = useTranslation('common');

	return (
		<Button variant={variant} className="h-11 px-4" render={<a href="/" />}>
			<IconArrowLeft data-icon="inline-start" />
			{t('common:go-to-home')}
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
