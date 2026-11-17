import type { ReactNode } from 'react';

import { MarketingCtaBand } from '../components/marketing/marketing-cta-band';
import { MarketingShell } from '../components/marketing/marketing-shell';
import { MarketingSocialProof } from '../components/marketing/marketing-social-proof';

type MarketingLayoutProps = {
	children: ReactNode;
	pathname?: string;
};

/**
 * Chrome for every non-authenticated, non-auth surface — the marketing pages
 * and the root not-found/error branches that share their chrome. Mounted by
 * `__root.tsx`'s `shellComponent`, which is why it, not a route-level layout,
 * owns the shell: `shellComponent` is the only wrapper that also covers the
 * error and not-found branches, where no route staticData exists to hang a
 * layout off.
 */
export const MarketingLayout = ({
	children,
	pathname = '/',
}: MarketingLayoutProps) => {
	return (
		<MarketingShell
			pathname={pathname}
			bands={
				<>
					<MarketingSocialProof />
					<MarketingCtaBand />
				</>
			}
		>
			{children}
		</MarketingShell>
	);
};
