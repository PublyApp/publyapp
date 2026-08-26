// Retired in #1300: this entry point used to pin @tanstack/router-generator
// by exact version and store path. The implementation moved to
// scripts/generate/route-tree-generator.mts, which derives the generator
// through normal module resolution; this shim keeps the documented invocation
// working.
//
// Run: node scripts/generate/generate-route-tree.mts
import { generateRouteTree } from './route-tree-generator.mts';

await generateRouteTree();
console.log('routeTree.gen.ts regenerated');
