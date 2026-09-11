namespace PublyApp.Api.Lib;

public readonly struct PatchField<T> {
	private readonly T? _Value;

	public bool IsPresent { get; }

	public T? Value {
		get {
			return IsPresent
		? _Value
		: throw new InvalidOperationException(
			"Cannot access Value on an absent "
			+ "PatchField. Check IsPresent first."
		);
		}
	}

	private PatchField(bool isPresent, T? value) {
		IsPresent = isPresent;
		_Value = value;
	}

	public static PatchField<T> Absent() {
		return new(false, default);
	}

	public static PatchField<T> Set(T? value) {
		return new(true, value);
	}

	public bool TryGetValue(out T? value) {
		value = _Value;
		return IsPresent;
	}

	public TResult Match<TResult>(
		Func<T?, TResult> onPresent,
		Func<TResult> onAbsent
	) {
		ArgumentNullException.ThrowIfNull(onPresent);
		ArgumentNullException.ThrowIfNull(onAbsent);
		return IsPresent
			? onPresent(_Value)
			: onAbsent();
	}
}
