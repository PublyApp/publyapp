import { useTranslation } from 'react-i18next';
import { cn } from '~/lib/utils';

/**
 * Shared inline spinner glyph for small "loading…" rows next to text (form
 * submit states, inline query-pending rows). Not a full-surface loading
 * state — see `StateSurface`/`AppErrorView` for that.
 */
export const LoadingSpinner = ({ className }: { className?: string }) => {
	const { t } = useTranslation('common');

	return (
		<span
			role="status"
			aria-label={t('loading')}
			className={cn(
				'size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground',
				className,
			)}
		/>
	);
};
