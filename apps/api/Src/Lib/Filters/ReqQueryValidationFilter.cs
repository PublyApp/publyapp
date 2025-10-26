using FluentValidation;
using MainApi.Localization;

namespace MainApi.Src.Lib.Filters;

public record ReqQueryValidationFailedResponse : ApiResponse {
	public IDictionary<string, string[]> FieldErrors { get; set; } = new Dictionary<string, string[]>();

	public static ReqQueryValidationFailedResponse Create(
			string message,
			TranslationKey key,
			IDictionary<string, string[]> fieldErrors
		) {
		return new ReqQueryValidationFailedResponse {
			Message = message,
			Key = key,
			FieldErrors = fieldErrors
		};
	}
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
			var response = ReqQueryValidationFailedResponse.Create(
					"Query parameters validation failed",
					ResponseKeys.QueryParametersValidationFailed,
					result.ToDictionary()
				);
			return TypedResults.BadRequest(response);
		}

		return await next(httpContext);
	}
}

public static class ReqQueryValidationFilterExtensions {
	public static RouteHandlerBuilder WithReqQueryValidation<TRequest>(this RouteHandlerBuilder builder) {
		return builder.AddEndpointFilter<ReqQueryValidationFilter<TRequest>>();
	}
}
