import { defineCollection } from '@/core/local/unit-of-work';
import type { AppNotification } from './notification-rules';

export const NOTIFICATIONS_COLLECTION = 'health-notifications';
export const notificationsRef = defineCollection<AppNotification>(NOTIFICATIONS_COLLECTION);
