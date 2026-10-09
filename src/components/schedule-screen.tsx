import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

type ScheduleScreenProps = {
  title: string;
  emptyMessage: string;
};

export function ScheduleScreen({ title, emptyMessage }: ScheduleScreenProps) {
  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <ThemedView style={styles.content}>
          <ThemedText type="subtitle" accessibilityRole="header">
            {title}
          </ThemedText>
          <ThemedText themeColor="textSecondary">{emptyMessage}</ThemedText>
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
});