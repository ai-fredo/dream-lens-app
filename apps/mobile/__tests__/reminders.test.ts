// In-memory double for expo-secure-store, matching the pattern in
// dreamQueue.test.ts (mock-factory hoisting only allows referencing
// out-of-scope variables whose name starts with "mock").
const mockSecureStoreMap = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn((key: string) => Promise.resolve(mockSecureStoreMap.get(key) ?? null)),
  setItemAsync: jest.fn((key: string, value: string) => {
    mockSecureStoreMap.set(key, value);
    return Promise.resolve();
  }),
  deleteItemAsync: jest.fn((key: string) => {
    mockSecureStoreMap.delete(key);
    return Promise.resolve();
  }),
}));

const mockGetPermissionsAsync = jest.fn();
const mockRequestPermissionsAsync = jest.fn();
const mockScheduleNotificationAsync = jest.fn();
const mockCancelAllScheduledNotificationsAsync = jest.fn();

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissionsAsync(...args),
  requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissionsAsync(...args),
  scheduleNotificationAsync: (...args: unknown[]) => mockScheduleNotificationAsync(...args),
  cancelAllScheduledNotificationsAsync: (...args: unknown[]) => mockCancelAllScheduledNotificationsAsync(...args),
  SchedulableTriggerInputTypes: { CALENDAR: 'calendar' },
}));

import * as SecureStore from 'expo-secure-store';
import { reminders } from '../src/services/reminders';

describe('reminders', () => {
  beforeEach(() => {
    mockSecureStoreMap.clear();
    jest.clearAllMocks();
    mockGetPermissionsAsync.mockResolvedValue({ granted: true });
    mockRequestPermissionsAsync.mockResolvedValue({ granted: true });
    mockScheduleNotificationAsync.mockResolvedValue('notification-id-1');
    mockCancelAllScheduledNotificationsAsync.mockResolvedValue(undefined);
  });

  describe('schedule', () => {
    it('requests permission and schedules a daily calendar trigger at hour/minute', async () => {
      mockGetPermissionsAsync.mockResolvedValue({ granted: false });

      const result = await reminders.schedule({ hour: 7, minute: 30 });

      expect(result).toEqual({ granted: true });
      expect(mockRequestPermissionsAsync).toHaveBeenCalled();
      expect(mockCancelAllScheduledNotificationsAsync).toHaveBeenCalled();
      expect(mockScheduleNotificationAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({
            body: 'Your dream is waiting. Record it before it fades.',
          }),
          trigger: expect.objectContaining({
            type: 'calendar',
            hour: 7,
            minute: 30,
            repeats: true,
          }),
        }),
      );
    });

    it('cancels any existing scheduled notification before scheduling the new one, in order', async () => {
      const callOrder: string[] = [];
      mockCancelAllScheduledNotificationsAsync.mockImplementation(async () => {
        callOrder.push('cancel');
      });
      mockScheduleNotificationAsync.mockImplementation(async () => {
        callOrder.push('schedule');
        return 'notification-id-1';
      });

      await reminders.schedule({ hour: 8, minute: 0 });

      expect(callOrder).toEqual(['cancel', 'schedule']);
    });

    it('returns granted:false without scheduling when permission is denied', async () => {
      mockGetPermissionsAsync.mockResolvedValue({ granted: false });
      mockRequestPermissionsAsync.mockResolvedValue({ granted: false });

      const result = await reminders.schedule({ hour: 7, minute: 0 });

      expect(result).toEqual({ granted: false });
      expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
    });

    it('does not re-request permission when already granted', async () => {
      mockGetPermissionsAsync.mockResolvedValue({ granted: true });

      await reminders.schedule({ hour: 7, minute: 0 });

      expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
    });

    it('persists the chosen time and enabled flag to secure-store', async () => {
      await reminders.schedule({ hour: 6, minute: 45 });

      const stored = await SecureStore.getItemAsync('dreamlens.reminder');
      expect(stored).toBeTruthy();
      expect(JSON.parse(stored as string)).toEqual({ enabled: true, hour: 6, minute: 45 });
    });

    it('does not persist enabled:true when permission is denied', async () => {
      mockGetPermissionsAsync.mockResolvedValue({ granted: false });
      mockRequestPermissionsAsync.mockResolvedValue({ granted: false });

      await reminders.schedule({ hour: 6, minute: 45 });

      const stored = await SecureStore.getItemAsync('dreamlens.reminder');
      expect(stored).toBeNull();
    });
  });

  describe('cancel', () => {
    it('cancels all scheduled notifications and persists enabled:false', async () => {
      await reminders.schedule({ hour: 7, minute: 0 });

      await reminders.cancel();

      expect(mockCancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(2); // once from schedule(), once from cancel()
      const stored = await SecureStore.getItemAsync('dreamlens.reminder');
      expect(JSON.parse(stored as string)).toMatchObject({ enabled: false });
    });
  });

  describe('getSaved', () => {
    it('returns null when nothing has been persisted yet', async () => {
      const saved = await reminders.getSaved();
      expect(saved).toBeNull();
    });

    it('rehydrates the persisted time and enabled flag', async () => {
      await reminders.schedule({ hour: 9, minute: 15 });

      const saved = await reminders.getSaved();

      expect(saved).toEqual({ enabled: true, hour: 9, minute: 15 });
    });
  });
});
