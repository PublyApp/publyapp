using System.Runtime.CompilerServices;

using FluentValidation;

using MainApi.Localization;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Lib.ProblemResults;

namespace MainApi.Src.Lib.Filters;

public class ReqQueryValidationFilter<TRequest> : IEndpointFilter where TRequest : class {
	private readonly IValidator<TRequest> _validator;

	public ReqQueryValidationFilter(IValidator<TRequest> validator) {
		_validator = validator;
	}

	public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext httpContext, EndpointFilterDelegate next) {
		// Find the query-bound argument that matches TRequest
		var (found, idx) = httpContext.Arguments
			.Select((arg, i) => (arg, i))
			.FirstOrDefault(x => x.arg is TRequest);

		// No matching query argument → fail validation
		if (found is null) {
			var empty = (TRequest)RuntimeHelpers.GetUninitializedObject(typeof(TRequest));
			var resultDefault = await _validator.ValidateAsync(empty, httpContext.HttpContext.RequestAborted);

			if (!resultDefault.IsValid) {
				return TypedProblems.ValidationProblem(
					"Query parameters validation failed",
					ResponseKeys.QueryParametersValidationFailed,
					resultDefault.ToDictionary()
				);
			}

			return await next(httpContext);
		}

		// Get the query parameters and bind them to the request model
		var request = httpContext.GetArgument<TRequest>(idx);
		var result = await _validator.ValidateAsync(request, httpContext.HttpContext.RequestAborted);

		if (!result.IsValid) {
			return TypedProblems.ValidationProblem(
				"Query parameters validation failed",
				ResponseKeys.QueryParametersValidationFailed,
				result.ToDictionary()
			);
		}

		return await next(httpContext);
	}
}

public static class ReqQueryValidationFilterExtensions {
	public static RouteHandlerBuilder WithReqQueryValidation<TRequest>(this RouteHandlerBuilder builder) where TRequest : class {
		return builder
			.AddEndpointFilter<ReqQueryValidationFilter<TRequest>>()
			.ProducesValidationProblem();
	}
}
