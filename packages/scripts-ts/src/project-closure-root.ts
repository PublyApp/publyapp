import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const playbookRoot = '/home/radan/ai-orchestration-playbook';

export const findProjectClosureRoot = (): string | undefined => {
	const candidates: string[] = [];
	const configuredRoot = process.env.PR_CLOSURE_GATE_ROOT?.trim();

	if (configuredRoot !== undefined && configuredRoot.length > 0) {
		candidates.push(configuredRoot);
	}

	const worktreesRoot = join(playbookRoot, '.worktrees');
	if (existsSync(worktreesRoot)) {
		for (const worktree of readdirSync(worktreesRoot, {
			withFileTypes: true,
		})) {
			if (worktree.isDirectory()) {
				candidates.push(join(worktreesRoot, worktree.name));
			}
		}
	}

	candidates.push(playbookRoot);
	return candidates.find((candidate) =>
		existsSync(join(candidate, 'tools', 'pr-closure')),
	);
};
