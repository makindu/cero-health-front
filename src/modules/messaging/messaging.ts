import { LOCAL_USERS } from '@/core/local/roles';
import { runUnit } from '@/core/local/unit-of-work';
import { BusinessRuleError } from '../_shared/business-error';
import { MessagingError } from './messaging-rules';
import { referenceFromApi } from '../_shared/reference-data';
import { apiMessaging } from './messaging-api';
import { createMessagingService } from './messaging-service';

/** Les refus de la messagerie sont présentés comme les autres refus métier (`common:business.messaging.<code>`). */
const localMessaging = createMessagingService({
  run: async (fn) => {
    try {
      return await runUnit(fn);
    } catch (e) {
      if (e instanceof MessagingError) throw new BusinessRuleError(`messaging.${e.code}`, e.params, e.code === 'notFound' ? 'conflict' : 'validation');
      throw e;
    }
  },
  directory: () => LOCAL_USERS.map((u) => ({ id: u.id, name: u.name, role: u.role })),
  newId: (prefix) => `${prefix}-${globalThis.crypto.randomUUID().slice(0, 12)}`,
});

/** Mode API : le serveur fait foi. Mode local : le service du navigateur. Choix fait à chaque appel. */
export const messaging: typeof localMessaging = new Proxy(localMessaging, {
  get: (target, key: string) => (referenceFromApi() ? (apiMessaging as Record<string, unknown>)[key] : (target as Record<string, unknown>)[key]),
});
