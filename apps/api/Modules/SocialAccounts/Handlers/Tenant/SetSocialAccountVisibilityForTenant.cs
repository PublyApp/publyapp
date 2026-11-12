using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.SocialAccounts.Services;

namespace PublyApp.Api.Modules.SocialAccounts.Handlers.Tenant;

public record SetSocialAccountVisibilityBody {
	/// <summary>public | unlisted | private.</summary>
	public required JsonElement Visibility { get; init; }

	public string GetVisibility() {
		return this.Visibility.GetValueAsString();
	}
}

public class SetSocialAccountVisibilityBodyValidator
	: AbstractValidator<SetSocialAccountVisibilityBody> {
	private static readonly IReadOnlySet<string> _Allowed =
		new HashSet<string> { "public", "unlisted", "private" };

	public SetSocialAccountVisibilityBodyValidator() {
		this.RuleFor(x => x.Visibility)
			.MustBeRequiredStringWithLength("Visibility", 1, 16)
			.MustBePatchFieldStringInSet("Visibility", SetSocialAccountVisibilityBodyValidator._Allowed);
	}
}

public record SocialAccountVisibilityUpdated {
	public required Guid Id { get; init; }
	public required string DefaultVisibility { get; init; }
}

/// <summary>
/// Sets the default post visibility of a Mastodon or Pixelfed account (#2186): every
/// post published to it from then on is sent with that visibility. Already published
/// posts are never touched.
/// </summary>
public sealed class SetSocialAccountVisibilityForTenant {
	public static async Task<Results<
		Ok<SocialAccountVisibilityUpdated>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult,
		AppValidationProblemHttpResult
	>> Handle(
		[FromRoute] string socialAccountId,
		[FromBody] SetSocialAccountVisibilityBody body,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] SocialAccountService socialAccountService,
		[FromServices] IAuditLogService auditLogService,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(authContext.TenantId, out var tenantId)) {
			throw new InvalidOperationException(
				$"{nameof(authContext.TenantId)} is not a GUID"
			);
		}

		var account = authContext.GetRequiredTenantAccount();

		if (!Guid.TryParse(socialAccountId, out var accountId)) {
			return TypedProblems.BadRequest(
				"Invalid socialAccountId",
				ResponseKeys.MalformedId
			);
		}

		var visibility = SocialAccountWire.ParseVisibility(body.GetVisibility());
		if (visibility is null) {
			// The body validator refuses this first; kept so the handler never trusts it.
			const string invalid = "Visibility must be public, unlisted or private.";
			return TypedProblems.ValidationProblem(
				invalid,
				ResponseKeys.SocialAccountVisibilityUnsupported,
				new Dictionary<string, string[]> { ["visibility"] = [invalid] }
			);
		}

		var result = await socialAccountService.SetDefaultVisibilityForTenantAsync(
			tenantId, accountId, visibility.Value, cancellationToken
		);

		if (result is SetSocialAccountVisibilityResult.NotFound) {
			return TypedProblems.NotFound(
				"Social account not found",
				ResponseKeys.SocialAccountNotFound
			);
		}

		if (result is SetSocialAccountVisibilityResult.Unsupported) {
			const string reason = "Only Mastodon and Pixelfed accounts have a post visibility.";
			return TypedProblems.ValidationProblem(
				reason,
				ResponseKeys.SocialAccountVisibilityUnsupported,
				new Dictionary<string, string[]> { ["visibility"] = [reason] }
			);
		}

		if (result is SetSocialAccountVisibilityResult.Applied applied) {
			var wire = SocialAccountWire.FormatVisibility(applied.Account.DefaultVisibility);
			await auditLogService.LogAsync(
				new CreateAuditLogArgs(
					UserId: account.UserId,
					Action: AuditActions.SocialAccountVisibilitySet,
					TargetId: accountId,
					Details: new { TenantId = tenantId, Visibility = wire }
				),
				cancellationToken
			);

			return TypedResults.Ok(new SocialAccountVisibilityUpdated {
				Id = accountId,
				DefaultVisibility = wire,
			});
		}

		throw new InvalidOperationException("Unhandled result type");
	}
}
