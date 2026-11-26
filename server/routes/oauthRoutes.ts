import { Router } from 'express';
import {
  authorizationServerMetadataHandler,
  authorizeGetHandler,
  authorizePostHandler,
  protectedResourceMetadataHandler,
  tokenHandler,
} from '../controllers/mcpOauthController';

export const wellKnownRouter = Router();

// RFC 9728 Protected Resource Metadata (root and resource-path scoped forms)
wellKnownRouter.get('/oauth-protected-resource', protectedResourceMetadataHandler);
wellKnownRouter.get('/oauth-protected-resource/api/mcp', protectedResourceMetadataHandler);

// RFC 8414 Authorization Server Metadata
wellKnownRouter.get('/oauth-authorization-server', authorizationServerMetadataHandler);

export const oauthRouter = Router();

// OAuth 2.1 Authorization & Token Endpoints
oauthRouter.get('/authorize', authorizeGetHandler);
oauthRouter.post('/authorize', authorizePostHandler);
oauthRouter.post('/token', tokenHandler);
