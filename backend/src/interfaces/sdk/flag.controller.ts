/**
 * SDK Flag Controller
 * Clean controller using Use Cases
 */

import { Request, Response, NextFunction } from 'express';
import { EvaluateFlagUseCase } from '../../application/flag/evaluate-flag.usecase';
import { container, EVALUATE_FLAG_USE_CASE } from '../../shared/container';

export class SdkFlagController {
  private evaluateUseCase: EvaluateFlagUseCase;

  constructor() {
    this.evaluateUseCase = container.resolve(EVALUATE_FLAG_USE_CASE);
  }

  async getFlag(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { projectKey, environmentKey, flagKey } = req.params;
      const organizationId = (req as any).organizationId;
      const context = req.query.context ? JSON.parse(req.query.context as string) : {};
      const brandKey = (req.query.brandKey as string) || context.tenantId || context.brandKey || null;

      const result = await this.evaluateUseCase.execute({
        projectKey,
        environmentKey,
        flagKey,
        organizationId,
        brandKey,
        context
      });

      if (!result.success) {
        res.status(400).json({ error: result.error.message });
        return;
      }

      res.json({
        value: result.data.value,
        enabled: result.data.enabled
      });
    } catch (error) {
      next(error);
    }
  }

  async getAllFlags(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // TODO: Implement GetAllFlagsUseCase
      res.json({});
    } catch (error) {
      next(error);
    }
  }
}
