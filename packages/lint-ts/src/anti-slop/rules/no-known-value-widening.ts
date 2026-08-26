import { defineRule } from '@oxlint/plugins';
import type { ESTree, Scope, SourceCode, Variable } from '@oxlint/plugins';

import {
	classifyWideningTarget,
	createTypeEnvironment,
	isKnownEvidenceExpression,
	type TypeEnvironment,
	type WideningTarget,
} from '../shared/dictionary-types.ts';

type FunctionExpression = ESTree.ArrowFunctionExpression | ESTree.Function;

function unwrapExpression(expression: ESTree.Expression): ESTree.Expression {
	let current = expression;
	while (
		current.type === 'ParenthesizedExpression' ||
		current.type === 'TSAsExpression' ||
		current.type === 'TSSatisfiesExpression' ||
		current.type === 'TSTypeAssertion' ||
		current.type === 'TSNonNullExpression'
	) {
		current = current.expression;
	}
	return current;
}

function resolveVariable(
	sourceCode: SourceCode,
	identifier: ESTree.IdentifierReference,
): Variable | null {
	let scope: Scope | null = sourceCode.getScope(identifier);
	while (scope !== null) {
		const variable = scope.set.get(identifier.name);
		if (variable !== undefined) return variable;
		scope = scope.upper;
	}
	return null;
}

function variableDeclarator(
	variable: Variable,
): ESTree.VariableDeclarator | null {
	if (variable.defs.length !== 1) return null;
	const [definition] = variable.defs;
	return definition?.type === 'Variable' &&
		definition.node.type === 'VariableDeclarator'
		? definition.node
		: null;
}

function isStableConstVariable(
	variable: Variable,
	declarator: ESTree.VariableDeclarator,
): boolean {
	return (
		declarator.parent.type === 'VariableDeclaration' &&
		declarator.parent.kind === 'const' &&
		variable.references.every(
			(reference) => reference.init || !reference.isWrite(),
		)
	);
}

function hasKnownEvidence(
	sourceCode: SourceCode,
	expression: ESTree.Expression,
	visitedVariables = new Set<Variable>(),
): boolean {
	if (isKnownEvidenceExpression(expression)) return true;
	const unwrapped = unwrapExpression(expression);
	if (unwrapped.type !== 'Identifier') return false;
	const variable = resolveVariable(sourceCode, unwrapped);
	if (variable === null || visitedVariables.has(variable)) return false;
	const declarator = variableDeclarator(variable);
	if (
		declarator === null ||
		declarator.init === null ||
		!isStableConstVariable(variable, declarator)
	) {
		return false;
	}
	visitedVariables.add(variable);
	return hasKnownEvidence(sourceCode, declarator.init, visitedVariables);
}

function annotationTarget(
	annotation: ESTree.TSTypeAnnotation | null | undefined,
	environment: TypeEnvironment,
): WideningTarget | null {
	return annotation === null || annotation === undefined
		? null
		: classifyWideningTarget(annotation.typeAnnotation, environment);
}

function enclosingFunction(node: ESTree.Node): FunctionExpression | null {
	let current: ESTree.Node | null = node.parent;
	while (current !== null && current.type !== 'Program') {
		if (
			current.type === 'ArrowFunctionExpression' ||
			current.type === 'FunctionDeclaration' ||
			current.type === 'FunctionExpression'
		) {
			return current;
		}
		current = current.parent;
	}
	return null;
}

function sourceKeyName(
	sourceCode: SourceCode,
	key: ESTree.PropertyKey,
): string {
	if (key.type === 'Identifier' || key.type === 'PrivateIdentifier')
		return key.name;
	if (key.type === 'Literal') return String(key.value);
	return sourceCode.getText(key);
}

function functionName(
	sourceCode: SourceCode,
	owner: FunctionExpression | null,
): string {
	if (owner === null) return 'anonymous function';
	if (owner.id !== null) return owner.id.name;
	const parent = owner.parent;
	if (parent.type === 'VariableDeclarator' && parent.id.type === 'Identifier')
		return parent.id.name;
	if (parent.type === 'MethodDefinition')
		return sourceKeyName(sourceCode, parent.key);
	return 'anonymous function';
}

function isEmptyObjectExpression(expression: ESTree.Expression): boolean {
	const unwrapped = unwrapExpression(expression);
	return (
		unwrapped.type === 'ObjectExpression' && unwrapped.properties.length === 0
	);
}

function isDictionaryAccumulatorTarget(destination: WideningTarget): boolean {
	return (
		destination.kind === 'open dictionary' ||
		destination.kind === 'generic container'
	);
}

function hasParentAssertion(node: ESTree.Node): boolean {
	return (
		node.parent?.type === 'TSAsExpression' ||
		node.parent?.type === 'TSTypeAssertion'
	);
}

