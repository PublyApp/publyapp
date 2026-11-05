import {
	IconAlertTriangle,
	IconLock,
	IconServerOff,
	IconWifiOff,
	IconZoomQuestion,
	type Icon as TablerIcon,
} from '@tabler/icons-react';
import { useQueryErrorResetBoundary } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useEffect, useEffectEvent, type ReactNode, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { errorToneFromKind } from '~/components/ui/error-tone';
import type { ErrorTone } from '~/components/ui/error-tone';
import { StateView } from '~/components/ui/state-view';
import type { ErrorKind } from '~/lib/error-kind';
import { classifyError } from '~/lib/error-kind';
import { useOnline } from '~/lib/hooks/use-online';

import { BackHomeButton, RetryButton } from './error-actions';

/**
 * ShopKart OS's per-kind mapping, in one table: pictogram, tone, ARIA role,
 * translated title/sentence, and which action pair belongs on the screen.
 */
type ErrorKindPresentation = {
	icon: ReactNode;
	tone: ErrorTone;
	role: 'alert' | 'status';
	title: string;
	description: string;
	/** `pair` = Réessayer + Retour; `back` = Retour only; `none` = no action. */
	actions: 'pair' | 'back' | 'none';
};

const iconOf = (Icon: TablerIcon) => <Icon aria-hidden="true" />;

const presentationOf = (
	kind: ErrorKind,
	t: (key: string) => string,
): ErrorKindPresentation | undefined => {
	switch (kind) {
		case 'offline':
			return {
				icon: iconOf(IconWifiOff),
				tone: errorToneFromKind(kind),
				role: 'status',
				title: t('offline-title'),
				description: t('offline-description'),
				actions: 'pair',
			};
		case 'not_found':
			return {
				icon: iconOf(IconZoomQuestion),
				tone: errorToneFromKind(kind),
				role: 'alert',
				title: t('page-not-found'),
				description: t('not-found-sentence'),
				actions: 'pair',
			};
		case 'forbidden':
			return {
				icon: iconOf(IconLock),
				tone: errorToneFromKind(kind),
				role: 'alert',
				title: t('no-access-title'),
				description: t('forbidden-description'),
				actions: 'back',
			};
		case 'server':
			return {
				icon: iconOf(IconServerOff),
				tone: errorToneFromKind(kind),
				role: 'alert',
				title: t('error-500-title'),
				description: t('error-500-description'),
				actions: 'pair',
			};
		case 'unknown':
			return {
				icon: iconOf(IconAlertTriangle),
				tone: errorToneFromKind(kind),
				role: 'alert',
				title: t('query-display-error-default'),
				description: t('query-display-error-cause-unknown'),
				actions: 'pair',
			};
		case 'signed_out':
			// Logout is an auth-surface concern; this component never paints it.
			return undefined;
	}
};

type ErrorKindStateProps = {
	scale: 'page' | 'inline';
	/** The real cause; classified with `navigator.onLine`. */
	error?: unknown;
	/** An already-classified kind (used by the 403/404/offline wrappers). */
	kind?: ErrorKind;
	/** Inside a panel: only « Réessayer » (going home is pointless there). */
	panel?: boolean;
	onRetry?: () => void;
	testId?: string;
	/** Page-scale callers keep their entity-specific title when they know it. */
	title?: string;
	description?: string;
	titleRef?: Ref<HTMLHeadingElement>;
};

/**
 * The one classified error/status surface. ShopKart OS's `ErrorCard` switch,
 * shared by full pages (`scale="page"`) and inline panels (`scale="inline"`).
 * Offline retries by itself when the browser reports the network is back.
 */
export const ErrorKindState = ({
	scale,
	error,
	kind: explicitKind,
	panel = false,
	onRetry,
	testId,
	title,
	description,
	titleRef,
}: ErrorKindStateProps) => {
	const { t } = useTranslation('common');
	const router = useRouter({ warn: false });
	const queryReset = useQueryErrorResetBoundary();
	const online = useOnline();
	const kind = explicitKind ?? classifyError(error, online);
	const presentation = presentationOf(kind, t);
	// ShopKart's soft retry: reset the errored queries and re-run the current
	// route instead of reloading the whole document. `useRouter` returns
	// `undefined` outside a `RouterProvider` (plain component renders, tests),
	// and that is the ONLY place a hard reload is still the fallback.
	const retry = () => {
		if (onRetry) {
			onRetry();
			return;
		}
		queryReset.reset();
		if (router) {
			void router.invalidate();
			return;
		}
		window.location.reload();
	};
	const onOnline = useEffectEvent(retry);
	useEffect(() => {
		if (kind !== 'offline') {
			return undefined;
		}
		const listener = () => onOnline();
		window.addEventListener('online', listener);
		return () => window.removeEventListener('online', listener);
	}, [kind]);

	if (!presentation) {
		return null;
	}

	let actions: ReactNode;
	if (panel) {
		actions =
			presentation.actions === 'pair' ? (
				<RetryButton onClick={retry} />
			) : undefined;
	} else if (presentation.actions === 'back') {
		actions = <BackHomeButton variant="default" />;
	} else if (presentation.actions === 'pair') {
		actions = (
			<>
				<RetryButton onClick={retry} />
				<BackHomeButton />
			</>
		);
	}

	return (
		<StateView
			icon={presentation.icon}
			tone={presentation.tone}
			scale={scale}
			role={presentation.role}
			ariaLive={presentation.role === 'alert' ? 'assertive' : 'polite'}
			title={title ?? presentation.title}
			titleRef={titleRef}
			description={description ?? presentation.description}
			actions={actions}
			testId={testId}
		/>
	);
};
