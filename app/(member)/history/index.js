import { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, ActivityIndicator, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { listLoggedExercises } from "../../../lib/programming/memberPlan";
import { formatDateMDY } from "../../../lib/formatDate";
import { fonts, colors } from "../../../lib/theme";

export default function HistoryIndex() {
  const { profile, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState(null);

  const load = useCallback(async () => {
    const data = await listLoggedExercises(profile.id);
    setRows(data);
  }, [profile.id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View className="flex-1 bg-white px-6 pb-8" style={{ paddingTop: insets.top + 6 }}>
      <Text className="mb-4 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
        My History
      </Text>
      {!rows ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.exercise.id}
          ListEmptyComponent={
            <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
              No logged results yet — once you log a set, it'll show up here.
            </Text>
          }
          renderItem={({ item }) => (
            <Link href={`/(member)/history/${item.exercise.id}`} asChild>
              <Pressable className="mb-2 rounded-lg border border-stone-200 px-4 py-3">
                <Text style={{ fontFamily: fonts.sansMedium }} className="text-stone-700">
                  {item.exercise.name}
                </Text>
                <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                  Last logged {formatDateMDY(item.lastDate)}
                </Text>
              </Pressable>
            </Link>
          )}
          ListFooterComponent={
            <Pressable
              onPress={signOut}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Sign out"
              className="mt-6 self-start rounded-lg border border-stone-300 px-5 py-3"
            >
              <Text style={{ fontFamily: fonts.sansMedium }} className="text-stone-700">
                Sign out
              </Text>
            </Pressable>
          }
        />
      )}
    </View>
  );
}
