'use client';

export type Props = {
	onClick?: () => void;
	text?: string;
};

export const Button = ({ onClick, text }: Props) => {
	return <button onClick={onClick || (() => alert('boop'))}>{text || 'Boop'}</button>;
};
