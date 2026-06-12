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
					return true;
				case MemberAccessExpressionSyntax member
					when ContainsSessionTokenVocabulary(member.Name.Identifier.ValueText):
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

	private static bool ContainsSessionTokenVocabulary(string name) {
		return name.IndexOf(SessionTokenVocabulary, StringComparison.OrdinalIgnoreCase) >= 0;
	}
}
