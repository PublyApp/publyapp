import { configure } from '@testing-library/react';

// Chantier #827 repro-only setup. Loaded AFTER the shipped vitest.setup.ts
// (see .dump/wt827/repro.vitest.config.ts) so the suite keeps its matchMedia
// polyfill but regains testing-library's DEFAULT 1000ms findBy*/waitFor
// budget — exactly the budget the issue names ("starved past testing-library's
// default findBy* timeout"). This makes the starvation measurable instead of
// hiding behind the W6 partial fix's suite-wide 25000ms headroom.
//
// NOT part of the shipped suite; never committed — used only by
// .dump/wt827/repro-827.sh for the #827 flake reproduction.
configure({ asyncUtilTimeout: 1000 });
