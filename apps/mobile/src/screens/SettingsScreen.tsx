import { useCallback, useEffect, useState } from 'react';
import { Linking, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DateTimePicker from '@react-native-community/datetimepicker';
import Constants from 'expo-constants';
import { Pill } from '../components/Pill';
import { PrimaryButton } from '../components/PrimaryButton';
import { TextButton } from '../components/TextButton';
import { ToggleRow } from '../components/ToggleRow';
import { Colors, Spacing, Typography } from '../design/tokens';
import type { RootStackParamList } from '../navigation/types';
import { api } from '../services/api';
import { dreamQueue } from '../services/dreamQueue';
import { reminders } from '../services/reminders';
import { useAuthStore } from '../store/authStore';

type Nav = NativeStackNavigationProp<RootStackParamList>;

// Placeholder URL — swap for the real published privacy policy once it
// exists (engineering-standards SECTION 14 pattern: label stubs clearly and
// don't block on the real asset).
const PRIVACY_POLICY_URL = 'https://dreamlens.app/privacy';

const DEFAULT_REMINDER_HOUR = 8;
const DEFAULT_REMINDER_MINUTE = 0;

/**
 * Screen 7 of the design spec: MORNING RITUAL / ACCOUNT / PRIVACY / ABOUT /
 * DANGER ZONE. See dreamlens-ui-design-spec.md lines 619-652 for the section
 * layout and lines 951-954 for the account-deletion modal microcopy.
 *
 * Subscription tier is hardcoded to 'free' — there is no mobile-facing
 * endpoint yet that surfaces user_profiles.subscription_tier. Swap this for
 * a real value once that field is exposed to the client.
 */
export function SettingsScreen() {
  const navigation = useNavigation<Nav>();
  const session = useAuthStore((state) => state.session);
  const signOut = useAuthStore((state) => state.signOut);

  const email = session?.user?.email ?? '';
  const tier: 'free' | 'pro' = 'free'; // TODO: source from user_profiles.subscription_tier once exposed.

  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState({
    hour: DEFAULT_REMINDER_HOUR,
    minute: DEFAULT_REMINDER_MINUTE,
  });
  const [reminderDenied, setReminderDenied] = useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [dreamCount, setDreamCount] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    reminders.getSaved().then((saved) => {
      if (saved) {
        setReminderEnabled(saved.enabled);
        setReminderTime({ hour: saved.hour, minute: saved.minute });
      }
    });
  }, []);

  const handleToggleReminder = useCallback(
    async (value: boolean) => {
      setReminderDenied(false);
      if (!value) {
        setReminderEnabled(false);
        await reminders.cancel();
        return;
      }

      const result = await reminders.schedule(reminderTime);
      if (result.granted) {
        setReminderEnabled(true);
      } else {
        setReminderEnabled(false);
        setReminderDenied(true);
      }
    },
    [reminderTime],
  );

  const handleTimeChange = useCallback(
    async (_event: unknown, date?: Date) => {
      if (!date) return;
      const time = { hour: date.getHours(), minute: date.getMinutes() };
      setReminderTime(time);
      if (reminderEnabled) {
        await reminders.schedule(time);
      }
    },
    [reminderEnabled],
  );

  const openDeleteModal = useCallback(() => {
    setDeleteError(null);
    setDeleteModalOpen(true);
    setDreamCount(null);
    api
      .get<{ id: string }[]>('/v1/dreams')
      .then((dreams) => setDreamCount(dreams.length))
      .catch(() => setDreamCount(null));
  }, []);

  const closeDeleteModal = useCallback(() => {
    setDeleteModalOpen(false);
    setDeleteError(null);
  }, []);

  const confirmDelete = useCallback(async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.del('/v1/account');
      await dreamQueue.clearAll();
      await signOut();
    } catch {
      setDeleteError("Couldn't delete your account. Try again.");
    } finally {
      setDeleting(false);
    }
  }, [signOut]);

  const timeAsDate = new Date();
  timeAsDate.setHours(reminderTime.hour, reminderTime.minute, 0, 0);

  const deleteModalTitle =
    dreamCount === null
      ? 'This will permanently delete all your dreams and your account. This cannot be undone.'
      : `This will permanently delete all ${dreamCount} dreams and your account. This cannot be undone.`;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} testID="settings-screen">
      <Text style={styles.eyebrow}>MORNING RITUAL</Text>
      <View style={styles.section}>
        <ToggleRow
          label="Reminder"
          value={reminderEnabled}
          onValueChange={handleToggleReminder}
          testID="reminder-toggle"
        />
        {reminderDenied ? (
          <View style={styles.deniedBlock}>
            <Text style={styles.deniedText}>
              Notifications are off for DreamLens.{' '}
              <Text style={styles.deniedLink} onPress={() => Linking.openSettings()}>
                Open Settings.
              </Text>
            </Text>
          </View>
        ) : null}
        {reminderEnabled ? (
          <View style={styles.timeRow}>
            <Text style={styles.timeLabel}>Reminder time</Text>
            <DateTimePicker
              testID="reminder-time-picker"
              value={timeAsDate}
              mode="time"
              onChange={handleTimeChange}
            />
          </View>
        ) : null}
      </View>

      <Text style={styles.eyebrow}>ACCOUNT</Text>
      <View style={styles.section}>
        <Text style={styles.emailText}>{email}</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Subscription</Text>
          <Pill label={tier === 'free' ? 'Free' : 'Pro'} tone={tier === 'free' ? 'neutral' : 'gold'} />
        </View>
        {tier === 'free' ? (
          <TextButton label="Upgrade to Pro" onPress={() => navigation.navigate('Paywall')} tone="gold" />
        ) : null}
        <TextButton label="Sign out" onPress={() => signOut()} />
      </View>

      <Text style={styles.eyebrow}>PRIVACY</Text>
      <View style={styles.section}>
        <TextButton label="Privacy Policy" onPress={() => Linking.openURL(PRIVACY_POLICY_URL)} />
      </View>

      <Text style={styles.eyebrow}>ABOUT</Text>
      <View style={styles.section}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Version</Text>
          <Text style={styles.versionText}>{Constants.expoConfig?.version ?? '—'}</Text>
        </View>
        <Text style={styles.disclaimer}>
          DreamLens is a journaling and reflection tool. It is not a substitute for professional mental health
          care. If you are experiencing distress, please contact a qualified professional.
        </Text>
      </View>

      <View style={styles.dangerZone}>
        <TextButton
          label="Delete account and all dreams"
          onPress={openDeleteModal}
          tone="error"
          testID="delete-account-trigger"
        />
      </View>

      <Modal visible={deleteModalOpen} transparent animationType="fade" onRequestClose={closeDeleteModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard} testID="delete-account-modal">
            <Text style={styles.modalTitle}>{deleteModalTitle}</Text>
            {deleteError ? <Text style={styles.modalError}>{deleteError}</Text> : null}
            <View style={styles.modalActions}>
              <PrimaryButton label="Keep my account" onPress={closeDeleteModal} disabled={deleting} />
              <TextButton
                label="Delete everything"
                onPress={confirmDelete}
                tone="error"
                disabled={deleting}
                testID="confirm-delete-account"
              />
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.base,
  },
  content: {
    paddingBottom: Spacing[12],
  },
  eyebrow: {
    ...Typography.eyebrow.md,
    color: Colors.text.muted,
    marginLeft: Spacing[4],
    marginTop: Spacing[6],
    marginBottom: Spacing[2],
  },
  section: {
    paddingHorizontal: Spacing[4],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing[2],
  },
  rowLabel: {
    ...Typography.body.md,
    color: Colors.text.primary,
  },
  emailText: {
    ...Typography.label.md,
    color: Colors.text.secondary,
    paddingVertical: Spacing[2],
  },
  versionText: {
    ...Typography.label.md,
    color: Colors.text.muted,
    textAlign: 'right',
  },
  disclaimer: {
    ...Typography.body.sm,
    color: Colors.text.muted,
    fontStyle: 'italic',
    padding: Spacing[6],
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing[2],
  },
  timeLabel: {
    ...Typography.body.md,
    color: Colors.text.primary,
  },
  deniedBlock: {
    paddingBottom: Spacing[2],
  },
  deniedText: {
    ...Typography.body.sm,
    color: Colors.text.muted,
  },
  deniedLink: {
    color: Colors.text.gold,
  },
  dangerZone: {
    marginTop: Spacing[12],
    paddingHorizontal: Spacing[4],
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing[6],
  },
  modalCard: {
    width: '100%',
    backgroundColor: Colors.bg.elevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.bg.border,
    padding: Spacing[6],
  },
  modalTitle: {
    ...Typography.body.lg,
    color: Colors.text.primary,
    marginBottom: Spacing[6],
  },
  modalError: {
    ...Typography.body.sm,
    color: Colors.semantic.error,
    marginBottom: Spacing[4],
  },
  modalActions: {
    gap: Spacing[3],
  },
});
