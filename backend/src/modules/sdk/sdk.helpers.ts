import { Flag, FlagType } from '../../domain/flag.entity';

export function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  return allowedOrigins.some((allowedOrigin) => {
    if (allowedOrigin === '*') {
      return true;
    }

    if (allowedOrigin === origin) {
      return true;
    }

    if (allowedOrigin.startsWith('*.')) {
      const domain = allowedOrigin.slice(2);
      return origin.endsWith(domain);
    }

    return false;
  });
}

export function getDefaultFlagValue(flagType: FlagType): string {
  switch (flagType) {
    case 'BOOLEAN':
      return 'false';
    case 'NUMBER':
      return '0';
    case 'JSON':
      return '{}';
    case 'STRING':
    default:
      return '';
  }
}

export function toSdkFlagResponse(flag: {
  id: string;
  key: string;
  name: string;
  description: string | null;
  flagType: FlagType;
  projectId: string;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}, organizationId: string, defaultValue: string, enabled: boolean) {
  const domainFlag = Flag.reconstitute({
    id: flag.id,
    key: flag.key,
    name: flag.name,
    description: flag.description,
    type: flag.flagType,
    projectId: flag.projectId,
    organizationId,
    createdById: flag.createdById || '',
    createdAt: flag.createdAt,
    updatedAt: flag.updatedAt,
  });

  return {
    value: domainFlag.parseValue(defaultValue),
    enabled,
    flagType: flag.flagType,
  };
}
