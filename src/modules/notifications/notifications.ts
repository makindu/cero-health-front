import { runUnit } from '@/core/local/unit-of-work';
import { createNotificationService } from './notification-service';

export const notifications = createNotificationService({ run: (fn) => runUnit(fn) });
