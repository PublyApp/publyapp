import { IconPhoto } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import logoSvg from '~/assets/gray-ui/logo.svg';

export type AuthBrand = {
	eyebrow: string;
	headline: string;
	subtitle?: string;
};

type AuthLayoutProps = {
	children: ReactNode;
	brand?: AuthBrand;
};

const LogoMark = ({ headingClassName }: { headingClassName: string }) => (
	<div className="flex items-center gap-2">
		<img src={logoSvg} alt="" className="size-7" />
		<span className={`text-base font-semibold ${headingClassName}`}>
			PublyApp
		</span>
	</div>
);

/**
 * Standalone split-brand public auth surface (not the app shell): a fixed
 * dark brand panel on desktop, collapsing to a top hero band on tablet and a
 * plain wordmark row on mobile. Reused by every A1–A6 auth screen.
 */
export const AuthLayout = ({ children, brand }: AuthLayoutProps) => {
	const { t } = useTranslation('common');

	const resolvedBrand: AuthBrand = brand ?? {
		eyebrow: t('auth-brand-eyebrow'),
		headline: t('auth-brand-headline'),
		subtitle: t('auth-brand-subtitle'),
	};

	return (
		<div
			className="flex min-h-svh flex-col lg:flex-row"
			data-testid="auth-layout"
		>
			{/* Mobile-only wordmark row (brand panel takes over from md upward). */}
			<div className="flex items-center gap-2 px-4 pt-6 md:hidden">
				<LogoMark headingClassName="text-foreground" />
			</div>

			<div
				className="publy-auth-brand-panel relative hidden overflow-hidden md:flex md:flex-col md:px-10 md:py-8 lg:w-(--publy-auth-panel-width) lg:shrink-0 lg:justify-between lg:py-10"
				data-testid="auth-layout-brand-panel"
			>
				<LogoMark headingClassName="text-(--publy-auth-panel-heading)" />
				<div className="mt-10">
					<p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-(--publy-primary)">
						{resolvedBrand.eyebrow}
					</p>
					<h2 className="mt-3 text-2xl leading-[1.18] font-semibold tracking-[-0.015em] text-(--publy-auth-panel-heading) lg:text-3xl">
						{resolvedBrand.headline}
					</h2>
					{resolvedBrand.subtitle ? (
						<p className="mt-3 hidden max-w-sm text-sm leading-relaxed text-(--publy-auth-panel-body) lg:block">
							{resolvedBrand.subtitle}
						</p>
					) : null}
				</div>
				<div
					className="publy-auth-shot mt-10 hidden aspect-[1200/760] w-full max-w-md items-center justify-center rounded-[var(--publy-radius-control)] lg:flex"
					aria-hidden="true"
				>
					<div className="flex flex-col items-center gap-1.5 text-(--publy-auth-panel-body)">
						<IconPhoto aria-hidden="true" className="size-6" />
						<span className="text-xs font-medium tracking-wide uppercase">
							{t('product-shot')}
						</span>
						<span className="text-[11px]">{t('product-shot-dimensions')}</span>
					</div>
				</div>
			</div>

			<div className="flex flex-1 flex-col bg-background">
				<div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center px-4 py-10 md:max-w-[420px] md:px-6 lg:max-w-[400px] lg:px-10">
					{children}
				</div>
			</div>
		</div>
	);
};
