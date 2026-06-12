using System.Collections.Immutable;

using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;

namespace PublyApp.Analyzers;

/// <summary>
/// PUBLY0010 — security regression guard that forbids passing a session-token value to a logger.
/// The match is deliberately CONSERVATIVE (prefer under-matching over false positives): it fires
/// only when (1) the invocation is a logging call (<c>Log*</c>/<c>BeginScope</c> on an
/// <c>*logger*</c>-shaped receiver) AND (2) one of its arguments references the
/// <c>SessionToken</c> identifier/member vocabulary or the literal <c>X-Session-Token</c> header
/// name. It does not fire on generic terms like "token", "Authorization", or "csrf". The diagnostic
/// is reported on the offending argument.
///
/// <para><strong>Exemptions (presence checks and label nodes):</strong></para>
/// <list type="bullet">
///   <item>
///     <description>
///       Anonymous-object property <em>names</em> (the <c>NameEquals</c> LHS of an
///       <c>AnonymousObjectMemberDeclaratorSyntax</c>) are skipped; only the value expression is
///       examined. E.g. <c>new { HasSessionToken = expr }</c> — the name <c>HasSessionToken</c>
///       is a label, not a value, so it is ignored.
///     </description>
///   </item>
///   <item>
///     <description>
///       An occurrence of a session-token identifier or member whose immediately enclosing
///       expression is a <em>null-presence check</em> — <c>M is null</c>, <c>M is not null</c>,
///       <c>M == null</c>, <c>M != null</c>, <c>null == M</c>, <c>null != M</c> — is exempt
///       because the result is a <c>bool</c>, not the token value. The exemption is
///       per-occurrence: a ternary whose condition is exempt but whose whenTrue branch returns the
///       token value will still report a diagnostic for the whenTrue occurrence.
///     </description>
///   </item>
/// </list>
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class SessionTokenLoggingAnalyzer : DiagnosticAnalyzer {
	private const string SessionTokenVocabulary = "sessiontoken";
	private const string SessionTokenHeaderName = "X-Session-Token";

	// Logging method names treated as "interesting". Mirrors the repo's existing name-based style.
	private static readonly ImmutableHashSet<string> LoggingMethodNames =
		ImmutableHashSet.Create(
			StringComparer.Ordinal,
			"Log",
			"LogTrace",
			"LogDebug",
			"LogInformation",
			"LogWarning",
			"LogError",
			"LogCritical",
			"BeginScope");

	public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics {
		get { return ImmutableArray.Create(DiagnosticCatalog.SessionTokenLogging); }
	}

	public override void Initialize(AnalysisContext context) {
		// Skip generated code (e.g. Kiota client, EF migrations) to avoid penalizing code the repo
		// does not hand-author.
		context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
		// Required for analyzers that call thread-safe Roslyn APIs; the SDK enforces this when
		// EnforceExtendedAnalyzerRules is enabled.
		context.EnableConcurrentExecution();
		context.RegisterSyntaxNodeAction(AnalyzeInvocation, SyntaxKind.InvocationExpression);
	}

	private static void AnalyzeInvocation(SyntaxNodeAnalysisContext context) {
		if (context.Node is not InvocationExpressionSyntax invocation) {
			return;
		}

		if (invocation.Expression is not MemberAccessExpressionSyntax memberAccess) {
			return;
		}

		if (!LoggingMethodNames.Contains(memberAccess.Name.Identifier.ValueText)) {
			return;
		}

		if (!IsLoggerShapedReceiver(memberAccess.Expression)) {
			return;
		}

		foreach (var argument in invocation.ArgumentList.Arguments) {
			if (!ArgumentReferencesSessionToken(argument.Expression)) {
				continue;
			}

			var matchedText = argument.Expression.ToString();
			var diagnostic = Diagnostic.Create(
				DiagnosticCatalog.SessionTokenLogging,
				argument.GetLocation(),
				matchedText);

			context.ReportDiagnostic(diagnostic);
		}
	}

	/// <summary>
	/// Conservative receiver check: the logging call's receiver must be identifier/member shaped with
	/// a name containing "logger" (case-insensitive) — e.g. <c>logger</c>, <c>_logger</c>,
	/// <c>this.Logger</c>, <c>_someLogger.Logger</c>. This keeps the rule from firing on unrelated
	/// <c>Log*</c> methods on non-logger receivers.
	/// </summary>
	private static bool IsLoggerShapedReceiver(ExpressionSyntax receiver) {
		var receiverName = receiver switch {
			IdentifierNameSyntax identifier => identifier.Identifier.ValueText,
			MemberAccessExpressionSyntax member => member.Name.Identifier.ValueText,
			_ => null,
		};

		if (receiverName is null) {
			return false;
		}

		return receiverName.IndexOf("logger", StringComparison.OrdinalIgnoreCase) >= 0;
	}

	/// <summary>
	/// Walks an argument expression (including interpolated-string contents and member-access chains)
	/// looking for the session-token vocabulary: an identifier or member name containing
	/// "SessionToken" (case-insensitive), or a string literal equal to the X-Session-Token header
	/// name.
	/// </summary>
	private static bool ArgumentReferencesSessionToken(SyntaxNode node) {
		foreach (var descendant in node.DescendantNodesAndSelf()) {
			switch (descendant) {
				case IdentifierNameSyntax identifier
					when ContainsSessionTokenVocabulary(identifier.Identifier.ValueText):
					// Skip the Name node of a MemberAccessExpression — the member-access case
					// handles the whole chain (e.g. authContext.SessionToken is examined as a
					// MemberAccessExpressionSyntax; we must not double-count the raw name).
					if (identifier.Parent is MemberAccessExpressionSyntax memberParent
						&& memberParent.Name == identifier) {
						break;
					}
					if (IsNameEqualsOrNameColonLabel(identifier)) {
						break;
					}
					if (IsNullPresenceCheckOperand(identifier)) {
						break;
					}
					return true;
				case MemberAccessExpressionSyntax member
					when ContainsSessionTokenVocabulary(member.Name.Identifier.ValueText):
					if (IsNullPresenceCheckOperand(member)) {
						break;
					}
					return true;
				case LiteralExpressionSyntax literal
					when literal.IsKind(SyntaxKind.StringLiteralExpression)
						&& string.Equals(
							literal.Token.ValueText,
							SessionTokenHeaderName,
							StringComparison.OrdinalIgnoreCase):
					return true;
				default:
					break;
			}
		}

		return false;
	}

	/// <summary>
	/// Returns <see langword="true"/> when the node is the name label of an anonymous-object member
	/// declarator (<c>new { HasSessionToken = expr }</c>) or a named-argument label
	/// (<c>foo(sessionToken: expr)</c>). These are syntactic labels, not value expressions.
	/// </summary>
	private static bool IsNameEqualsOrNameColonLabel(SyntaxNode node) {
		return node.Parent is NameEqualsSyntax or NameColonSyntax;
	}

	/// <summary>
	/// Returns <see langword="true"/> when <paramref name="node"/> (an identifier or member-access
	/// expression carrying session-token vocabulary) is used solely as the operand of a
	/// null-presence check, meaning the result flowing to the logger is a <see langword="bool"/>,
	/// not the token value. Recognises all six forms:
	/// <list type="bullet">
	///   <item><description><c>M is null</c> / <c>M is not null</c></description></item>
	///   <item><description><c>M == null</c> / <c>M != null</c></description></item>
	///   <item><description><c>null == M</c> / <c>null != M</c></description></item>
	/// </list>
	/// </summary>
	private static bool IsNullPresenceCheckOperand(ExpressionSyntax node) {
		var parent = node.Parent;

		// Pattern: M is [not] null
		if (parent is IsPatternExpressionSyntax isPattern && isPattern.Expression == node) {
			return IsNullPattern(isPattern.Pattern);
		}

		// Pattern: M == null / M != null
		if (parent is BinaryExpressionSyntax binary) {
			if (!binary.IsKind(SyntaxKind.EqualsExpression)
				&& !binary.IsKind(SyntaxKind.NotEqualsExpression)) {
				return false;
			}

			// M op null
			if (binary.Left == node && IsNullLiteral(binary.Right)) {
				return true;
			}
			// null op M
			if (binary.Right == node && IsNullLiteral(binary.Left)) {
				return true;
			}
		}

		return false;
	}

	/// <summary>
	/// Returns <see langword="true"/> for a pattern that matches only <see langword="null"/>:
	/// <c>null</c> (ConstantPattern) or <c>not null</c> (UnaryPattern wrapping a ConstantPattern null).
	/// </summary>
	private static bool IsNullPattern(PatternSyntax pattern) {
		if (pattern is ConstantPatternSyntax constant) {
			return constant.Expression.IsKind(SyntaxKind.NullLiteralExpression);
		}

		if (pattern is UnaryPatternSyntax unary
			&& unary.IsKind(SyntaxKind.NotPattern)
			&& unary.Pattern is ConstantPatternSyntax innerConstant) {
			return innerConstant.Expression.IsKind(SyntaxKind.NullLiteralExpression);
		}

		return false;
	}

	private static bool IsNullLiteral(ExpressionSyntax expression) {
		return expression.IsKind(SyntaxKind.NullLiteralExpression);
	}

	private static bool ContainsSessionTokenVocabulary(string name) {
		return name.IndexOf(SessionTokenVocabulary, StringComparison.OrdinalIgnoreCase) >= 0;
	}
}
