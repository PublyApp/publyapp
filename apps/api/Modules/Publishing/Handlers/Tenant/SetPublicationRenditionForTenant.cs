using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Publishing.Lib;
using PublyApp.Api.Modules.Publishing.Services;

namespace PublyApp.Api.Modules.Publishing.Handlers.Tenant;

/// <summary>
/// Replaces ALL of a destination's overrides (PUT semantics): <c>segments</c>
/// <c>[{position, text}]</c> (0-based, texts only: the segment count never changes),
/// <c>media</c> <c>{assetIds?, altTexts?: [{assetId, altText}]}</c> and
/// <c>settings</c> <c>{visibility?}</c>. An empty body resets to the shared post.
/// </summary>
public record SetPublicationRenditionBody {
	public JsonElement Segments { get; init; }
	public JsonElement Media { get; init; }
	public JsonElement Settings { get; init; }

	public RenditionOverrides GetOverrides() {
		if (!RenditionWire.TryParseOverrides(
				this.Segments, this.Media, this.Settings, out var overrides, out var error)) {
			throw new InvalidOperationException(error);
		}

		return overrides;
	}
}

public sealed class SetPublicationRenditionBodyValidator
	: AbstractValidator<SetPublicationRenditionBody> {
	public SetPublicationRenditionBodyValidator() {
		this.RuleFor(x => x.Segments)
			.Custom((segments, context) => {
				var body = context.InstanceToValidate;
				if (!RenditionWire.TryParseOverrides(
						segments, body.Media, body.Settings, out _, out var error)) {
					context.AddFailure(error);
				}
			});
	}
}

/// <summary>
/// Sets a publication's overrides (#2172). 404 absent/foreign; 409 when published, parked
/// for review or being published right now; 422 naming the destination (and the segment)
/// when an override is unusable or breaks the destination's limits.
/// </summary>
public sealed class SetPublicationRenditionForTenant {
	public static async Task<Results<
		Ok<RenditionResponse>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult,
		AppConflictHttpResult,
		AppValidationProblemHttpResult
	>> Handle(
		[FromRoute] string publicationId,
		[FromBody] SetPublicationRenditionBody body,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IRenditionService renditionService,
		[FromServices] IAuditLogService auditLogService,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(authContext.TenantId, out var tenantId)) {
			throw new InvalidOperationException(
				$"{nameof(authContext.TenantId)} is not a GUID"
			);
		}

		var account = authContext.AccountTenant;
		if (account is null) {
			throw new InvalidOperationException(
				"Tenant account not found in auth context. "
				+ "Ensure the endpoint has "
				+ ".WithTenantPermission(...) middleware."
			);
		}

		if (!Guid.TryParse(publicationId, out var publicationIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid publicationId",
				ResponseKeys.MalformedId
			);
		}

		var result = await renditionService.SetAsync(
			new SetRenditionArgs(tenantId, publicationIdGuid, body.GetOverrides()),
			cancellationToken
		);
		if (result is RenditionResult.NotFound) {
			return TypedProblems.NotFound("Publication not found", ResponseKeys.NotFound);
		}

		if (result is RenditionResult.Locked locked) {
			return TypedProblems.Conflict(locked.Cause, ResponseKeys.PublicationRenditionLocked);
		}

		if (result is RenditionResult.InProgress) {
			return TypedProblems.Conflict(
				"This publication is being published right now. Wait for it to finish, "
					+ "then customize it.",
				ResponseKeys.PublicationScheduleInProgress
			);
		}

		if (result is RenditionResult.SegmentsLocked) {
			return SetPublicationRenditionForTenant.SegmentsLockedProblem();
		}

		if (result is RenditionResult.OverridesInvalid overridesInvalid) {
			return PublishContentProblems.ToProblem(overridesInvalid.Failure);
		}

		if (result is RenditionResult.ContentInvalid contentInvalid) {
			return PublishContentProblems.ToProblem(contentInvalid.Failure);
		}

		if (result is not RenditionResult.Found found) {
			throw new InvalidOperationException("Unexpected rendition result kind");
		}

		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.RenditionUpdated,
				TargetId: publicationIdGuid,
				Details: new {
					TenantId = tenantId,
					PublicationId = publicationIdGuid,
					Customized = !found.View.Overrides.IsEmpty,
				}
			),
			cancellationToken
		);

		return TypedResults.Ok(RenditionResponseMapper.ToResponse(found.View));
	}

	public static AppValidationProblemHttpResult SegmentsLockedProblem() {
		return TypedProblems.ValidationProblem(
			"Segments that are already published cannot be changed.",
			ResponseKeys.PostSegmentsLocked,
			new Dictionary<string, string[]> {
				["overrides"] = ["Segments this destination already published cannot be changed."],
			}
		);
	}
}
