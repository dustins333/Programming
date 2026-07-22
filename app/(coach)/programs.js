import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { fonts, colors } from "../../lib/theme";

const ROWS = [
  { href: "/(coach)/blocks", title: "Group Programs", subtitle: "Flagship & Better With Age" },
  { href: "/(coach)/spc", title: "SPC", subtitle: "Individualized, staggered blocks" },
];

export default function Programs() {
  const router = useRouter();

  return (
    <View className="flex-1 bg-white px-6 py-8">
      <Text className="mb-6 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
        Programs
      </Text>
      {ROWS.map((row) => (
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
