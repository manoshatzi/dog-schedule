import { SymbolView } from "expo-symbols";
import type { ComponentProps } from "react";
import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import type { PaletteColors } from "@/constants/theme";
import { t, type StringKey } from "@/i18n";
import {
  getInitials,
  getMemberColor,
  type HouseholdMember,
  type TaskType,
} from "@/lib/tasks";

type SymbolName = ComponentProps<typeof SymbolView>["name"];

export const taskTypes: { type: TaskType; icon: SymbolName }[] = [
  {
    type: "walk",
    icon: {
      ios: "figure.walk",
      android: "directions_walk",
      web: "directions_walk",
    },
  },
  {
    type: "food",
    icon: { ios: "fork.knife", android: "restaurant", web: "restaurant" },
  },
  {
    type: "medicine",
    icon: { ios: "pills", android: "medication", web: "medication" },
  },
  {
    type: "potty",
    icon: { ios: "leaf", android: "psychiatry", web: "psychiatry" },
  },
  {
    type: "play",
    icon: { ios: "tennisball", android: "sports_baseball", web: "sports_baseball" },
  },
  {
    type: "grooming",
    icon: { ios: "scissors", android: "content_cut", web: "content_cut" },
  },
  {
    type: "vet",
    icon: { ios: "stethoscope", android: "stethoscope", web: "stethoscope" },
  },
  {
    type: "other",
    icon: { ios: "ellipsis", android: "more_horiz", web: "more_horiz" },
  },
];

export function getTypeLabel(type: TaskType) {
  return t(`type.${type}` as StringKey);
}

export function getTypeIcon(type: TaskType): SymbolName {
  return (taskTypes.find((item) => item.type === type) ?? taskTypes[7]).icon;
}

/** Type badge with an icon (letters don't translate; screens.md §4). */
export function TypeBadge({
  type,
  colors,
  muted,
}: {
  type: TaskType;
  colors: PaletteColors;
  muted?: boolean;
}) {
  return (
    <View
      accessibilityLabel={getTypeLabel(type)}
      style={[
        styles.typeBadge,
        { backgroundColor: muted ? colors.surface : colors.primarySoft },
      ]}
    >
      <SymbolView
        name={getTypeIcon(type)}
        tintColor={muted ? colors.muted : colors.primary}
        size={18}
      />
    </View>
  );
}

export function MemberAvatar({
  members,
  userId,
  name,
  size = 30,
}: {
  members: readonly HouseholdMember[];
  userId: string | null;
  name: string;
  size?: number;
}) {
  const color = getMemberColor(members, userId);
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color.background,
        },
      ]}
    >
      <ThemedText
        style={[
          styles.avatarText,
          { color: color.text, fontSize: size > 36 ? 15 : 12 },
        ]}
      >
        {getInitials(name)}
      </ThemedText>
    </View>
  );
}

/** Dashed "+" avatar for open (nobody claimed) tasks. */
export function OpenAvatar({ colors }: { colors: PaletteColors }) {
  return (
    <View style={[styles.openAvatar, { borderColor: colors.openText }]}>
      <SymbolView
        name={{ ios: "plus", android: "add", web: "add" }}
        tintColor={colors.openText}
        size={14}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  typeBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: { alignItems: "center", justifyContent: "center" },
  avatarText: { fontWeight: "700", lineHeight: 16 },
  openAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
});
