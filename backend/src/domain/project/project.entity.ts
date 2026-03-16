/**
 * Project Entity
 */

export type ProjectType = 'SINGLE' | 'MULTI';

export interface ProjectProps {
  id: string;
  name: string;
  key: string;
  description: string | null;
  type: ProjectType;
  allowedOrigins: string[];
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
}

export class Project {
  private constructor(private readonly props: ProjectProps) {}

  static create(props: Omit<ProjectProps, 'id' | 'createdAt' | 'updatedAt'>): Project {
    const now = new Date();
    return new Project({
      ...props,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now
    });
  }

  static reconstitute(props: ProjectProps): Project {
    return new Project(props);
  }

  get id(): string { return this.props.id; }
  get name(): string { return this.props.name; }
  get key(): string { return this.props.key; }
  get description(): string | null { return this.props.description; }
  get type(): ProjectType { return this.props.type; }
  get allowedOrigins(): string[] { return [...this.props.allowedOrigins]; }
  get organizationId(): string { return this.props.organizationId; }
  get isMultiTenant(): boolean { return this.props.type === 'MULTI'; }

  update(data: { name?: string; description?: string; allowedOrigins?: string[] }): Project {
    return new Project({
      ...this.props,
      name: data.name ?? this.props.name,
      description: data.description ?? this.props.description,
      allowedOrigins: data.allowedOrigins ?? this.props.allowedOrigins,
      updatedAt: new Date()
    });
  }

  /**
   * Check if origin is allowed for SDK access
   */
  isOriginAllowed(origin: string | null): boolean {
    // Empty array = allow all (backward compatibility)
    if (this.props.allowedOrigins.length === 0) {
      return true;
    }

    // Wildcard = allow all
    if (this.props.allowedOrigins.includes('*')) {
      return true;
    }

    if (!origin) {
      return false;
    }

    const originDomain = new URL(origin).hostname;

    return this.props.allowedOrigins.some(allowed => {
      // Exact match
      if (allowed === origin) return true;

      // Domain match
      if (originDomain === allowed || originDomain.endsWith('.' + allowed)) {
        return true;
      }

      // Wildcard subdomain
      if (allowed.startsWith('*.')) {
        const domain = allowed.slice(2);
        if (originDomain === domain || originDomain.endsWith('.' + domain)) {
          return true;
        }
      }

      return false;
    });
  }
}
