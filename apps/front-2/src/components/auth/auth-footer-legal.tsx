import { useTranslation } from 'react-i18next';
import { cn } from '~/lib/utils';

type AuthFooterLegalProps = {
	className?: string;
};

/** "Terms of service · Privacy policy" legal row pinned to the bottom of the auth form column. */
export const AuthFooterLegal = ({ className }: AuthFooterLegalProps) => {
	const { t } = useTranslation('common');

	return (
		<p className={cn('text-xs text-(--publy-foreground-subtle)', className)}>
			<a
				href="/terms"
				className="transition-colors hover:text-muted-foreground"
			>
				{t('terms-of-service')}
			</a>
			{' · '}
			<a
				href="/privacy"
				className="transition-colors hover:text-muted-foreground"
			>
				{t('privacy-policy')}
			</a>
		</p>
	);
};

export default AuthFooterLegal;
