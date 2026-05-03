import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { CtaBand } from '#app/routes/marketing/_components/cta-band.tsx';

// ----------------------------------------------------------------------

export const HomeCta = () => {
	return (
		<CtaBand
			eyebrowLabel="Start Scaling Today"
			title={'Unlock the Power of\nAutomated Social Growth'}
			subhead="Join 10,000+ brands organizing the chaos. We handle the publishing, you handle the community."
			ctaLabel="Start for Free"
			ctaHref={FRONT_PATH_NAMES.auth.signup}
			microcopy="14-day free trial. No credit card required."
		/>
	);
};
