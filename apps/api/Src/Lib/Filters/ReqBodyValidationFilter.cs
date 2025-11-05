using FluentValidation;
using MainApi.Localization;

namespace MainApi.Src.Lib.Filters;

public record ReqBodyValidationFailedResponse : ApiResponse {
	public IDictionary<string, string[]> FieldErrors { get; set; } = new Dictionary<string, string[]>();

	public static ReqBodyValidationFailedResponse Create(
		string message,
		TranslationKey key,
		IDictionary<string, string[]> fieldErrors
	) {
		return new ReqBodyValidationFailedResponse {
			Message = message,
			Key = key,
			FieldErrors = fieldErrors
		};
	}
}

public class ReqBodyValidationFilter<TRequest> : IEndpointFilter {
	private readonly IValidator<TRequest> _validator;

	public ReqBodyValidationFilter(IValidator<TRequest> validator) {
		_validator = validator;
	}

	public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext httpContext, EndpointFilterDelegate next) {
		// Find the argument that matches TRequest (skip route/query/service args)
		var (found, idx) = httpContext.Arguments
			.Select((arg, i) => (arg, i))
			.FirstOrDefault(x => x.arg is TRequest);

		if (found is null) {
			// No matching body argument → fail validation
			var response = ReqBodyValidationFailedResponse.Create(
				"Request body is required",
				ResponseKeys.RequestBodyValidationFailed,
				new Dictionary<string, string[]> {
					{ "body", ["Request body is required"] }
				}
			);
			return TypedResults.BadRequest(response);
		}

		var request = httpContext.GetArgument<TRequest>(idx);
		var result = await _validator.ValidateAsync(request, httpContext.HttpContext.RequestAborted);

		if (!result.IsValid) {
			var response = ReqBodyValidationFailedResponse.Create(
				"Request body validation failed",
				ResponseKeys.RequestBodyValidationFailed,
				result.ToDictionary()
			);
			return TypedResults.BadRequest(response);
		}

		return await next(httpContext);
	}
}

public static class ReqBodyValidationFilterExtensions {
	public static RouteHandlerBuilder WithReqBodyValidation<TRequest>(this RouteHandlerBuilder builder) {
		return builder.AddEndpointFilter<ReqBodyValidationFilter<TRequest>>();
	}
}
