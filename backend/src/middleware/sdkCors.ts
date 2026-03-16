import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';

/**
 * Middleware to validate CORS origin for SDK requests
 * Checks if the request origin is in the project's allowedOrigins list
 * If allowedOrigins is empty, allows all origins
 * If allowedOrigins contains '*', allows all origins
 */
export const validateSdkOrigin = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const origin = req.headers.origin || req.headers.referer || '';
    const projectKey = req.params.projectKey;

    console.log(`[SDK CORS] Request from origin: ${origin}, project: ${projectKey}`);

    if (!projectKey) {
      res.status(400).json({ error: 'Project key is required' });
      return;
    }

    // Find project by key
    const project = await prisma.project.findFirst({
      where: { key: projectKey },
      select: { id: true, name: true, allowedOrigins: true }
    });

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    // If no allowed origins configured, allow all (backward compatibility)
    if (!project.allowedOrigins || project.allowedOrigins.length === 0) {
      console.log(`[SDK CORS] Project ${project.name} has no allowed origins configured, allowing all`);
      res.header('Access-Control-Allow-Origin', origin || '*');
      res.header('Access-Control-Allow-Credentials', 'true');
      next();
      return;
    }

    // If wildcard is in allowed origins, allow all
    if (project.allowedOrigins.includes('*')) {
      console.log(`[SDK CORS] Project ${project.name} allows all origins (*)`);
      res.header('Access-Control-Allow-Origin', origin || '*');
      res.header('Access-Control-Allow-Credentials', 'true');
      next();
      return;
    }

    // Check if origin is in allowed list
    // Extract domain from origin (e.g., "https://example.com" -> "example.com")
    const originDomain = origin ? new URL(origin).hostname : '';
    
    const isAllowed = project.allowedOrigins.some(allowed => {
      // Exact match
      if (allowed === origin) return true;
      
      // Domain match (e.g., "example.com" matches "https://app.example.com")
      if (originDomain && (allowed === originDomain || originDomain.endsWith('.' + allowed))) {
        return true;
      }
      
      // Wildcard subdomain match (e.g., "*.example.com" matches "https://app.example.com")
      if (allowed.startsWith('*.')) {
        const domain = allowed.slice(2); // Remove "*."
        if (originDomain === domain || originDomain.endsWith('.' + domain)) {
          return true;
        }
      }
      
      return false;
    });

    if (isAllowed) {
      console.log(`[SDK CORS] Origin ${origin} is allowed for project ${project.name}`);
      res.header('Access-Control-Allow-Origin', origin || '*');
      res.header('Access-Control-Allow-Credentials', 'true');
      next();
    } else {
      console.log(`[SDK CORS] Origin ${origin} is NOT allowed for project ${project.name}`);
      console.log(`[SDK CORS] Allowed origins: ${project.allowedOrigins.join(', ')}`);
      res.status(403).json({ 
        error: 'Origin not allowed',
        origin: origin,
        project: project.name
      });
    }
  } catch (error) {
    console.error('[SDK CORS] Error validating origin:', error);
    // On error, allow request but log it
    next();
  }
};

/**
 * Handle preflight OPTIONS requests for SDK
 */
export const handleSdkPreflight = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (req.method === 'OPTIONS') {
    const origin = req.headers.origin || '';
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Origin', origin || '*');
    res.status(200).end();
    return;
  }
  next();
};
