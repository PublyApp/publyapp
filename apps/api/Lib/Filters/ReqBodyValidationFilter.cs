using FluentValidation;

using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;

namespace PublyApp.Api.Lib.Filters;

public class ReqBodyValidationFilter<TRequest> : IEndpointFilter {
	private readonly IValidator<TRequest> _validator;

	public ReqBodyValidationFilter(IValidator<TRequest> validator) {
		_validator = validator;
	}

	public async ValueTask<object?> InvokeAsync(
		EndpointFilterInvocationContext context,
		EndpointFilterDelegate next
	) {
		// Find the argument that matches TRequest (skip route/query/service args)
		var (found, idx) = context.Arguments
			.Select((arg, i) => (arg, i))
			.FirstOrDefault(x => x.arg is TRequest);

		if (found is null) {
			// No matching body argument -> fail validation
			return TypedProblems.ValidationProblem(
				"Request body is required",
				ResponseKeys.RequestBodyValidationFailed,
				new Dictionary<string, string[]> {
					{ "body", ["Request body is required"] }
				}
			);
		}

		var request = context.GetArgument<TRequest>(idx);
		var result = await _validator.ValidateAsync(
			request,
			context.HttpContext.RequestAborted
		);

		if (!result.IsValid) {
			return TypedProblems.ValidationProblem(
				"Request body validation failed",
				ResponseKeys.RequestBodyValidationFailed,
				result.ToDictionary()
			);
		}

		return await next(context);
	}
}

public static class ReqBodyValidationFilterExtensions {
	public static RouteHandlerBuilder WithReqBodyValidation<TRequest>(this RouteHandlerBuilder builder) {
		return builder
			.AddEndpointFilter<ReqBodyValidationFilter<TRequest>>()
			.ProducesValidationProblem();
	}
}
