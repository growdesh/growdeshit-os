import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/authMiddleware';
import { logActivity } from '../services/auditService';
import { ServiceError } from '../services/customerService';
import { createGrowDeshMcpServer } from '../services/mcpServerService';
import {
  authenticateMcpBearerToken,
  createMcpToken,
  listUserMcpTokens,
  revokeMcpToken,
} from '../services/mcpTokenService';

export async function authenticateMcpRequest(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'Unauthorized: Missing Bearer token. Generate an MCP token in GrowDeshIT OS.',
      },
      id: null,
    });
    return;
  }

  const rawToken = authHeader.slice(7).trim();
  const user = await authenticateMcpBearerToken(rawToken);
  if (!user) {
    res.status(401).json({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'Unauthorized: Invalid or revoked MCP Bearer token.',
      },
      id: null,
    });
    return;
  }

  req.user = user;
  next();
}

export async function handleMcpProtocolRequest(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    res.status(401).json({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Authentication required.' },
      id: null,
    });
    return;
  }

  const server = createGrowDeshMcpServer(req.user);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on('close', () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('[MCP] Transport error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal MCP server error.' },
        id: null,
      });
    }
  }
}

export async function listMcpTokensHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const tokens = await listUserMcpTokens(req.user.userId);
    res.json({ tokens });
  } catch (error) {
    console.error('[McpController] listTokens:', error);
    res.status(500).json({ error: 'Failed to load MCP tokens.' });
  }
}

export async function createMcpTokenHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const label = typeof req.body?.label === 'string' ? req.body.label : 'MCP Client Token';
    const result = await createMcpToken(req.user.userId, label);

    await logActivity({
      user_id: req.user.userId,
      user_name: req.user.name,
      user_role: req.user.role,
      action: 'mcp.token_created',
      entity_type: 'MCPToken',
      entity_id: result.tokenRecord.token_prefix,
      source: 'Web',
      details: `Generated personal MCP access token "${result.tokenRecord.label}"`,
    });

    res.status(201).json({
      token: result.tokenRecord,
      rawToken: result.rawToken,
    });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('[McpController] createToken:', error);
    res.status(500).json({ error: 'Failed to create MCP token.' });
  }
}

export async function revokeMcpTokenHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const tokenId = Number(req.params.id);
    if (!Number.isInteger(tokenId) || tokenId <= 0) {
      res.status(400).json({ error: 'Invalid token ID.' });
      return;
    }
    await revokeMcpToken(req.user.userId, tokenId);

    await logActivity({
      user_id: req.user.userId,
      user_name: req.user.name,
      user_role: req.user.role,
      action: 'mcp.token_revoked',
      entity_type: 'MCPToken',
      entity_id: `#${tokenId}`,
      source: 'Web',
      details: `Revoked personal MCP access token #${tokenId}`,
    });

    res.json({ success: true });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('[McpController] revokeToken:', error);
    res.status(500).json({ error: 'Failed to revoke MCP token.' });
  }
}
