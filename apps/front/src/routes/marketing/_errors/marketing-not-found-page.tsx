import { MarketingErrorView } from '#app/routes/marketing/_components/marketing-error-view.tsx';

const MarketingNotFoundPage = () => {
	return (
		<MarketingErrorView
			numeral="404"
			title="This post got deleted by the algorithm"
			subhead="Or maybe the link is broken. Either way — let's get you back on track."
		/>
	);
};

export default MarketingNotFoundPage;
