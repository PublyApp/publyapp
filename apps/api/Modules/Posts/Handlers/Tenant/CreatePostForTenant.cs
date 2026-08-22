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
using PublyApp.Api.Modules.Posts.Entities;
using PublyApp.Api.Modules.Posts.Services;
using PublyApp.Api.Modules.Posts.Validation;

namespace PublyApp.Api.Modules.Posts.Handlers.Tenant;

public record CreatePostBody {
	public required JsonElement Body { get; init; }
	public JsonElement? ProjectId { get; init; }

	public string GetBody() {
		return Body.GetValueAsString();
	}

	public Guid? GetProjectId() {
		return ProjectId.GetValueAsGuidOrNull();
	}
}

public class CreatePostBodyValidator
	: AbstractValidator<CreatePostBody> {
	public CreatePostBodyValidator() {
		RuleFor(x => x.Body)
			.MustBeRequiredStringWithLength(
				"Body", 1, PostValidationRules.BodyMaxLength
			);

		RuleFor(x => x.ProjectId)
			.MustBeNullableNonEmptyGuid("ProjectId");
	}
}

public record PostCreated {
	public required Guid Id { get; init; }
	public required Guid TenantId { get; init; }
	public required Guid? ProjectId { get; init; }
	public required string Status { get; init; }
	public required string Body { get; init; }
	public required Guid CreatedByUserId { get; init; }
	public required DateTime CreatedAt { get; init; }
	public required DateTime UpdatedAt { get; init; }
}

public sealed class CreatePostForTenant {
	public static async Task<Results<
		Created<PostCreated>,
		AppValidationProblemHttpResult
	>> Handle(
		[FromBody] CreatePostBody body,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IPostService postService,
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

		var postBody = body.GetBody();
		var projectId = body.GetProjectId();

		if (projectId.HasValue) {
			var projectExists = await postService
				.ProjectExistsForTenantAsync(
					tenantId, projectId.Value, cancellationToken
				);
			if (!projectExists) {
				return TypedProblems.ValidationProblem(
					"Project does not exist for this tenant",
					ResponseKeys.NotFound,
					new Dictionary<string, string[]> {
						["projectId"] = ["The referenced project does not exist in this tenant."],
					}
				);
			}
		}

		var post = await postService.CreateAsync(
			new CreatePostArgs(
				TenantId: tenantId,
				ProjectId: projectId,
				Body: postBody,
				CreatedByUserId: account.UserId
			),
			cancellationToken
		);

		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.PostCreated,
				TargetId: post.GetRequiredId(),
				Details: new {
					TenantId = tenantId,
					ProjectId = projectId,
					Status = PostWire.FormatStatus(PostStatus.Draft),
				}
			),
			cancellationToken
		);

		return TypedResults.Created(
			(string?)null,
			new PostCreated {
				Id = post.GetRequiredId(),
				TenantId = post.TenantId,
				ProjectId = post.ProjectId,
				Status = PostWire.FormatStatus(PostStatus.Draft),
				Body = post.Body,
				CreatedByUserId = post.CreatedByUserId,
				CreatedAt = post.CreatedAt,
				UpdatedAt = post.UpdatedAt,
			}
		);
	}
}
