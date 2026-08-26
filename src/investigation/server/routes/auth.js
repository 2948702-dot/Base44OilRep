/**
 * Маршруты входа и выхода.
 */

import { login, logout } from '../auth.js';

export function registerAuthRoutes(app) {
  app.post('/api/auth/login', async (request, reply) => {
    const { email, password } = request.body ?? {};
    if (!email || !password) {
      return reply.code(400).send({ error: 'Требуются адрес и пароль' });
    }
    const result = await login(app.pool, {
      email,
      password,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
    return result;
  });

  app.post('/api/auth/logout', async (request) => {
    const header = request.headers.authorization ?? '';
    await logout(app.pool, header.startsWith('Bearer ') ? header.slice(7) : '');
    return { status: 'ok' };
  });

  app.get('/api/auth/me', async (request) => ({
    id: request.scope.userId,
    organizationId: request.scope.organizationId,
    role: request.scope.role,
    fullName: request.scope.fullName,
  }));
}
