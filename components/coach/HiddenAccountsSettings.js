import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator } from "react-native";
import { useAuth } from "../../lib/auth/AuthProvider";
import { listHiddenAccounts, listHideableAccounts, hideAccount, unhideAccount } from "../../lib/programming/hiddenAccounts";
import { toastError, toastSuccess } from "../../lib/toast";
import { fonts, colors } from "../../lib/theme";

// Settings -> Hidden. Test accounts kept landing on the dashboard's lists
// ("girls not in this week", SPC due, nutrition not seen), so this tab takes
// them off. It's deliberately a Settings tab and not a toggle on each client
// page: it's an admin chore done a handful of times, not a client property a
// coach should trip over.
//
// Hidden means the DASHBOARD ignores them, nothing more. The Clients page,
// the live board and every automation still treat them normally, so testing
// a flow with one still works.

const MAX_MATCHES = 8;

export function HiddenAccountsSettings() {
  const { profile } = useAuth();
  const [hidden, setHidden] = useState(null);
  const [everyone, setEveryone] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [h, all] = await Promise.all([listHiddenAccounts(), listHideableAccounts()]);
      setHidden(h);
      setEveryone(all);
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !everyone) return [];
    const hiddenIds = new Set((hidden ?? []).map((h) => h.id));
    return everyone
      .filter((u) => !hiddenIds.has(u.id))
      .filter((u) => (u.name ?? "").toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q))
      .slice(0, MAX_MATCHES);
  }, [query, everyone, hidden]);

  const handleHide = async (user) => {
    setBusyId(user.id);
    try {
      await hideAccount(user.id, profile?.id);
      setQuery("");
      toastSuccess(`${user.name ?? user.email} is hidden from the dashboard.`);
      await load();
    } catch (err) {
      toastError(err.message ?? String(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleUnhide = async (user) => {
    setBusyId(user.id);
    try {
      await unhideAccount(user.id);
      toastSuccess(`${user.name ?? user.email} is back on the dashboard.`);
      await load();
    } catch (err) {
      toastError(err.message ?? String(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View className="rounded-xl border border-stone-200 p-5">
      <Text className="mb-1 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.6 }}>
        Hidden accounts
      </Text>
      <Text className="mb-4 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
        Test accounts you don't want counted. They drop off every dashboard number and list, like girls not in this week
        and SPC due. They still show on the Clients page and work normally everywhere else.
      </Text>

      {loadError ? (
        <View className="py-2">
          <Text className="mb-3 text-sm text-red-700" style={{ fontFamily: fonts.sans }}>
            Couldn't load this list. {loadError}
          </Text>
          <Pressable onPress={load} className="self-start rounded-lg border border-primary px-4 py-2">
            <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>Try again</Text>
          </Pressable>
        </View>
      ) : hidden === null ? (
        <ActivityIndicator color={colors.primary} style={{ alignSelf: "flex-start", marginVertical: 8 }} />
      ) : (
        <>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or email to hide someone"
            placeholderTextColor="#a8a29e"
            autoCapitalize="none"
            autoCorrect={false}
            className="rounded-lg border border-stone-300 px-3 py-2.5 text-sm text-stone-700"
            style={{ fontFamily: fonts.sans, minWidth: 0 }}
          />

          {query.trim() !== "" && (
            <View className="mt-2 rounded-lg border border-stone-200">
              {matches.length === 0 ? (
                <Text className="px-3 py-3 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
                  No match.
                </Text>
              ) : (
                matches.map((u, i) => (
                  <AccountRow
                    key={u.id}
                    user={u}
                    first={i === 0}
                    actionLabel="Hide"
                    busy={busyId === u.id}
                    disabled={busyId !== null}
                    onPress={() => handleHide(u)}
                  />
                ))
              )}
            </View>
          )}

          <Text className="mb-1 mt-6 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.6 }}>
            Hidden now ({hidden.length})
          </Text>
          {hidden.length === 0 ? (
            <Text className="py-3 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
              Nobody is hidden. Everyone shows on the dashboard.
            </Text>
          ) : (
            hidden.map((u, i) => (
              <AccountRow
                key={u.id}
                user={u}
                first={i === 0}
                actionLabel="Unhide"
                busy={busyId === u.id}
                disabled={busyId !== null}
                onPress={() => handleUnhide(u)}
              />
            ))
          )}
        </>
      )}
    </View>
  );
}

function AccountRow({ user, first, actionLabel, busy, disabled, onPress }) {
  const staff = user.role === "admin" || user.role === "coach";
  return (
    <View
      className="flex-row items-center justify-between gap-4 px-3 py-3"
      style={first ? undefined : { borderTopWidth: 1, borderTopColor: "#f1efed" }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text className="text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }} numberOfLines={1}>
          {user.name || user.email || "Unnamed"}
          {staff ? <Text className="text-stone-400" style={{ fontFamily: fonts.sans }}>{user.role === "admin" ? "  Admin" : "  Coach"}</Text> : null}
        </Text>
        {user.email && user.name ? (
          <Text className="mt-0.5 text-xs text-stone-500" style={{ fontFamily: fonts.sans }} numberOfLines={1}>
            {user.email}
          </Text>
        ) : null}
      </View>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={{ opacity: disabled ? 0.5 : 1 }}
        className="rounded-lg border border-primary px-4 py-2"
      >
        <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>{busy ? "Saving…" : actionLabel}</Text>
      </Pressable>
    </View>
  );
}
