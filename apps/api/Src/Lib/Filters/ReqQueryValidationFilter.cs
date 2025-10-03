using FluentValidation;

namespace MainApi.Src.Lib.Filters;

public class ReqQueryValidationFailResult : AppResponseResult {
	public new string Message { get; set; } = "Query parameter validation failed";
	public new string Key { get; set; } = "query-validation-failed";
	public object FieldErrors { get; set; } = new Dictionary<string, string[]>();
}

public class ReqQueryValidationFilter<TRequest> : IEndpointFilter {
	private readonly IValidator<TRequest> _validator;

	public ReqQueryValidationFilter(IValidator<TRequest> validator) {
		_validator = validator;
	}

	public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext httpContext, EndpointFilterDelegate next) {
		// Get the query parameters and bind them to the request model
		var request = httpContext.GetArgument<TRequest>(0);
		var result = await _validator.ValidateAsync(request, httpContext.HttpContext.RequestAborted);

		if (!result.IsValid) {
			return TypedResults.BadRequest(new ReqQueryValidationFailResult {
				FieldErrors = result.ToDictionary()
			});
		}

		return await next(httpContext);
	}
}

public static class ReqQueryValidationFilterExtensions {
	public static RouteHandlerBuilder WithRedQueryValidation<TRequest>(this RouteHandlerBuilder builder) {
		return builder.AddEndpointFilter<ReqQueryValidationFilter<TRequest>>();
	}
}
