import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Switch, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { BottomTabBarHeightContext } from "expo-router/build/react-navigation/bottom-tabs";
import { useAuth } from "../../lib/auth/AuthProvider";
import { supabase } from "../../lib/supabase/client";
import { updateOwnNotificationPrefs } from "../../lib/notifications/memberPrefs";
import { useShowMessageBubble, setShowMessageBubble } from "../../lib/messageBubblePref";
import { isMessagingEnabledForUser } from "../../lib/programming/messagingSettings";
import { fonts, colors } from "../../lib/theme";
import { toastError, toastSuccess } from "../../lib/toast";
import { useKeyboardHeight, useScrollToKeyboard, DONE_BAR_HEIGHT } from "../../lib/scrollToKeyboard";

const CANVAS = "#faf8f6";

// design_handoff_v2_settings_nutrition — new member-facing Settings screen,
// reached via the gear icon on My Week's header (app/(member)/index.js).
// Not a 5th tab; registered as a hidden route in _layout.js, same pattern
// as plan-block/plan-spc-block.

function Card({ children }) {
  return (
    <View
      className="mb-4 p-4"
      style={{ borderRadius: 16, borderWidth: 1, borderColor: "#ece7e1", backgroundColor: "white", shadowColor: "#44403c", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 1 }}
    >
      {children}
    </View>
  );
}

function CardTitle({ children }) {
  return (
    <Text
      maxFontSizeMultiplier={1.1}
      style={{ fontFamily: fonts.sansSemiBold, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: "#a8a29e", marginBottom: 12 }}
    >
      {children}
    </Text>
  );
}

