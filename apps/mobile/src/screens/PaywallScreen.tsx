import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { PrimaryButton } from '../components/PrimaryButton';
import { TextButton } from '../components/TextButton';
import { Colors, Spacing, Typography } from '../design/tokens';

const BENEFITS = [
  'Unlimited dreams',
  'Full pattern analysis',
  'Search across your journal',
  'Lifetime history',
];

/**
 * Upgrade-to-Pro paywall (design spec upsell surface; engineering-standards
 * SECTION 14 "Payment flow can be a placeholder screen that shows the
 * paywall UI without actual purchase flow. Label it clearly as a
 * placeholder.").
 *
 * This is a clearly-labeled stub: there is no purchase SDK, no RevenueCat
 * integration, and no purchase call anywhere in this file. "Continue" only
 * reveals a muted note explaining purchases aren't wired up yet — it never
 * mutates subscription state or calls the API. Reached from Settings'
 * "Upgrade to Pro" and the 402 UPGRADE_REQUIRED branch on dream submission
 * (Task 7 / ReviewScreen).
 */
export function PaywallScreen() {
  const navigation = useNavigation<{ goBack: () => void }>();
  const [showNote, setShowNote] = useState(false);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} testID="paywall-screen">
      <Text style={styles.eyebrow}>DREAMLENS PRO</Text>
      <Text style={styles.title}>See the full picture</Text>

      <View style={styles.benefitList}>
        {BENEFITS.map((benefit) => (
          <View key={benefit} style={styles.benefitRow}>
            <View style={styles.benefitDot} />
            <Text style={styles.benefitLabel}>{benefit}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.price}>$7.99/month or $59.99/year</Text>

      <View style={styles.actions}>
        <PrimaryButton label="Continue" onPress={() => setShowNote(true)} testID="paywall-continue" />
        {showNote ? (
          <Text style={styles.note} testID="paywall-unavailable-note">
            Purchases aren&apos;t available in this build yet.
          </Text>
        ) : null}
        <TextButton label="Not now" onPress={() => navigation.goBack()} testID="paywall-not-now" />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.base,
  },
  content: {
    paddingHorizontal: Spacing[6],
    paddingTop: Spacing[16],
    paddingBottom: Spacing[12],
  },
  eyebrow: {
    ...Typography.eyebrow.md,
    color: Colors.text.gold,
    marginBottom: Spacing[3],
  },
  title: {
    ...Typography.display.lg,
    color: Colors.text.primary,
    marginBottom: Spacing[8],
  },
  benefitList: {
    gap: Spacing[4],
    marginBottom: Spacing[8],
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  benefitDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.gold.primary,
    marginRight: Spacing[3],
  },
  benefitLabel: {
    ...Typography.body.lg,
    color: Colors.text.primary,
  },
  price: {
    ...Typography.label.lg,
    color: Colors.text.secondary,
    marginBottom: Spacing[8],
  },
  actions: {
    gap: Spacing[4],
    alignItems: 'center',
  },
  note: {
    ...Typography.body.sm,
    color: Colors.text.muted,
    textAlign: 'center',
  },
});
