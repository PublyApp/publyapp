/// <reference types="nativewind/types" />

// ponytail: NativeWind's tailwind preset ships no types of its own; this is
// the smallest honest declaration for the one import tailwind.config.ts needs.
declare module 'nativewind/preset' {
	const preset: import('tailwindcss').Config;
	export default preset;
}

// Metro handles CSS imports (NativeWind compiles global.css); TypeScript 6
// requires a declaration for the side-effect import in the root layout.
declare module '*.css';
