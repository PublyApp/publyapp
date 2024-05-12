import { memo } from 'react';

import { Box, Link, type BoxProps } from '@mui/material';

import RouterLink from './RouterLink';

// ----------------------------------------------------------------------

interface LogoProps extends BoxProps {
	// single?: boolean;
}

const Logo = ({ /* single = false, */ sx }: LogoProps) => {
	// const theme = useTheme();

	// const PRIMARY_MAIN = theme.palette.primary.main;

	// const singleLogo = (
	// 	<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" fill="none" viewBox="0 0 512 512">
	// 		<ellipse cx="405.143" cy="338.571" fill={PRIMARY_MAIN} rx="82.857" ry="82.857" />
	// 		<path
	// 			fill="currentColor"
	// 			d="M114.742 355.332H256v66.097H24v-61.376l140.323-203.956H24V90h232v61.376L114.742 355.332z"
	// 		/>
	// 	</svg>
	// );

	// const fullLogo = (
	// 	<svg xmlns="http://www.w3.org/2000/svg " width="100%" height="100%" fill="none" viewBox="0 0 1080 288">
	// 		<ellipse cx="996" cy="204" fill={PRIMARY_MAIN} rx="60" ry="60" />
	// 		<path
	// 			fill="currentColor"
	// 			d="M712 264h-58.815l-98.37-148.034V264H496V24h58.815l98.37 148.718V24H712v240zM801.265 70.838v48.547H880v45.128h-78.735v52.649H888V264H744V24h144v46.838h-86.735zM344.333 264c-22 0-42.222-5.118-60.666-15.355-18.223-10.236-32.778-24.478-43.667-42.726-10.667-18.47-16-39.165-16-62.086s5.333-43.505 16-61.752c10.889-18.248 25.444-32.49 43.667-42.726C302.111 29.118 322.333 24 344.333 24s42.111 5.118 60.334 15.355C423.111 49.59 437.556 63.833 448 82.08c10.667 18.247 16 38.831 16 61.752s-5.333 43.616-16 62.086c-10.667 18.248-25.111 32.49-43.333 42.726C386.444 258.882 366.333 264 344.333 264zm0-52.072c18.667 0 33.556-6.231 44.667-18.693 11.333-12.462 17-28.929 17-49.402 0-20.695-5.667-37.163-17-49.402-11.111-12.462-26-18.692-44.667-18.692-18.889 0-34 6.12-45.333 18.358-11.111 12.24-16.667 28.818-16.667 49.736 0 20.696 5.556 37.274 16.667 49.736 11.333 12.239 26.444 18.359 45.333 18.359zM89.71 216.137H192V264H24v-44.444L125.613 71.863H24V24h168v44.444L89.71 216.137z"
	// 		/>
	// 	</svg>
	// );

	const emojiLogo = (
		<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
			<path
				d="M15.999 29.998c9.334 0 13.999-6.268 13.999-14 0-7.73-4.665-13.998-14-13.998C6.665 2 2 8.268 2 15.999c0 7.731 4.664 13.999 13.999 13.999Z"
				fill="url(#a)"
			/>
			<path
				d="M15.999 29.998c9.334 0 13.999-6.268 13.999-14 0-7.73-4.665-13.998-14-13.998C6.665 2 2 8.268 2 15.999c0 7.731 4.664 13.999 13.999 13.999Z"
				fill="url(#b)"
			/>
			<path
				d="M15.999 29.998c9.334 0 13.999-6.268 13.999-14 0-7.73-4.665-13.998-14-13.998C6.665 2 2 8.268 2 15.999c0 7.731 4.664 13.999 13.999 13.999Z"
				fill="url(#c)"
			/>
			<path
				d="M15.999 29.998c9.334 0 13.999-6.268 13.999-14 0-7.73-4.665-13.998-14-13.998C6.665 2 2 8.268 2 15.999c0 7.731 4.664 13.999 13.999 13.999Z"
				fill="url(#d)"
				fillOpacity=".6"
			/>
			<path
				d="M15.999 29.998c9.334 0 13.999-6.268 13.999-14 0-7.73-4.665-13.998-14-13.998C6.665 2 2 8.268 2 15.999c0 7.731 4.664 13.999 13.999 13.999Z"
				fill="url(#e)"
			/>
			<path
				d="M15.999 29.998c9.334 0 13.999-6.268 13.999-14 0-7.73-4.665-13.998-14-13.998C6.665 2 2 8.268 2 15.999c0 7.731 4.664 13.999 13.999 13.999Z"
				fill="url(#f)"
			/>
			<path
				d="M15.999 29.998c9.334 0 13.999-6.268 13.999-14 0-7.73-4.665-13.998-14-13.998C6.665 2 2 8.268 2 15.999c0 7.731 4.664 13.999 13.999 13.999Z"
				fill="url(#g)"
			/>
			<path
				d="M15.999 29.998c9.334 0 13.999-6.268 13.999-14 0-7.73-4.665-13.998-14-13.998C6.665 2 2 8.268 2 15.999c0 7.731 4.664 13.999 13.999 13.999Z"
				fill="url(#h)"
			/>
			<path
				d="M10 21.5v-3.06A1.44 1.44 0 0 0 8.56 17c-.84 0-1.505.718-1.517 1.559C7.023 19.92 6.835 21.722 6 22c-3 1-4 5.5-1.5 7.5 2 1.6 4 1.5 5.5 1.5h2.764a1.236 1.236 0 0 0 .553-2.342L13 28.5h.72a1 1 0 0 0 .97-.758l.067-.272A.78.78 0 0 0 14 26.5l.33-.165a1.214 1.214 0 0 0 0-2.17L14 24h1.75a1.25 1.25 0 1 0 0-2.5H10Z"
				fill="url(#i)"
			/>
			<path
				d="M13 19s1.124-1.303 3.25-1c2.126.303 2.75 2 2.75 2"
				stroke="#402A32"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<circle cx="9.017" cy="13.421" r="4.673" fill="url(#j)" />
			<circle cx="19.244" cy="13.943" r="4.244" fill="url(#k)" />
			<path
				d="M10.42 16.224a4.206 4.206 0 1 0 0-8.411 4.206 4.206 0 0 0 0 8.411ZM21.568 16.301a4.244 4.244 0 1 0 0-8.489 4.244 4.244 0 0 0 0 8.49Z"
				fill="#fff"
			/>
			<path
				fillRule="evenodd"
				clipRule="evenodd"
				d="M13 11.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm11 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
				fill="url(#l)"
			/>
			<g filter="url(#m)">
				<path
					fillRule="evenodd"
					clipRule="evenodd"
					d="m12.703 28.688.055-.218A.78.78 0 0 0 12 27.5l.33-.165a1.214 1.214 0 0 0 0-2.17L12 25h1.75a1.25 1.25 0 0 0 0-2.5H8v-3.06A1.44 1.44 0 0 0 6.56 18c-.84 0-1.505.718-1.517 1.559-.015 1.058-.132 2.381-.575 3.05 1.537 3.041 4.282 5.287 8.235 6.08Z"
					fill="#E4694E"
				/>
			</g>
			<path
				d="M10 21.5v-3.06A1.44 1.44 0 0 0 8.56 17c-.84 0-1.505.718-1.517 1.559C7.023 19.92 6.835 21.722 6 22c-3 1-4 5.5-1.5 7.5 2 1.6 4 1.5 5.5 1.5h2.764a1.236 1.236 0 0 0 .553-2.342L13 28.5h.72a1 1 0 0 0 .97-.758l.067-.272A.78.78 0 0 0 14 26.5l.33-.165a1.214 1.214 0 0 0 0-2.17L14 24h1.75a1.25 1.25 0 1 0 0-2.5H10Z"
				fill="url(#n)"
			/>
			<path
				d="M10 21.5v-3.06A1.44 1.44 0 0 0 8.56 17c-.84 0-1.505.718-1.517 1.559C7.023 19.92 6.835 21.722 6 22c-3 1-4 5.5-1.5 7.5 2 1.6 4 1.5 5.5 1.5h2.764a1.236 1.236 0 0 0 .553-2.342L13 28.5h.72a1 1 0 0 0 .97-.758l.067-.272A.78.78 0 0 0 14 26.5l.33-.165a1.214 1.214 0 0 0 0-2.17L14 24h1.75a1.25 1.25 0 1 0 0-2.5H10Z"
				fill="url(#o)"
			/>
			<path
				d="M12.5 4.5c-.333-.333-1.3-1-2.5-1s-2.167.667-2.5 1M18.5 8.5s1-1 3-1 3 1 3 1"
				stroke="#402A32"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<g opacity=".8" filter="url(#p)">
				<path fill="#FFA048" d="M10 23h7v1h-7z" />
			</g>
			<path d="M11 24h3a1 1 0 0 1 1 1l-4-1Z" fill="url(#q)" />
			<path d="M11 28.5h2a1 1 0 0 1 1 1l-3-1Z" fill="url(#r)" />
			<path d="M11 26.5h3a1 1 0 0 1 1 1l-4-1Z" fill="url(#s)" />
			<defs>
				<radialGradient
					id="a"
					cx="0"
					cy="0"
					r="1"
					gradientUnits="userSpaceOnUse"
					gradientTransform="rotate(132.839 10.786 10.065) scale(37.5033)"
				>
					<stop stopColor="#FFF478" />
					<stop offset=".475" stopColor="#FFB02E" />
					<stop offset="1" stopColor="#F70A8D" />
				</radialGradient>
				<radialGradient
					id="b"
					cx="0"
					cy="0"
					r="1"
					gradientUnits="userSpaceOnUse"
					gradientTransform="rotate(131.878 10.74 10.193) scale(38.9487)"
				>
					<stop stopColor="#FFF478" />
					<stop offset=".475" stopColor="#FFB02E" />
					<stop offset="1" stopColor="#F70A8D" />
				</radialGradient>
				<radialGradient
					id="c"
					cx="0"
					cy="0"
					r="1"
					gradientUnits="userSpaceOnUse"
					gradientTransform="rotate(101.31 2.876 12.808) scale(17.8466 22.8581)"
				>
					<stop offset=".788" stopColor="#F59639" stopOpacity="0" />
					<stop offset=".973" stopColor="#FF7DCE" />
				</radialGradient>
				<radialGradient
					id="d"
					cx="0"
					cy="0"
					r="1"
					gradientUnits="userSpaceOnUse"
					gradientTransform="matrix(-29 29 -29 -29 18 14)"
				>
					<stop offset=".315" stopOpacity="0" />
					<stop offset="1" />
				</radialGradient>
				<radialGradient
					id="e"
					cx="0"
					cy="0"
					r="1"
					gradientUnits="userSpaceOnUse"
					gradientTransform="rotate(77.692 -2.555 18.434) scale(28.1469)"
				>
					<stop offset=".508" stopColor="#7D6133" stopOpacity="0" />
					<stop offset="1" stopColor="#715B32" />
				</radialGradient>
				<radialGradient
					id="f"
					cx="0"
					cy="0"
					r="1"
					gradientUnits="userSpaceOnUse"
					gradientTransform="rotate(55.713 -7.36 23.86) scale(13.3135 9.65032)"
				>
					<stop stopColor="#FFB849" />
					<stop offset="1" stopColor="#FFB847" stopOpacity="0" />
				</radialGradient>
				<radialGradient
					id="g"
					cx="0"
					cy="0"
					r="1"
					gradientUnits="userSpaceOnUse"
					gradientTransform="matrix(11.49998 2 -2 11.49998 20.5 18)"
				>
					<stop stopColor="#FFA64B" />
					<stop offset=".9" stopColor="#FFAE46" stopOpacity="0" />
				</radialGradient>
				<radialGradient
					id="h"
					cx="0"
					cy="0"
					r="1"
					gradientUnits="userSpaceOnUse"
					gradientTransform="rotate(43.971 -9.827 29.173) scale(59.0529)"
				>
					<stop offset=".185" stopOpacity="0" />
					<stop offset="1" stopOpacity=".4" />
				</radialGradient>
				<radialGradient
					id="i"
					cx="0"
					cy="0"
					r="1"
					gradientUnits="userSpaceOnUse"
					gradientTransform="matrix(-16.50002 -.50009 .46634 -15.38663 15.5 22)"
				>
					<stop offset=".066" stopColor="#FFEA67" />
					<stop offset=".593" stopColor="#FFC13F" />
					<stop offset=".904" stopColor="#DF9030" />
				</radialGradient>
				<radialGradient
					id="j"
					cx="0"
					cy="0"
					r="1"
					gradientUnits="userSpaceOnUse"
					gradientTransform="matrix(-7.21433 7.21433 -3.73388 -3.73388 12.652 9.786)"
				>
					<stop stopColor="#392108" />
					<stop offset="1" stopColor="#C87928" stopOpacity="0" />
				</radialGradient>
				<radialGradient
					id="k"
					cx="0"
					cy="0"
					r="1"
					gradientUnits="userSpaceOnUse"
					gradientTransform="rotate(133.664 8.996 10.145) scale(9.48022 5.35173)"
				>
					<stop stopColor="#392108" />
					<stop offset="1" stopColor="#C87928" stopOpacity="0" />
				</radialGradient>
				<radialGradient
					id="n"
					cx="0"
					cy="0"
					r="1"
					gradientUnits="userSpaceOnUse"
					gradientTransform="matrix(-16.50002 -.50009 .46634 -15.38663 15.5 22)"
				>
					<stop offset=".066" stopColor="#FFEA67" />
					<stop offset=".593" stopColor="#FFC13F" />
					<stop offset=".904" stopColor="#DF9030" />
				</radialGradient>
				<radialGradient
					id="o"
					cx="0"
					cy="0"
					r="1"
					gradientUnits="userSpaceOnUse"
					gradientTransform="matrix(-11 1.49997 -1.53804 -11.27922 10.5 22.5)"
				>
					<stop offset=".5" stopColor="#FFEA67" stopOpacity="0" />
					<stop offset=".851" stopColor="#F9708E" />
				</radialGradient>
				<linearGradient id="l" x1="16.5" y1="7" x2="15.5" y2="14" gradientUnits="userSpaceOnUse">
					<stop stopColor="#553B3E" />
					<stop offset="1" stopColor="#3D2432" />
				</linearGradient>
				<linearGradient id="q" x1="12.5" y1="24" x2="14" y2="25.5" gradientUnits="userSpaceOnUse">
					<stop stopColor="#FA9428" />
					<stop offset="1" stopColor="#FA9428" stopOpacity="0" />
				</linearGradient>
				<linearGradient id="r" x1="11.5" y1="28.5" x2="13" y2="30" gradientUnits="userSpaceOnUse">
					<stop stopColor="#FA9428" />
					<stop offset="1" stopColor="#FA9428" stopOpacity="0" />
				</linearGradient>
				<linearGradient id="s" x1="11.5" y1="26.5" x2="13" y2="28" gradientUnits="userSpaceOnUse">
					<stop stopColor="#FA9428" />
					<stop offset="1" stopColor="#FA9428" stopOpacity="0" />
				</linearGradient>
				<filter
					id="m"
					x="2.468"
					y="16"
					width="14.533"
					height="14.688"
					filterUnits="userSpaceOnUse"
					colorInterpolationFilters="sRGB"
				>
					<feFlood floodOpacity="0" result="BackgroundImageFix" />
					<feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
					<feGaussianBlur stdDeviation="1" result="effect1_foregroundBlur_31_62" />
				</filter>
				<filter
					id="p"
					x="8.5"
					y="21.5"
					width="10"
					height="4"
					filterUnits="userSpaceOnUse"
					colorInterpolationFilters="sRGB"
				>
					<feFlood floodOpacity="0" result="BackgroundImageFix" />
					<feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
					<feGaussianBlur stdDeviation=".75" result="effect1_foregroundBlur_31_62" />
				</filter>
			</defs>
		</svg>
	);

	return (
		<Link component={RouterLink} href="/" color="inherit" aria-label="go to homepage" sx={{ lineHeight: 0 }}>
			<Box
				sx={{
					// width: single ? 64 : 75,
					width: 32,
					lineHeight: 0,
					cursor: 'pointer',
					display: 'inline-flex',
					...sx,
				}}
			>
				{emojiLogo}
				{/* {single ? singleLogo : fullLogo} */}
			</Box>
		</Link>
	);
};

export default memo(Logo);
