using System.Reflection;
using System.Runtime.CompilerServices;

using FluentValidation;
using FluentValidation.Results;

using MainApi.Localization;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Lib.ProblemResults;

using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Lib.Filters;

public class ReqQueryValidationFilter<TRequest> : IEndpointFilter where TRequest : class {
	private readonly IValidator<TRequest> _validator;
	private static readonly Lazy<IReadOnlyDictionary<string, string>>
		QueryParameterNames =
			new(BuildQueryParameterNames);

	public ReqQueryValidationFilter(IValidator<TRequest> validator) {
		_validator = validator;
	}

	public async ValueTask<object?> InvokeAsync(
		EndpointFilterInvocationContext httpContext,
		EndpointFilterDelegate next
	) {
		// Find the query-bound argument that matches TRequest
		var (found, idx) = httpContext.Arguments
			.Select((arg, i) => (arg, i))
			.FirstOrDefault(x => x.arg is TRequest);

		// No matching query argument -> fail validation
		if (found is null) {
			var empty = (TRequest)RuntimeHelpers.GetUninitializedObject(typeof(TRequest));
			var resultDefault = await _validator.ValidateAsync(
				empty,
				httpContext.HttpContext.RequestAborted
			);

			if (!resultDefault.IsValid) {
				return TypedProblems.ValidationProblem(
					"Query parameters validation failed",
					ResponseKeys.QueryParametersValidationFailed,
					ToQueryErrorDictionary(resultDefault)
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
				ToQueryErrorDictionary(result)
			);
		}

		return await next(httpContext);
	}

	private static Dictionary<string, string[]> ToQueryErrorDictionary(
		ValidationResult result
	) {
		var grouped = new Dictionary<string, List<string>>();

		foreach (var error in result.Errors) {
			// FluentValidation reports RuleFor property names,
			// while Custom failures may already use wire keys.
			// Map known FromQuery names to RFC 7807 error keys
			// and leave explicit keys unchanged.
			var key = MapPropertyName(error.PropertyName);
			if (!grouped.TryGetValue(key, out var messages)) {
				messages = [];
				grouped[key] = messages;
			}
			messages.Add(error.ErrorMessage);
		}

		return grouped.ToDictionary(
			item => item.Key,
			item => item.Value.ToArray()
		);
	}

	private static string MapPropertyName(string propertyName) {
		if (QueryParameterNames.Value.TryGetValue(
			propertyName,
			out var queryName
		)) {
			return queryName;
		}

		return propertyName;
	}

	private static IReadOnlyDictionary<string, string>
		BuildQueryParameterNames() {
		var names = new Dictionary<string, string>();

		foreach (var property in typeof(TRequest)
			.GetProperties(
				BindingFlags.Public
				| BindingFlags.Instance
			)) {
			var queryName = property
				.GetCustomAttribute<FromQueryAttribute>()
				?.Name;

			if (string.IsNullOrWhiteSpace(queryName)) {
				continue;
			}

			names[property.Name] = queryName;
		}

		return names;
	}
}

public static class ReqQueryValidationFilterExtensions {
	public static RouteHandlerBuilder WithReqQueryValidation<TRequest>(
		this RouteHandlerBuilder builder
	) where TRequest : class {
		return builder
			.AddEndpointFilter<ReqQueryValidationFilter<TRequest>>()
			.ProducesValidationProblem();
	}
}
