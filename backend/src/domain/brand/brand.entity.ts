/**
 * Brand Entity (for Multi-Tenant projects)
 */

export interface BrandProps {
  id: string;
  name: string;
  key: string;
  description: string | null;
  projectId: string;
  createdAt: Date;
  updatedAt: Date;
}

export class Brand {
  private constructor(private readonly props: BrandProps) {}

  static create(props: Omit<BrandProps, 'id' | 'createdAt' | 'updatedAt'>): Brand {
    const now = new Date();
    return new Brand({
      ...props,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now
    });
  }

  static reconstitute(props: BrandProps): Brand {
    return new Brand(props);
  }

  get id(): string { return this.props.id; }
  get name(): string { return this.props.name; }
  get key(): string { return this.props.key; }
  get description(): string | null { return this.props.description; }
  get projectId(): string { return this.props.projectId; }

  update(data: { name?: string; description?: string }): Brand {
    return new Brand({
      ...this.props,
      name: data.name ?? this.props.name,
      description: data.description ?? this.props.description,
      updatedAt: new Date()
    });
  }
}
