import { Router } from 'express';
import { getAuditLogs, getMyAuditLogs } from '../controllers/auditLogs';
import { authenticate, requireOrgMember } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/my', getMyAuditLogs);
router.get('/organization/:orgId', requireOrgMember, getAuditLogs);

export { router as auditLogsRouter };
