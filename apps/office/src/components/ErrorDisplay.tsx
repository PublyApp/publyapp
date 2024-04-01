type Props = {
	error: Error;
	title?: string;
};

const ErrorDisplay = ({ error, title }: Props) => {
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
				{JSON.stringify(error, Object.getOwnPropertyNames(error), 2).replaceAll('\\n', '\n\t\t')}
			</pre>
		</div>
	);
};

export default ErrorDisplay;
