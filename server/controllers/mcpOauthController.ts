import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/authMiddleware';
import { logActivity } from '../services/auditService';
import { AuthError } from '../services/authService';
import { ServiceError } from '../services/customerService';
import {
  authorizeUserAndIssueCode,
  createOAuthClient,
  exchangeAuthorizationCode,
  listOAuthClients,
  OAuthProtocolError,
  refreshOAuthToken,
  resolveAppBaseUrl,
  revokeOAuthClient,
  validateAuthorizationRequest,
} from '../services/mcpOauthService';
import { escapeHtml } from '../utils/businessLogic';

function setNoStoreHeaders(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
}

function setConsentSecurityHeaders(res: Response): void {
  setNoStoreHeaders(res);
  res.setHeader('Referrer-Policy', 'no-referrer');
  // Note: Intentionally omit `form-action` so browsers allow the 302 redirect
  // from POST /oauth/authorize to verified external OAuth redirect_uri callbacks
  // (e.g. https://chatgpt.com/connector/oauth/... or https://gemini.google.com/...).
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'"
  );
}

function renderOAuthErrorPage(title: string, message: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} — GrowDeshIT OS</title>
  <style>
    body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f8fafc; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0f172a; padding: 24px; }
    .card { width: 100%; max-width: 420px; background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 28px; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04); }
    h1 { margin: 0 0 8px; font-size: 18px; font-weight: 700; color: #0f172a; }
    p { margin: 0; font-size: 14px; line-height: 1.55; color: #475569; }
    .badge { display: inline-block; margin-bottom: 14px; font-size: 12px; font-weight: 600; color: #be123c; background: #fff1f2; border: 1px solid #fecdd3; border-radius: 6px; padding: 4px 10px; }
  </style>
</head>
<body>
  <main class="card">
    <div class="badge">Authorization Error</div>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
  </main>
</body>
</html>`;
}

function renderConsentPage(params: {
  clientName: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state: string;
  scope: string;
  resource: string;
  identifier?: string;
  errorMessage?: string;
}): string {
  const errorBlock = params.errorMessage
    ? `<div class="alert" role="alert">${escapeHtml(params.errorMessage)}</div>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Authorize ${escapeHtml(params.clientName)} — GrowDeshIT OS</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f8fafc; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0f172a; padding: 24px 16px; }
    .card { width: 100%; max-width: 420px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 28px; box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05); }
    .header { text-align: center; margin-bottom: 22px; }
    .logo { width: 44px; height: 44px; border-radius: 10px; margin-bottom: 12px; }
    h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; color: #0f172a; }
    .subtitle { margin: 6px 0 0; font-size: 13px; color: #64748b; line-height: 1.45; }
    .app-pill { margin: 16px 0; padding: 12px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 12.5px; color: #334155; line-height: 1.5; }
    .app-pill strong { color: #0f172a; }
    .privacy { margin-top: 8px; padding-top: 8px; border-top: 1px solid #e2e8f0; color: #0f766e; font-size: 12px; }
    .alert { margin-bottom: 16px; padding: 10px 12px; background: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px; color: #be123c; font-size: 13px; }
    .field { margin-bottom: 14px; }
    label { display: block; font-size: 12px; font-weight: 600; color: #334155; margin-bottom: 6px; }
    input[type="text"], input[type="password"] { width: 100%; min-height: 44px; padding: 0 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; color: #0f172a; background: #fff; }
    input:focus { outline: none; border-color: #0d9488; box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.14); }
    .actions { display: flex; flex-direction: column; gap: 10px; margin-top: 18px; }
    .btn-primary { width: 100%; min-height: 44px; border: 0; border-radius: 8px; background: #0f766e; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; }
    .btn-primary:hover { background: #115e59; }
    .btn-secondary { width: 100%; min-height: 40px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; color: #475569; font-size: 13px; font-weight: 500; cursor: pointer; }
    .btn-secondary:hover { background: #f8fafc; color: #0f172a; }
    .footer-note { margin-top: 16px; text-align: center; font-size: 11.5px; color: #94a3b8; }
  </style>
</head>
<body>
  <main class="card">
    <div class="header">
      <img src="/icon.svg" alt="GrowDeshIT OS" class="logo" />
      <h1>GrowDeshIT OS</h1>
      <p class="subtitle">Sign in to connect <strong>${escapeHtml(params.clientName)}</strong> to your workspace</p>
    </div>

    <div class="app-pill">
      <div><strong>${escapeHtml(params.clientName)}</strong> is requesting MCP access under your GrowDeshIT OS account role (projects, tasks, notes, payment schedules, BDT reports, and activity logs).</div>
      <div class="privacy">Customer personal details (names, emails, phones, companies) are never shared via MCP.</div>
    </div>

    ${errorBlock}

    <form method="POST" action="/oauth/authorize">
      <input type="hidden" name="client_id" value="${escapeHtml(params.clientId)}" />
      <input type="hidden" name="redirect_uri" value="${escapeHtml(params.redirectUri)}" />
      <input type="hidden" name="response_type" value="code" />
      <input type="hidden" name="code_challenge" value="${escapeHtml(params.codeChallenge)}" />
      <input type="hidden" name="code_challenge_method" value="${escapeHtml(params.codeChallengeMethod)}" />
      <input type="hidden" name="state" value="${escapeHtml(params.state)}" />
      <input type="hidden" name="scope" value="${escapeHtml(params.scope)}" />
      <input type="hidden" name="resource" value="${escapeHtml(params.resource)}" />

      <div class="field">
        <label for="oauth-identifier">Email or Phone</label>
        <input id="oauth-identifier" name="identifier" type="text" required autocomplete="username" value="${escapeHtml(params.identifier || '')}" placeholder="name@growdeshit.com or +880..." />
      </div>

      <div class="field">
        <label for="oauth-password">Password</label>
        <input id="oauth-password" name="password" type="password" required autocomplete="current-password" placeholder="Enter your password" />
      </div>

      <div class="actions">
        <button type="submit" name="decision" value="approve" class="btn-primary">Approve &amp; Connect</button>
        <button type="submit" name="decision" value="deny" formnovalidate class="btn-secondary">Cancel</button>
      </div>
    </form>

    <p class="footer-note">OAuth 2.1 with PKCE (S256) · Every MCP action is recorded in Activity Logs</p>
  </main>
</body>
</html>`;
}

/**
 * RFC 9728 OAuth 2.0 Protected Resource Metadata
 */
export function protectedResourceMetadataHandler(req: Request, res: Response): void {
  const baseUrl = resolveAppBaseUrl(req);
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({
    resource: `${baseUrl}/api/mcp`,
    authorization_servers: [baseUrl],
    bearer_methods_supported: ['header'],
    resource_name: 'GrowDeshIT OS MCP Server',
  });
}

/**
 * RFC 8414 OAuth 2.0 Authorization Server Metadata
 */
export function authorizationServerMetadataHandler(req: Request, res: Response): void {
  const baseUrl = resolveAppBaseUrl(req);
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
  });
}

export async function authorizeGetHandler(req: Request, res: Response): Promise<void> {
  setConsentSecurityHeaders(res);

  const clientId = typeof req.query.client_id === 'string' ? req.query.client_id : '';
  const redirectUri = typeof req.query.redirect_uri === 'string' ? req.query.redirect_uri : '';
  const responseType = typeof req.query.response_type === 'string' ? req.query.response_type : '';
  const codeChallenge =
    typeof req.query.code_challenge === 'string' ? req.query.code_challenge : '';
  const codeChallengeMethod =
    typeof req.query.code_challenge_method === 'string' ? req.query.code_challenge_method : 'S256';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const scope = typeof req.query.scope === 'string' ? req.query.scope : 'mcp';
  const resource = typeof req.query.resource === 'string' ? req.query.resource : '';

  try {
    const { client, redirectUri: verifiedRedirect } = await validateAuthorizationRequest({
      clientId,
      redirectUri,
      responseType,
      codeChallenge,
      codeChallengeMethod,
    });

    res.status(200).type('html').send(
      renderConsentPage({
        clientName: client.name,
        clientId: client.client_id,
        redirectUri: verifiedRedirect,
        codeChallenge,
        codeChallengeMethod: 'S256',
        state,
        scope,
        resource,
      })
    );
  } catch (error) {
    const message =
      error instanceof OAuthProtocolError
        ? error.message
        : 'Invalid OAuth authorization request.';
    res.status(400).type('html').send(renderOAuthErrorPage('Invalid OAuth Request', message));
  }
}

export async function authorizePostHandler(req: Request, res: Response): Promise<void> {
  setNoStoreHeaders(res);
  res.setHeader('Referrer-Policy', 'no-referrer');

  const body = (req.body || {}) as Record<string, unknown>;
  const clientId = typeof body.client_id === 'string' ? body.client_id : '';
  const redirectUri = typeof body.redirect_uri === 'string' ? body.redirect_uri : '';
  const responseType = typeof body.response_type === 'string' ? body.response_type : 'code';
  const codeChallenge = typeof body.code_challenge === 'string' ? body.code_challenge : '';
  const codeChallengeMethod =
    typeof body.code_challenge_method === 'string' ? body.code_challenge_method : 'S256';
  const state = typeof body.state === 'string' ? body.state : '';
  const scope = typeof body.scope === 'string' ? body.scope : 'mcp';
  const resource = typeof body.resource === 'string' ? body.resource : '';
  const identifier =
    typeof body.identifier === 'string'
      ? body.identifier
      : typeof body.email === 'string'
        ? body.email
        : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const decision = typeof body.decision === 'string' ? body.decision : 'approve';

  let verifiedClientName = 'Connected App';
  let verifiedRedirect = '';
  try {
    const validation = await validateAuthorizationRequest({
      clientId,
      redirectUri,
      responseType,
      codeChallenge,
      codeChallengeMethod,
    });
    verifiedClientName = validation.client.name;
    verifiedRedirect = validation.redirectUri;
  } catch (error) {
    setConsentSecurityHeaders(res);
    const message =
      error instanceof OAuthProtocolError
        ? error.message
        : 'Invalid OAuth authorization request.';
    res.status(400).type('html').send(renderOAuthErrorPage('Invalid OAuth Request', message));
    return;
  }

  if (decision === 'deny') {
    const denyUrl = new URL(verifiedRedirect);
    denyUrl.searchParams.set('error', 'access_denied');
    denyUrl.searchParams.set('error_description', 'User denied access.');
    if (state) denyUrl.searchParams.set('state', state);
    res.redirect(302, denyUrl.toString());
    return;
  }

  try {
    const { code, user, client } = await authorizeUserAndIssueCode({
      clientId,
      redirectUri: verifiedRedirect,
      codeChallenge,
      codeChallengeMethod,
      identifier,
      password,
    });

    await logActivity({
      user_id: user.id,
      user_name: user.name,
      user_role: user.role,
      action: 'mcp.oauth_authorized',
      entity_type: 'OAuthClient',
      entity_id: client.client_id,
      source: 'Web',
      details: `Approved OAuth 2.1 MCP connection for "${client.name}"${resource ? ` (${resource})` : ''}`,
    });

    const callbackUrl = new URL(verifiedRedirect);
    callbackUrl.searchParams.set('code', code);
    if (state) {
      callbackUrl.searchParams.set('state', state);
    }
    res.redirect(302, callbackUrl.toString());
  } catch (error) {
    setConsentSecurityHeaders(res);
    const errMsg =
      error instanceof AuthError || error instanceof OAuthProtocolError
        ? error.message
        : 'Invalid credentials. Please check your email/phone and password.';

    res.status(401).type('html').send(
      renderConsentPage({
        clientName: verifiedClientName,
        clientId,
        redirectUri: verifiedRedirect,
        codeChallenge,
        codeChallengeMethod: 'S256',
        state,
        scope,
        resource,
        identifier,
        errorMessage: errMsg,
      })
    );
  }
}

function extractClientCredentials(req: Request): { clientId: string; clientSecret: string } {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(authHeader.slice(6).trim(), 'base64').toString('utf8');
      const sepIndex = decoded.indexOf(':');
      if (sepIndex > 0) {
        const rawId = decoded.slice(0, sepIndex);
        const rawSecret = decoded.slice(sepIndex + 1);
        // RFC 6749 Section 2.3.1: HTTP Basic client credentials may be form-urlencoded
        const decodeComponent = (val: string) => {
          try {
            return decodeURIComponent(val.replace(/\+/g, '%20'));
          } catch {
            return val;
          }
        };
        return {
          clientId: decodeComponent(rawId),
          clientSecret: decodeComponent(rawSecret),
        };
      }
    } catch {
      return { clientId: '', clientSecret: '' };
    }
  }

  const body = (req.body || {}) as Record<string, unknown>;
  return {
    clientId: typeof body.client_id === 'string' ? body.client_id : '',
    clientSecret: typeof body.client_secret === 'string' ? body.client_secret : '',
  };
}

export async function tokenHandler(req: Request, res: Response): Promise<void> {
  setNoStoreHeaders(res);

  const body = (req.body || {}) as Record<string, unknown>;
  const grantType = typeof body.grant_type === 'string' ? body.grant_type.trim() : '';
  const { clientId, clientSecret } = extractClientCredentials(req);

  if (!clientId || !clientSecret) {
    res.status(401).json({
      error: 'invalid_client',
      error_description: 'Client authentication failed. Provide client_id and client_secret.',
    });
    return;
  }

  try {
    if (grantType === 'authorization_code') {
      const code = typeof body.code === 'string' ? body.code : '';
      const redirectUri = typeof body.redirect_uri === 'string' ? body.redirect_uri : '';
      const codeVerifier = typeof body.code_verifier === 'string' ? body.code_verifier : '';

      const tokens = await exchangeAuthorizationCode({
        clientId,
        clientSecret,
        code,
        redirectUri,
        codeVerifier,
      });

      res.status(200).json(tokens);
      return;
    }

    if (grantType === 'refresh_token') {
      const refreshToken = typeof body.refresh_token === 'string' ? body.refresh_token : '';
      const tokens = await refreshOAuthToken({
        clientId,
        clientSecret,
        refreshToken,
      });

      res.status(200).json(tokens);
      return;
    }

    res.status(400).json({
      error: 'unsupported_grant_type',
      error_description: 'Supported grant types are authorization_code and refresh_token.',
    });
  } catch (error) {
    if (error instanceof OAuthProtocolError) {
      res.status(error.statusCode).json({
        error: error.oauthError,
        error_description: error.message,
      });
      return;
    }
    console.error('[OAuthTokenHandler]', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Unable to process OAuth token request.',
    });
  }
}

export async function listOAuthClientsHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const clients = await listOAuthClients();
    const baseUrl = resolveAppBaseUrl(req);
    res.json({
      clients,
      mcpServerUrl: `${baseUrl}/api/mcp`,
      appUrl: baseUrl,
    });
  } catch (error) {
    console.error('[OAuthClients] list:', error);
    res.status(500).json({ error: 'Failed to load OAuth clients.' });
  }
}

export async function createOAuthClientHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name : '';
    const redirectUri = typeof body.redirect_uri === 'string' ? body.redirect_uri : '';

    const { client, clientSecret } = await createOAuthClient({
      name,
      redirectUri,
      createdBy: req.user.userId,
    });

    await logActivity({
      user_id: req.user.userId,
      user_name: req.user.name,
      user_role: req.user.role,
      action: 'mcp.oauth_client_created',
      entity_type: 'OAuthClient',
      entity_id: client.client_id,
      source: 'Web',
      details: `Registered MCP OAuth client "${client.name}"`,
    });

    const baseUrl = resolveAppBaseUrl(req);
    res.status(201).json({
      client,
      clientSecret,
      mcpServerUrl: `${baseUrl}/api/mcp`,
    });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('[OAuthClients] create:', error);
    res.status(500).json({ error: 'Failed to create OAuth client.' });
  }
}

export async function revokeOAuthClientHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid OAuth client ID.' });
      return;
    }

    const revoked = await revokeOAuthClient(id);

    await logActivity({
      user_id: req.user.userId,
      user_name: req.user.name,
      user_role: req.user.role,
      action: 'mcp.oauth_client_revoked',
      entity_type: 'OAuthClient',
      entity_id: revoked.clientId,
      source: 'Web',
      details: `Revoked MCP OAuth client "${revoked.name}" and invalidated its active tokens`,
    });

    res.json({ success: true });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('[OAuthClients] revoke:', error);
    res.status(500).json({ error: 'Failed to revoke OAuth client.' });
  }
}
