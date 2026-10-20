import { type User } from '../services/auth';
import { type EmailMetadata } from '../services/email';

const USER_KEY = 'app_cache_user';
const UNREAD_COUNT_KEY = 'app_cache_unread_count';
const EMAILS_KEY_PREFIX = 'app_cache_emails_';

export const getCachedUser = (): User | null => {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const setCachedUser = (user: User | null): void => {
  try {
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_KEY);
    }
  } catch {}
};

export const getCachedUnreadCount = (): number => {
  try {
    const raw = localStorage.getItem(UNREAD_COUNT_KEY);
    return raw !== null ? Number(raw) : 0;
  } catch {
    return 0;
  }
};

export const setCachedUnreadCount = (count: number): void => {
  try {
    localStorage.setItem(UNREAD_COUNT_KEY, String(count));
  } catch {}
};

export const getCachedEmails = (tab: string): EmailMetadata[] => {
  try {
    const raw = localStorage.getItem(`${EMAILS_KEY_PREFIX}${tab}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const setCachedEmails = (tab: string, emails: EmailMetadata[]): void => {
  try {
    localStorage.setItem(`${EMAILS_KEY_PREFIX}${tab}`, JSON.stringify(emails));
  } catch {}
};

export const clearAppCache = (): void => {
  try {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(UNREAD_COUNT_KEY);
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(EMAILS_KEY_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {}
};