function Row({ label, value, actionLabel, onPress, last }) {
  return (
    <View className="flex-row items-center justify-between py-3" style={last ? undefined : { borderBottomWidth: 1, borderBottomColor: "#f1efed" }}>
      <View>
        <Text className="text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
          {label}
        </Text>
        {value ? (
          <Text className="mt-0.5 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
            {value}
          </Text>
        ) : null}
      </View>
      {actionLabel ? (
        <Pressable onPress={onPress} hitSlop={8}>
          <Text className="text-sm" style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>
            {actionLabel} ›
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ToggleRow({ label, description, value, onValueChange, last }) {
  return (
    <View className="flex-row items-center justify-between gap-4 py-3" style={last ? undefined : { borderBottomWidth: 1, borderBottomColor: "#f1efed" }}>
      <View className="flex-1">
        <Text className="text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
          {label}
        </Text>
        <Text className="mt-0.5 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
          {description}
        </Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ false: "#e7e5e4", true: "#4d6142" }} thumbColor="#ffffff" />
    </View>
  );
}

// Inline text-entry field, expand/collapse — used for both the email and
// password change rows so neither needs its own separate route/modal.
function InlineChangeForm({ visible, placeholder, secure, submitLabel, onSubmit, onCancel, scrollViewRef, scrollOffsetRef }) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const scrollFieldIntoView = useScrollToKeyboard(scrollViewRef, scrollOffsetRef);

  if (!visible) return null;

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSubmit(value);
      setValue("");
      onCancel();
    } catch (err) {
      setError(err.message ?? String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="mb-3 mt-1">
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={setValue}
        onFocus={() => scrollFieldIntoView(inputRef.current)}
        placeholder={placeholder}
        secureTextEntry={secure}
        autoCapitalize="none"
        // Explicit, so babel/noAutofillPlugin.js's blanket "off" doesn't stop
        // a password manager offering to save the change here.
        autoComplete={secure ? "new-password" : "email"}
        textContentType={secure ? "newPassword" : "emailAddress"}
        className="mb-2 rounded-lg border border-stone-300 px-4 py-3"
        style={{ fontFamily: fonts.sans }}
      />
      {error ? (
        <Text className="mb-2 text-xs text-red-600" style={{ fontFamily: fonts.sans }}>
          {error}
        </Text>
      ) : null}
      <View className="flex-row gap-2">
        <Pressable onPress={onCancel} className="rounded-lg border border-stone-300 px-4 py-2.5">
          <Text style={{ fontFamily: fonts.sansMedium }}>Cancel</Text>
        </Pressable>
        <Pressable onPress={handleSubmit} disabled={saving || !value} style={{ opacity: saving || !value ? 0.5 : 1 }} className="rounded-lg bg-primary px-4 py-2.5">
          <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
            {saving ? "Saving…" : submitLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const CONFIRM_TEXT = "DELETE";

function DeleteAccountModal({ visible, email, onClose, onConfirm, scrollViewRef, scrollOffsetRef }) {
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const scrollFieldIntoView = useScrollToKeyboard(scrollViewRef, scrollOffsetRef);

  if (!visible) return null;

  const handleConfirm = async () => {
    setDeleting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err.message ?? String(err));
      setDeleting(false);
    }
  };

  return (
    <View className="mt-2 rounded-lg p-4" style={{ backgroundColor: "#fdece5", borderWidth: 1, borderColor: "#f5c9b8" }}>
      <Text className="mb-2 text-sm" style={{ fontFamily: fonts.sansMedium, color: "#b23a22" }}>
        Type {CONFIRM_TEXT} to confirm. This permanently deletes {email ? `${email}'s` : "your"} account, logs, and photos — it can't be undone.
      </Text>
      <TextInput
        ref={inputRef}
        value={typed}
        onChangeText={setTyped}
        onFocus={() => scrollFieldIntoView(inputRef.current)}
        placeholder={CONFIRM_TEXT}
        autoCapitalize="characters"
        className="mb-2 rounded-lg border border-stone-300 bg-white px-4 py-3"
        style={{ fontFamily: fonts.sans }}
      />
      {error ? (
        <Text className="mb-2 text-xs text-red-600" style={{ fontFamily: fonts.sans }}>
          {error}
        </Text>
      ) : null}
      <View className="flex-row gap-2">
        <Pressable onPress={onClose} className="rounded-lg border border-stone-300 bg-white px-4 py-2.5">
          <Text style={{ fontFamily: fonts.sansMedium }}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={handleConfirm}
          disabled={typed !== CONFIRM_TEXT || deleting}
          className="rounded-lg px-4 py-2.5"
          style={{ opacity: typed !== CONFIRM_TEXT || deleting ? 0.5 : 1, backgroundColor: "#b23a22" }}
        >
          <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
            {deleting ? "Deleting…" : "Delete account"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function MemberSettings() {
  const { profile, signOut } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [changingEmail, setChangingEmail] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [notifValues, setNotifValues] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const showMessageBubble = useShowMessageBubble();
  // Hidden until confirmed on — same default as every other messaging
  // entry point (FloatingMessageBubble, My Week's header icon).
  const [messagingOn, setMessagingOn] = useState(false);

  // The Danger zone's Delete-account field sits at the very bottom of this
  // page — exactly the "focused field near the end of scrollable content"
  // case lib/scrollToKeyboard.js's own comment warns about, since a
  // ScrollView can't scroll further than its own content height allows.
  // Extra bottom padding (keyboardPadding below) guarantees there's always
  // enough room to scroll it into view; tabBarHeight is subtracted since
  // this screen sits inside (member)'s Tabs navigator, whose bar occupies
  // space the keyboard visually covers but doesn't actually resize around.
  const scrollViewRef = useRef(null);
  const scrollOffsetRef = useRef(0);
  const keyboardHeight = useKeyboardHeight();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const occludedHeight = keyboardHeight > 0 ? keyboardHeight + DONE_BAR_HEIGHT : 0;
  const keyboardPadding = Math.max(0, occludedHeight - tabBarHeight);

  useEffect(() => {
    if (!profile) return;
    setNotifValues({
      dailyLogReminder: profile.notify_daily_log_reminder ?? true,
      checkinAvailable: profile.notify_checkin_available ?? true,
      coachMessages: profile.notify_coach_messages ?? true,
    });
  }, [profile]);

  // useFocusEffect, not mount-only — this screen stays mounted as a Tabs
  // child, so a coach reassignment should show up on the next visit rather
  // than only after a full app restart.
  useFocusEffect(
    useCallback(() => {
      if (!profile) return;
      isMessagingEnabledForUser(profile.id)
        .then(setMessagingOn)
        .catch(() => setMessagingOn(false));
    }, [profile])
  );

  const handleChangeEmail = async (email) => {
    const { error } = await supabase.auth.updateUser({ email });
    if (error) throw error;
    toastSuccess("Check your email to confirm the change.");
  };

  const handleChangePassword = async (password) => {
    if (password.length < 8) throw new Error("Password must be at least 8 characters.");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    toastSuccess("Password updated.");
  };

  const handleToggleNotif = async (key, value) => {
    const previous = notifValues;
    const next = { ...notifValues, [key]: value };
    setNotifValues(next);
    try {
      await updateOwnNotificationPrefs(next);
    } catch (err) {
      setNotifValues(previous);
      toastError("Failed to save", err);
    }
  };

  const handleDeleteAccount = async () => {
    const { error } = await supabase.functions.invoke("delete-account");
    if (error) throw error;
    await signOut();
    router.replace("/login");
  };

  if (!profile || !notifValues) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: CANVAS }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollViewRef}
      className="flex-1"
      style={{ backgroundColor: CANVAS }}
      contentContainerClassName="px-5"
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 32 + keyboardPadding }}
      keyboardShouldPersistTaps="handled"
      onScroll={(e) => {
        scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
      }}
      scrollEventThrottle={16}
    >
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.push("/(member)"))} className="mb-3 self-start">
        <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>‹ Back</Text>
      </Pressable>
      <Text className="mb-5" style={{ fontFamily: fonts.display, fontSize: 25, color: colors.primary }}>
        Settings
      </Text>

      <Card>
        <CardTitle>Account</CardTitle>
        <Row label="Email" value={profile.email} actionLabel="Change" onPress={() => setChangingEmail((v) => !v)} />
        <InlineChangeForm
          visible={changingEmail}
          placeholder="New email address"
          submitLabel="Save"
          onSubmit={handleChangeEmail}
          onCancel={() => setChangingEmail(false)}
          scrollViewRef={scrollViewRef}
          scrollOffsetRef={scrollOffsetRef}
        />
        <Row label="Password" actionLabel="Change" onPress={() => setChangingPassword((v) => !v)} last={!changingPassword} />
        <InlineChangeForm
          visible={changingPassword}
          placeholder="New password"
          secure
          submitLabel="Save"
          onSubmit={handleChangePassword}
          onCancel={() => setChangingPassword(false)}
          scrollViewRef={scrollViewRef}
          scrollOffsetRef={scrollOffsetRef}
        />
      </Card>

      <Card>
        <CardTitle>Notifications</CardTitle>
        <ToggleRow
          label="Daily log reminder"
          description="An evening nudge if today's nutrition log isn't finalized."
          value={notifValues.dailyLogReminder}
          onValueChange={(v) => handleToggleNotif("dailyLogReminder", v)}
        />
        <ToggleRow
          label="Weekly check-in available"
          description="Sunday announcement that the new week's check-in is open."
          value={notifValues.checkinAvailable}
          onValueChange={(v) => handleToggleNotif("checkinAvailable", v)}
          last={!messagingOn}
        />
        {messagingOn ? (
          <ToggleRow
            label="Coach messages"
            description="New comments from your coach."
            value={notifValues.coachMessages}
            onValueChange={(v) => handleToggleNotif("coachMessages", v)}
            last
          />
        ) : null}
      </Card>

      {/* Both messaging settings hide whenever messaging is off for this
          member — either the admin kill switch, or an audience scope that
          doesn't include any of their memberships (same audience-aware
          check the bubble/header icon/route already use). Settings for a
          feature you can't reach are just confusing. */}
      {messagingOn ? (
        <Card>
          <CardTitle>Messaging</CardTitle>
          <ToggleRow
            label="Show message bubble"
            description="A floating button to message your coach, always on screen. Turning this off doesn't remove messaging — you can still reach it from the chat icon on My Week."
            value={showMessageBubble}
            onValueChange={setShowMessageBubble}
            last
          />
        </Card>
      ) : null}

      {/* The "About / Assigned coach" card was removed in
          design_handoff_member_mobile_v5 (6a) — an assigned coach only
          exists for nutrition clients, and it isn't a setting. */}

      {/* app/support.js existed as a route with no way to reach it from
          inside the app — it was only ever the App Store's support URL. */}
      <Card>
        <CardTitle>Help</CardTitle>
        <Pressable onPress={() => router.push("/support")} className="flex-row items-center justify-between py-1">
          <Text style={{ fontFamily: fonts.sansMedium, color: "#44403c" }}>Contact support</Text>
          <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>›</Text>
        </Pressable>
      </Card>

      <Pressable onPress={signOut} className="mb-4 items-center border border-stone-300 py-3.5" style={{ borderRadius: 16 }}>
        <Text style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>Sign out</Text>
      </Pressable>

      <View className="p-4" style={{ borderRadius: 16, backgroundColor: "#fdece5", borderWidth: 1, borderColor: "#f5c9b8" }}>
        <CardTitle>Danger zone</CardTitle>
        <Text className="mb-3 text-sm" style={{ fontFamily: fonts.sans, color: "#b23a22" }}>
          Permanently deletes your account, logs, and photos. This can't be undone.
        </Text>
        {!deleteOpen ? (
          <Pressable onPress={() => setDeleteOpen(true)} className="self-start rounded-lg px-4 py-2.5" style={{ backgroundColor: "#b23a22" }}>
            <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
              Delete account
            </Text>
          </Pressable>
        ) : (
          <DeleteAccountModal
            visible={deleteOpen}
            email={profile.email}
            onClose={() => setDeleteOpen(false)}
            onConfirm={handleDeleteAccount}
            scrollViewRef={scrollViewRef}
            scrollOffsetRef={scrollOffsetRef}
          />
        )}
      </View>
    </ScrollView>
  );
}
