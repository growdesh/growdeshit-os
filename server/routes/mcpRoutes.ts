import { Router } from 'express';
import {
  authenticateMcpRequest,
  createMcpTokenHandler,
  handleMcpProtocolRequest,
  listMcpTokensHandler,
  revokeMcpTokenHandler,
} from '../controllers/mcpController';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

// Personal MCP Token management (Web session JWT)
router.get('/tokens', authenticateJWT, listMcpTokensHandler);
router.post('/tokens', authenticateJWT, createMcpTokenHandler);
router.delete('/tokens/:id', authenticateJWT, revokeMcpTokenHandler);

// Streamable HTTP MCP Endpoint (Personal MCP Bearer token or JWT)
router.post('/', authenticateMcpRequest, handleMcpProtocolRequest);
router.get('/', authenticateMcpRequest, handleMcpProtocolRequest);
router.delete('/', authenticateMcpRequest, handleMcpProtocolRequest);

export default router;
