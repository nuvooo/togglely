/**
 * FlagValue Entity - Represents a flag's value in a specific environment/brand
 */

export interface FlagValueProps {
  id: string;
  flagId: string;
  environmentId: string;
  brandId: string | null;  // null = default (single-tenant)
  enabled: boolean;
  value: string;  // Stored as string, parsed based on flag type
  createdAt: Date;
  updatedAt: Date;
}

export class FlagValue {
  private constructor(private readonly props: FlagValueProps) {}

  static create(props: Omit<FlagValueProps, 'id' | 'createdAt' | 'updatedAt'>): FlagValue {
    const now = new Date();
    return new FlagValue({
      ...props,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now
    });
  }

  static reconstitute(props: FlagValueProps): FlagValue {
    return new FlagValue(props);
  }

  // Getters
  get id(): string { return this.props.id; }
  get flagId(): string { return this.props.flagId; }
  get environmentId(): string { return this.props.environmentId; }
  get brandId(): string | null { return this.props.brandId; }
  get enabled(): boolean { return this.props.enabled; }
  get value(): string { return this.props.value; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  isForBrand(brandId: string | null): boolean {
    return this.props.brandId === brandId;
  }

  toggle(): FlagValue {
    return new FlagValue({
      ...this.props,
      enabled: !this.props.enabled,
      updatedAt: new Date()
    });
  }

  updateValue(value: string): FlagValue {
    return new FlagValue({
      ...this.props,
      value,
      updatedAt: new Date()
    });
  }

  update(data: { enabled?: boolean; value?: string }): FlagValue {
    return new FlagValue({
      ...this.props,
      enabled: data.enabled ?? this.props.enabled,
      value: data.value ?? this.props.value,
      updatedAt: new Date()
    });
  }

  /**
   * Get the effective value considering enabled state
   * If disabled, returns false
   * If enabled, returns the parsed value
   */
  getEffectiveValue<T>(parser: (val: string) => T): T | false {
    if (!this.props.enabled) {
      return false as T | false;
    }
    return parser(this.props.value);
  }
}
