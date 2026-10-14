import { join } from 'node:path';
import { loadCredentials } from './config/env.js';
import { accountKey, dataDirectory } from './config/paths.js';
import { QQBackend } from './mail/qq-backend.js';
import { MailService } from './mail/service.js';
import type { MailBackend, StateStorePort } from './mail/types.js';
import { StateStore } from './storage/state-store.js';

export async function createService(dependencies: { backend?: MailBackend; store?: StateStorePort } = {}) {
  let backend = dependencies.backend;
  if (!backend) {
    const credentials = await loadCredentials();
    backend = new QQBackend(credentials.account, credentials.authorizationCode);
  }
  const store = dependencies.store ?? new StateStore(join(dataDirectory(), accountKey(backend.account)));
  return new MailService(backend, store);
}
