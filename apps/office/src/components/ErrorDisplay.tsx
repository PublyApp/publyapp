import _ from 'lodash';

import useTranslate from '@/ui-react/hooks/useTranslate';

type Props = {
	error: unknown;
	title?: string;
};

const ErrorDisplay = ({ error, title }: Props) => {
	const { t } = useTranslate();

	let iError: Error;

	if (_.isError(error)) {
		iError = error;
	} else if (_.isString(error)) {
		iError = new Error(error);
	} else {
		iError = new Error(t('unknown-error'), { cause: error });
	}

	return (
		<div role="alert">
			<h1>{title || 'Something went wrong!!'}</h1>
			<pre
				css={{
					color: 'red',
					maxWidth: '100%',
					background: '#f7f7f7',
					overflowX: 'auto',
					margin: '0 auto',
					borderRadius: '6px',
					padding: '12px',
					marginBottom: '12px',
				}}
			>
				{JSON.stringify(iError, Object.getOwnPropertyNames(error), 2).replaceAll('\\n', '\n\t\t')}
			</pre>
		</div>
	);
};

export default ErrorDisplay;
