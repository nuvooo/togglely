/**
 * Flag Entity - Pure domain logic, no framework dependencies
 */

export type FlagType = 'BOOLEAN' | 'STRING' | 'NUMBER' | 'JSON';

export interface FlagProps {
  id: string;
  key: string;
  name: string;
  description: string | null;
  type: FlagType;
  projectId: string;
  organizationId: string;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

export class Flag {
  private constructor(private readonly props: FlagProps) {}

  static create(props: Omit<FlagProps, 'createdAt' | 'updatedAt'>): Flag {
    const now = new Date();
    return new Flag({
      ...props,
      createdAt: now,
      updatedAt: now
    });
  }

  static reconstitute(props: FlagProps): Flag {
    return new Flag(props);
  }

  // Getters
  get id(): string { return this.props.id; }
  get key(): string { return this.props.key; }
  get name(): string { return this.props.name; }
  get description(): string | null { return this.props.description; }
  get type(): FlagType { return this.props.type; }
  get projectId(): string { return this.props.projectId; }
  get organizationId(): string { return this.props.organizationId; }
  get createdById(): string { return this.props.createdById; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  // Domain logic
  update(data: { name?: string; description?: string }): Flag {
    return new Flag({
      ...this.props,
      name: data.name ?? this.props.name,
      description: data.description ?? this.props.description,
      updatedAt: new Date()
    });
  }

  /**
   * Parse string value to correct type
   */
  parseValue(value: string): boolean | string | number | object {
    switch (this.props.type) {
      case 'BOOLEAN':
        return value === 'true';
      case 'NUMBER':
        return Number(value);
      case 'JSON':
        try {
          return JSON.parse(value);
        } catch {
          return {};
        }
      default:
        return value;
    }
  }

  /**
   * Serialize value to string for storage
   */
  serializeValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    
    if (this.props.type === 'JSON') {
      return JSON.stringify(value);
    }
    
    return String(value);
  }

  validateValue(value: unknown): boolean {
    switch (this.props.type) {
      case 'BOOLEAN':
        return typeof value === 'boolean' || value === 'true' || value === 'false';
      case 'NUMBER':
        return !isNaN(Number(value));
      case 'JSON':
        try {
          if (typeof value === 'string') {
            JSON.parse(value);
          }
          return true;
        } catch {
          return false;
        }
      default:
        return typeof value === 'string';
    }
  }
}
