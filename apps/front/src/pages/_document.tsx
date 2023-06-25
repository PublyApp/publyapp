import { Html, Head, Main, NextScript } from 'next/document';

const Document = () => {
	return (
		<Html lang="en">
			<Head />
			<body>
				<Main />
				{/* eslint-disable-next-line @next/next/no-sync-scripts */}
				<script
					src="https://cdnjs.cloudflare.com/ajax/libs/parse/4.1.0/parse.min.js"
					integrity="sha512-2/9fubrdhOAa2Cvi5O+knV3Wn6OQolBy2gehNiLTfDSV0dffegVlQEfEK9kIGdNmJimGuNS0g/3+kyxIKlTy1w=="
					crossOrigin="anonymous"
					referrerPolicy="no-referrer"
				/>
				<NextScript />
			</body>
		</Html>
	);
};

export default Document;