/** Detect sound syntactic cases where a known value is explicitly widened and loses evidence. */
export const noKnownValueWideningRule = defineRule({
	meta: {
		type: 'problem',
		docs: {
			description:
				'Disallow syntactically established values from flowing into explicitly broad or anonymous target types that discard useful evidence.',
		},
		messages: {
			widening:
				'The explicit {{target}} type on {{subject}} discards known type evidence. Keep inference, validate with `satisfies`, or use a named owner contract.',
		},
	},
	createOnce(context) {
		// createOnce visitors stream DURING traversal (not after) and the
		// shared visitor survives across files, so per-file state is rebuilt in
		// the Program handler and reporting that depends on the whole file is
		// deferred to the `after` hook — the native createOnce pattern.
		let environment: TypeEnvironment | null = null;

		// #1448 item 2: an empty literal annotated with an open-dictionary or
		// generic-container type is a legitimate open-container seed only while
		// nothing is ever written into it. Post-hoc property writes turn the
		// binding into an accumulator that launders known values through the
		// declared widened type, so the declaration site must report once the
		// whole file proves the accumulator use.
		const pendingAccumulatorChecks: Array<() => void> = [];
		let accumulatorWriteCounts: Map<Variable, number> = new Map();
		let emptyAccumulatorDeclarations: Set<Variable> = new Set();

		const reportFlow = (
			expression: ESTree.Expression,
			destination: WideningTarget | null,
			subject: string,
		) => {
			if (destination === null) return;
			if (!hasKnownEvidence(context.sourceCode, expression)) return;
			context.report({
				node: expression,
				messageId: 'widening',
				data: { subject, target: destination.kind },
			});
		};

		const targetFromAnnotation = (
			annotation: ESTree.TSTypeAnnotation | null | undefined,
		) =>
			environment === null ? null : annotationTarget(annotation, environment);

		return {
			Program(node) {
				environment = createTypeEnvironment(node);
				pendingAccumulatorChecks.length = 0;
				accumulatorWriteCounts = new Map();
				emptyAccumulatorDeclarations = new Set();
			},
			VariableDeclarator(node) {
				if (node.init === null || node.id.type !== 'Identifier') return;
				const destination = targetFromAnnotation(node.id.typeAnnotation);
				const subject = `binding \`${node.id.name}\``;
				if (destination === null) return;
				if (
					!isDictionaryAccumulatorTarget(destination) ||
					!isEmptyObjectExpression(node.init)
				) {
					reportFlow(node.init, destination, subject);
					return;
				}
				// Empty literal into an open container: a legitimate seed unless
				// the binding receives property writes later in the file
				// (#1448 item 2). The verdict is deferred to `after`.
				// `BindingIdentifier` and `IdentifierReference` share the
				// Identifier shape; scope lookup only reads `name`, and the ESTree
				// variance lives solely in the optional `typeAnnotation`.
				const variable = resolveVariable(
					context.sourceCode,
					node.id as ESTree.IdentifierReference,
				);
				if (variable === null) return;
				emptyAccumulatorDeclarations.add(variable);
				pendingAccumulatorChecks.push(() => {
					if (accumulatorWriteCounts.get(variable) === undefined) return;
					context.report({
						// Closure capture: the early `node.init === null` return is
						// invisible to the checker inside the closure.
						node: node.init ?? node.id,
						messageId: 'widening',
						data: { subject, target: destination.kind },
					});
				});
			},
			PropertyDefinition(node) {
				if (node.value === null) return;
				reportFlow(
					node.value,
					targetFromAnnotation(node.typeAnnotation),
					`property \`${sourceKeyName(context.sourceCode, node.key)}\``,
				);
			},
			AccessorProperty(node) {
				if (node.value === null) return;
				reportFlow(
					node.value,
					targetFromAnnotation(node.typeAnnotation),
					`property \`${sourceKeyName(context.sourceCode, node.key)}\``,
				);
			},
			AssignmentExpression(node) {
				if (node.operator !== '=') return;
				if (node.left.type === 'Identifier') {
					const variable = resolveVariable(context.sourceCode, node.left);
					if (variable === null) return;
					const declarator = variableDeclarator(variable);
					if (declarator === null || declarator.id.type !== 'Identifier')
						return;
					reportFlow(
						node.right,
						targetFromAnnotation(declarator.id.typeAnnotation),
						`binding \`${declarator.id.name}\``,
					);
					return;
				}
				// Accumulator writes `acc.prop = …` / `acc[expr] = …` on a declared
				// empty-object open container (#1448 item 2). Only writes carrying
				// known evidence launder anything through the widened container;
				// storing already-opaque values discards nothing.
				if (node.left.type !== 'MemberExpression') return;
				const object = node.left.object;
				if (object.type !== 'Identifier') return;
				const variable = resolveVariable(context.sourceCode, object);
				if (variable === null || !emptyAccumulatorDeclarations.has(variable))
					return;
				if (!hasKnownEvidence(context.sourceCode, node.right)) return;
				accumulatorWriteCounts.set(
					variable,
					(accumulatorWriteCounts.get(variable) ?? 0) + 1,
				);
			},
			ReturnStatement(node) {
				if (node.argument === null) return;
				const owner = enclosingFunction(node);
				reportFlow(
					node.argument,
					targetFromAnnotation(owner?.returnType),
					`return value of \`${functionName(context.sourceCode, owner)}\``,
				);
			},
			ArrowFunctionExpression(node) {
				if (node.body.type === 'BlockStatement') return;
				reportFlow(
					node.body,
					targetFromAnnotation(node.returnType),
					`return value of \`${functionName(context.sourceCode, node)}\``,
				);
			},
			TSAsExpression(node) {
				if (environment === null || hasParentAssertion(node)) return;
				reportFlow(
					node.expression,
					classifyWideningTarget(node.typeAnnotation, environment),
					'assertion',
				);
			},
			TSTypeAssertion(node) {
				if (environment === null || hasParentAssertion(node)) return;
				reportFlow(
					node.expression,
					classifyWideningTarget(node.typeAnnotation, environment),
					'assertion',
				);
			},
			after() {
				for (const check of pendingAccumulatorChecks) check();
			},
		};
	},
});
