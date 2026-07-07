import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';

/**
 * Morning-ritual local notification (design spec Screen 7 / Task 12).
 *
 * A single daily reminder, scheduled entirely on-device — no server
 * involvement, no push token. Tapping the notification just foregrounds the
 * app: Record IS the signed-in home screen (see RootNavigator), so there is
 * no separate deep-link route to route to.
 *
 * The chosen time and whether the reminder is enabled are persisted to
 * expo-secure-store under `dreamlens.reminder` so SettingsScreen can
 * re-hydrate its toggle/time control on mount without re-querying the OS
 * notification scheduler.
 */

const STORAGE_KEY = 'dreamlens.reminder';
const REMINDER_BODY = 'Your dream is waiting. Record it before it fades.';

export interface ReminderTime {
  hour: number;
  minute: number;
}

export interface SavedReminder extends ReminderTime {
  enabled: boolean;
}

export type ScheduleResult = { granted: true } | { granted: false };

async function persist(saved: SavedReminder): Promise<void> {
  await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(saved));
}

/**
 * Requests notification permission (if not already granted), then replaces
 * any previously-scheduled reminder with a new daily calendar-trigger
 * notification at the given hour/minute. Denied permission short-circuits
 * before touching the scheduler and leaves any previously-persisted
 * enabled:true state untouched — the caller (SettingsScreen) is responsible
 * for snapping its toggle back to off.
 */
async function schedule(time: ReminderTime): Promise<ScheduleResult> {
  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.granted ? existing : await Notifications.requestPermissionsAsync();
  if (!permission.granted) {
    return { granted: false };
  }

  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.scheduleNotificationAsync({
    content: {
      body: REMINDER_BODY,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
      hour: time.hour,
      minute: time.minute,
      repeats: true,
    },
  });

  await persist({ enabled: true, hour: time.hour, minute: time.minute });

  return { granted: true };
}

/** Cancels the scheduled reminder and persists enabled:false (keeping the
 * last-chosen time so re-enabling defaults back to it). */
async function cancel(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();

  const saved = await getSaved();
  await persist({ enabled: false, hour: saved?.hour ?? 8, minute: saved?.minute ?? 0 });
}

/** Rehydrates the persisted reminder state, or null if never set. */
async function getSaved(): Promise<SavedReminder | null> {
  const raw = await SecureStore.getItemAsync(STORAGE_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as SavedReminder;
}

export const reminders = { schedule, cancel, getSaved };
