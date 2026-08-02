import { View, Text, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth/AuthProvider";
import { fonts, colors } from "../../lib/theme";

const ROWS = [
  { href: "/(coach)/blocks", title: "Group Programs", subtitle: "Flagship & Better With Age" },
  { href: "/(coach)/spc", title: "SPC", subtitle: "Individualized, staggered blocks", permission: "can_view_spc" },
];

export default function Programs() {
  const router = useRouter();
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();
  const isAdmin = profile?.role === "admin";
  const rows = ROWS.filter((row) => isAdmin || !row.permission || profile?.[row.permission]);

  return (
    <View className="flex-1 bg-white px-6 py-8" style={{ paddingTop: insets.top + 20 }}>
      <Text className="mb-6 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
        Programs
      </Text>
      {rows.map((row) => (
        <Pressable
          key={row.href}
          onPress={() => router.push(row.href)}
          className="mb-3 rounded-2xl border border-stone-200 px-5 py-4"
        >
          <Text style={{ fontFamily: fonts.sansSemiBold }} className="text-stone-700">
            {row.title}
          </Text>
          <Text className="mt-1 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
            {row.subtitle}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
