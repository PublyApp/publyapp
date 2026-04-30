import { type SxProps, styled, type Theme } from '@mui/material/styles';
import Typography, { type TypographyProps } from '@mui/material/Typography';
import {
	m,
	type UseInViewOptions,
	useAnimation,
	useInView,
	type Variants,
} from 'framer-motion';
import { mergeClasses } from 'minimal-shared/utils';
import { nanoid } from 'nanoid';
import { useEffect, useMemo, useRef } from 'react';

import { createClasses } from '#app/lib/mui/theme/create-classes.ts';

import { varContainer, varFade } from './variants';

// ----------------------------------------------------------------------

export const animateTextClasses = {
	root: createClasses('animate__text__root'),
	lines: createClasses('animate__text__lines'),
	line: createClasses('animate__text__line'),
	word: createClasses('animate__text__word'),
	char: createClasses('animate__text__char'),
	space: createClasses('animate__text__space'),
	srOnly: 'sr-only',
};

const srOnlyStyles: SxProps<Theme> = {
	p: 0,
	width: '1px',
	height: '1px',
	margin: '-1px',
	borderWidth: 0,
	overflow: 'hidden',
	position: 'absolute',
	whiteSpace: 'nowrap',
	clip: 'rect(0, 0, 0, 0)',
};

export type AnimateTextProps = TypographyProps & {
	variants?: Variants;
	repeatDelayMs?: number;
	textContent: string | string[];
	once?: UseInViewOptions['once'];
	amount?: UseInViewOptions['amount'];
};

export const AnimateText = ({
	sx,
	variants,
	className,
	textContent,
	once = true,
	amount = 1 / 3,
	component = 'p',
	repeatDelayMs = 100, // 1000 = 1s
	...other
}: AnimateTextProps) => {
	const textRef = useRef(null);

	const animationControls = useAnimation();

	const textArray = useMemo(() => {
		return Array.isArray(textContent) ? textContent : [textContent];
	}, [textContent]);

	const isInView = useInView(textRef, { once, amount });

	useEffect(() => {
		let timeout: NodeJS.Timeout;

		const triggerAnimation = () => {
			if (repeatDelayMs) {
				timeout = setTimeout(async () => {
					await animationControls.start('initial');
					void animationControls.start('animate');
				}, repeatDelayMs);
			} else {
				void animationControls.start('animate');
			}
		};

		if (isInView) {
			triggerAnimation();
		} else {
			void animationControls.start('initial');
		}

		return () => {
			return clearTimeout(timeout);
		};
	}, [animationControls, isInView, repeatDelayMs]);

	return (
		<Typography
			component={component}
			className={mergeClasses([animateTextClasses.root, className])}
			sx={[
				{
					p: 0,
					m: 0,
					/**
					 * Utilities for improving accessibility with screen readers.
					 * https://v1.tailwindcss.com/docs/screen-readers
					 */
					[`& .${animateTextClasses.srOnly}`]: srOnlyStyles,
				},
				...(Array.isArray(sx) ? sx : [sx]),
			]}
			{...other}
		>
			<span className={animateTextClasses.srOnly}>{textArray.join(' ')}</span>

			<AnimatedTextContainer
				ref={textRef}
				initial="initial"
				animate={animationControls}
				exit="exit"
				variants={varContainer()}
				aria-hidden
				className={animateTextClasses.lines}
			>
				{textArray?.map((line, lineIndex) => {
					return (
						<TextLine
							key={`${line}-${nanoid()}`}
							data-index={lineIndex}
							className={animateTextClasses.line}
							sx={{ display: 'block' }}
						>
							{line.split(' ').map((word, wordIndex) => {
								const lastWordInline =
									line.split(' ')[line.split(' ').length - 1];

								return (
									<TextWord
										key={`${word}-${nanoid()}`}
										data-index={wordIndex}
										className={animateTextClasses.word}
										sx={{ display: 'inline-block' }}
									>
										{word.split('').map((char, charIndex) => {
											return (
												<AnimatedTextChar
													key={`${char}-${nanoid()}`}
													variants={variants ?? varFade('in')}
													data-index={charIndex}
													className={animateTextClasses.char}
													sx={{ display: 'inline-block' }}
												>
													{char}
												</AnimatedTextChar>
											);
										})}

										{lastWordInline !== word && (
											<TextWord
												className={animateTextClasses.space}
												sx={{ display: 'inline-block' }}
											>
												&nbsp;
											</TextWord>
										)}
									</TextWord>
								);
							})}
						</TextLine>
					);
				})}
			</AnimatedTextContainer>
		</Typography>
	);
};

// ----------------------------------------------------------------------

const TextLine = styled('span')``;

const TextWord = styled('span')``;

const AnimatedTextContainer = styled(m.span)``;

const AnimatedTextChar = styled(m.span)``;
