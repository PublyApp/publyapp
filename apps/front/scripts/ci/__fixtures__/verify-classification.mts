import { classifyProof, readProofReport } from '../classify-proof.mts';

const dir = new URL('./reports/', import.meta.url);

const cases = [
	['ok.json', 1, 'OK'],
	['corrupt.json', 1, 'CORRUPT PROOF'],
	['pass.json', 0, 'UNEXPECTED_PASS'],
	['notests.json', 1, 'NO_TESTS'],
] as const;

for (const [file, exitCode, expected] of cases) {
	const report = readProofReport(new URL(file, dir).pathname);
	const result = classifyProof(report, exitCode);
	const status = result.verdict === expected ? 'PASS' : 'FAIL';
	console.log(`${status}: ${file} → ${result.verdict} (expected ${expected})`);
	if (result.verdict !== expected) {
		process.exit(1);
	}
}
