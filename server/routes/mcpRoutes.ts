import { Router } from 'express';
import {
  authenticateMcpRequest,
  createMcpTokenHandler,
  handleMcpProtocolRequest,
  listMcpTokensHandler,
  revokeMcpTokenHandler,
} from '../controllers/mcpController';
import {
  createOAuthClientHandler,
  listOAuthClientsHandler,
  revokeOAuthClientHandler,
} from '../controllers/mcpOauthController';
import { authenticateJWT, requireRole } from '../middleware/authMiddleware';

const router = Router();

// Personal MCP Token management (Web session JWT)
router.get('/tokens', authenticateJWT, listMcpTokensHandler);
router.post('/tokens', authenticateJWT, createMcpTokenHandler);
router.delete('/tokens/:id', authenticateJWT, revokeMcpTokenHandler);

// OAuth 2.1 Client App management (Superadmin only)
router.get('/oauth-clients', authenticateJWT, requireRole('superadmin'), listOAuthClientsHandler);
router.post('/oauth-clients', authenticateJWT, requireRole('superadmin'), createOAuthClientHandler);
router.delete('/oauth-clients/:id', authenticateJWT, requireRole('superadmin'), revokeOAuthClientHandler);

// Streamable HTTP MCP Endpoint (Personal MCP Bearer token, OAuth 2.1 access token, or JWT)
router.post('/', authenticateMcpRequest, handleMcpProtocolRequest);
router.get('/', authenticateMcpRequest, handleMcpProtocolRequest);
router.delete('/', authenticateMcpRequest, handleMcpProtocolRequest);

export default router;
