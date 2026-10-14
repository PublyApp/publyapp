namespace PublyApp.Api.Lib;

public readonly struct PatchField<T> {
	private readonly T? _Value;

	public bool IsPresent { get; }

	public T? Value {
		get {
			return this.IsPresent
		? this._Value
		: throw new InvalidOperationException(
			"Cannot access Value on an absent "
			+ "PatchField. Check IsPresent first."
		);
		}
	}

	private PatchField(bool isPresent, T? value) {
		this.IsPresent = isPresent;
		this._Value = value;
	}

	public static PatchField<T> Absent() {
		return new(false, default);
	}

	public static PatchField<T> Set(T? value) {
		return new(true, value);
	}

	public bool TryGetValue(out T? value) {
		value = this._Value;
		return this.IsPresent;
	}

	public TResult Match<TResult>(
		Func<T?, TResult> onPresent,
		Func<TResult> onAbsent
	) {
		ArgumentNullException.ThrowIfNull(onPresent);
		ArgumentNullException.ThrowIfNull(onAbsent);
		return this.IsPresent
			? onPresent(this._Value)
			: onAbsent();
	}
}
