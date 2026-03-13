import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';
import { getRedis, getFlagCacheKey, getAllFlagsCacheKey, invalidateFlagCache } from '../utils/redis';
import { AuthenticatedRequest } from '../middleware/auth';

interface FlagContext {
  userId?: string;
  email?: string;
  country?: string;
  region?: string;
  [key: string]: any;
}

const evaluateCondition = (context: FlagContext, condition: { attribute: string; operator: string; value: string }): boolean => {
  const contextValue = context[condition.attribute];
  const conditionValue = condition.value;

  switch (condition.operator) {
    case 'EQUALS':
      return String(contextValue) === conditionValue;
    case 'NOT_EQUALS':
      return String(contextValue) !== conditionValue;
    case 'CONTAINS':
      return String(contextValue).includes(conditionValue);
    case 'NOT_CONTAINS':
      return !String(contextValue).includes(conditionValue);
    case 'STARTS_WITH':
      return String(contextValue).startsWith(conditionValue);
    case 'ENDS_WITH':
      return String(contextValue).endsWith(conditionValue);
    case 'GREATER_THAN':
      return Number(contextValue) > Number(conditionValue);
    case 'LESS_THAN':
      return Number(contextValue) < Number(conditionValue);
    case 'IN':
      return conditionValue.split(',').map(v => v.trim()).includes(String(contextValue));
    case 'NOT_IN':
      return !conditionValue.split(',').map(v => v.trim()).includes(String(contextValue));
    case 'MATCHES_REGEX':
      try {
        const regex = new RegExp(conditionValue);
        return regex.test(String(contextValue));
      } catch {
        return false;
      }
    default:
      return false;
  }
};

const evaluateTargetingRules = (context: FlagContext, rules: any[]): any | null => {
  // Sort by priority (lower = first)
  const sortedRules = [...rules].sort((a, b) => a.priority - b.priority);

  for (const rule of sortedRules) {
    if (!rule.conditions || rule.conditions.length === 0) {
      // Default rule
      return rule.serveValue;
    }

    const results = rule.conditions.map((c: any) => evaluateCondition(context, c));
    const matches = rule.operator === 'OR' 
      ? results.some((r: boolean) => r) 
      : results.every((r: boolean) => r);

    if (matches) {
      return rule.serveValue;
    }
  }

  return null;
};

const parseFlagValue = (value: string, type: string): any => {
  switch (type) {
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
};

export const getAllFlags = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { environmentKey } = req.params;
    const organizationId = req.organizationId;

    // Find environment
    const environment = await prisma.environment.findFirst({
      where: {
        key: environmentKey,
        project: { organizationId }
      }
    });

    if (!environment) {
      return res.status(404).json({ error: 'Environment not found' });
    }

    // Try cache first
    const redis = getRedis();
    const cacheKey = getAllFlagsCacheKey(environment.id);
    const cached = await redis.get(cacheKey);

    if (cached) {
      return res.json(JSON.parse(cached));
    }

    // Fetch from database
    const flagEnvs = await prisma.flagEnvironment.findMany({
      where: { environmentId: environment.id },
      include: {
        flag: {
          select: {
            key: true,
            flagType: true
          }
        }
      }
    });

    const flags = flagEnvs.reduce((acc, fe) => {
      acc[fe.flag.key] = {
        value: parseFlagValue(fe.defaultValue, fe.flag.flagType),
        enabled: fe.enabled
      };
      return acc;
    }, {} as Record<string, any>);

    // Cache for 30 seconds
    await redis.setex(cacheKey, 30, JSON.stringify(flags));

    res.json(flags);
  } catch (error) {
    next(error);
  }
};

export const getFlag = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { environmentKey, flagKey } = req.params;
    const organizationId = req.organizationId;

    // Find environment and flag
    const environment = await prisma.environment.findFirst({
      where: {
        key: environmentKey,
        project: { organizationId }
      }
    });

    if (!environment) {
      return res.status(404).json({ error: 'Environment not found' });
    }

    const flagEnv = await prisma.flagEnvironment.findFirst({
      where: {
        environmentId: environment.id,
        flag: {
          key: flagKey
        }
      },
      include: {
        flag: true
      }
    });

    if (!flagEnv) {
      // Return default off value
      return res.json({
        value: false,
        enabled: false
      });
    }

    res.json({
      value: parseFlagValue(flagEnv.defaultValue, flagEnv.flag.flagType),
      enabled: flagEnv.enabled
    });
  } catch (error) {
    next(error);
  }
};

export const evaluateFlag = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { environmentKey, flagKey } = req.params;
    const context: FlagContext = req.body.context || {};
    const organizationId = req.organizationId;

    // Find environment and flag
    const environment = await prisma.environment.findFirst({
      where: {
        key: environmentKey,
        project: { organizationId }
      }
    });

    if (!environment) {
      return res.status(404).json({ error: 'Environment not found' });
    }

    const flagEnv = await prisma.flagEnvironment.findFirst({
      where: {
        environmentId: environment.id,
        flag: {
          key: flagKey
        }
      },
      include: {
        flag: true,
        targetingRules: {
          include: {
            conditions: true
          }
        }
      }
    });

    if (!flagEnv) {
      return res.json({
        value: false,
        enabled: false
      });
    }

    // If flag is disabled, return default value
    if (!flagEnv.enabled) {
      return res.json({
        value: parseFlagValue(flagEnv.defaultValue, flagEnv.flag.flagType),
        enabled: false
      });
    }

    // Evaluate targeting rules
    const ruleValue = evaluateTargetingRules(context, flagEnv.targetingRules);
    
    if (ruleValue !== null) {
      return res.json({
        value: parseFlagValue(ruleValue, flagEnv.flag.flagType),
        enabled: true
      });
    }

    // Return default value
    res.json({
      value: parseFlagValue(flagEnv.defaultValue, flagEnv.flag.flagType),
      enabled: true
    });
  } catch (error) {
    next(error);
  }
};
