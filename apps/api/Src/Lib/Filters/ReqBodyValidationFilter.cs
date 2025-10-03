using FluentValidation;

namespace MainApi.Src.Lib.Filters;

public class ReqBodyValidationFailResult : AppResponseResult {
	public new string Message { get; set; } = "Validation failed";
	public new string Key { get; set; } = "validation-failed";
	public object FieldErrors { get; set; } = new Dictionary<string, string[]>();
}

public class ReqBodyValidationFilter<TRequest> : IEndpointFilter {
	private readonly IValidator<TRequest> _validator;

	public ReqBodyValidationFilter(IValidator<TRequest> validator) {
		_validator = validator;
	}

	public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext httpContext, EndpointFilterDelegate next) {
		var request = httpContext.GetArgument<TRequest>(0);
		var result = await _validator.ValidateAsync(request, httpContext.HttpContext.RequestAborted);

		if (!result.IsValid) {
			return TypedResults.BadRequest(new ReqBodyValidationFailResult {
				FieldErrors = result.ToDictionary()
			});
		}

		return await next(httpContext);
	}
}

public static class ReqBodyValidationFilterExtensions {
	public static RouteHandlerBuilder WithReqBodyValidation<TRequest>(this RouteHandlerBuilder builder) {
		return builder.AddEndpointFilter<ReqBodyValidationFilter<TRequest>>();
	}
}
