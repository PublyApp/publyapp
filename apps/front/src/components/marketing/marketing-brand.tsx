import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { cn } from '~/lib/utils';

/**
 * Logo tile + wordmark. The tile is a squared 8px plate on `--publy-primary`
 * carrying the brand initial in `--publy-primary-foreground` (never a
 * circle — a fully-rounded radius is reserved for avatars). "PublyApp" is
 * never translated.
 */
export const MarketingBrand = ({
	className,
	size = 'default',
}: {
	className?: string;
	size?: 'default' | 'lg';
}) => {
	const { t } = useTranslation('common');

	return (
		<Link
			to="/"
			aria-label={t('marketing-home')}
			className={cn(
				'inline-flex shrink-0 items-center gap-2 no-underline outline-none focus-visible:ring-3 focus-visible:ring-ring',
				'rounded-[var(--publy-radius-small-control)]',
				className,
			)}
		>
			<span
				aria-hidden="true"
				className={cn(
					'grid place-items-center rounded-[var(--publy-radius-chip)] bg-primary font-semibold text-primary-foreground',
					size === 'lg' ? 'size-[22px] text-[11.5px]' : 'size-6 text-[12.5px]',
				)}
			>
				P
			</span>
			<span className="text-[15.5px] font-semibold tracking-[-0.02em] text-foreground">
				PublyApp
			</span>
		</Link>
	);
};
