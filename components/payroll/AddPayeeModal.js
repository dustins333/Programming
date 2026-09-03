// Record pay for someone who isn't an app user — a cleaner, a contractor,
// a departed coach owed a final amount. Admin-only, opened from the review
// table for the period being reviewed.
//
// Deliberately a flat amount rather than the coach entry screen's category
// tiles: none of the rates (group session, SPC tier, admin hour) describe
// what this person did, and offering them would invite recording a
// cleaner's pay as coaching hours.
import { useState, useEffect } from "react";
import { View, Text, TextInput, Pressable, Modal, ScrollView, ActivityIndicator } from "react-native";
import { listNonAppPayees } from "../../lib/payroll/entries";
import { formatDateRange } from "../../lib/formatDate";
import { computePeriodEnd } from "../../lib/payroll/periods";
import { toastError } from "../../lib/toast";
import { fonts, colors } from "../../lib/theme";
import { NUMERIC_DONE_ID } from "../NumericInputAccessory";

function Label({ children, hint }) {
  return (
    <Text className="mb-1 text-sm" style={{ fontFamily: fonts.sansMedium, color: "#44403c" }}>
      {children}
      {hint ? <Text style={{ fontFamily: fonts.sans, color: "#a8a29e" }}> {hint}</Text> : null}
    </Text>
  );
}

const inputStyle = {
  fontFamily: fonts.sans,
  borderWidth: 1,
  borderColor: "#d6d3d1",
  borderRadius: 9,
  paddingVertical: 10,
  paddingHorizontal: 12,
};

export function AddPayeeModal({ visible, periodStart, onClose, onSubmit }) {
  const [payees, setPayees] = useState([]);
  const [loading, setLoading] = useState(true);
  // null = the "someone new" form. Otherwise the chosen existing payee.
  const [selected, setSelected] = useState(null);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSelected(null);
    setNewName("");
    setNewEmail("");
    setAmount("");
    setDescription("");
    setLoading(true);
    listNonAppPayees()
      .then((rows) => setPayees(rows))
      // A failed lookup must not block adding someone: the picker is a
      // convenience over the name/email fields, not a gate in front of them.
      .catch(() => setPayees([]))
      .finally(() => setLoading(false));
  }, [visible]);

  const parsedAmount = Number(amount);
  const amountValid = amount.trim() !== "" && Number.isFinite(parsedAmount) && parsedAmount > 0;
  const name = selected ? selected.name : newName.trim();
  const email = selected ? selected.email : newEmail.trim().toLowerCase();
  const ready = Boolean(name) && Boolean(email) && amountValid && Boolean(description.trim());

  const handleSave = async () => {
    if (!ready) {
      toastError(
        !name || !email
          ? "A name and an email are both needed"
          : !amountValid
            ? "Enter an amount above $0"
            : "Add a short description of what this is for"
      );
      return;
    }
    setSaving(true);
    try {
      await onSubmit({ name, email }, { custom_amt: parsedAmount, custom_description: description.trim() });
      onClose();
    } catch (err) {
      toastError("Failed to add the line", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        className="flex-1 items-center justify-center px-6"
        style={{ backgroundColor: "rgba(68,64,60,0.35)" }}
      >
        <Pressable
          onPress={() => {}}
          className="w-full overflow-hidden rounded-2xl bg-white"
          style={{ maxWidth: 460, maxHeight: "88%" }}
        >
          <View className="px-6 pb-3 pt-5">
            <Text className="text-lg" style={{ fontFamily: fonts.sansBold, color: colors.primaryOnWhite }}>
              Pay someone not in the app
            </Text>
            <Text className="mt-1 text-xs" style={{ fontFamily: fonts.sans, color: "#78716c" }}>
              {formatDateRange(periodStart, computePeriodEnd(periodStart))} · they get no login and see nothing.
            </Text>
          </View>

          <ScrollView className="px-6" contentContainerStyle={{ paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
            {loading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
            ) : (
              <>
                {payees.length > 0 ? (
                  <>
                    <Label>Who</Label>
                    <View className="mb-3 flex-row flex-wrap" style={{ gap: 8 }}>
                      {payees.map((p) => {
                        const active = selected?.email === p.email;
                        return (
                          <Pressable
                            key={p.email}
                            onPress={() => setSelected(active ? null : p)}
                            className="rounded-full border px-3 py-1.5"
                            style={{
                              borderColor: active ? colors.primary : "#e7e5e4",
                              backgroundColor: active ? "#fdf6f2" : "white",
                            }}
                          >
                            <Text
                              className="text-xs"
                              style={{
                                fontFamily: active ? fonts.sansSemiBold : fonts.sansMedium,
                                color: active ? colors.primaryOnWhite : "#78716c",
                              }}
                            >
                              {p.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                      <Pressable
                        onPress={() => setSelected(null)}
                        className="rounded-full border px-3 py-1.5"
                        style={{
                          borderColor: selected ? "#e7e5e4" : colors.primary,
                          backgroundColor: selected ? "white" : "#fdf6f2",
                        }}
                      >
                        <Text
                          className="text-xs"
                          style={{
                            fontFamily: selected ? fonts.sansMedium : fonts.sansSemiBold,
                            color: selected ? "#78716c" : colors.primaryOnWhite,
                          }}
                        >
                          + Someone new
                        </Text>
                      </Pressable>
                    </View>
                  </>
                ) : null}

                {selected ? null : (
                  <>
                    <Label>Name</Label>
                    <TextInput
                      value={newName}
                      onChangeText={setNewName}
                      placeholder="e.g. Callie White"
                      className="mb-3"
                      style={inputStyle}
                    />
                    <Label hint="not contacted">Email</Label>
                    <TextInput
                      value={newEmail}
                      onChangeText={setNewEmail}
                      placeholder="callie@example.com"
                      autoCapitalize="none"
                      keyboardType="email-address"
                      className="mb-1"
                      style={inputStyle}
                    />
                    {/* Said plainly because an email field on a person who is
                        deliberately NOT being given an account looks like a
                        mistake otherwise. */}
                    <Text className="mb-3 text-xs" style={{ fontFamily: fonts.sans, color: "#a8a29e" }}>
                      No account is created and nothing is ever sent here. It just keeps this person's lines together from
                      one period to the next.
                    </Text>
                  </>
                )}

                <Label>Amount ($)</Label>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  inputAccessoryViewID={NUMERIC_DONE_ID}
                  className="mb-3"
                  style={inputStyle}
                />

                <Label>What it's for</Label>
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="e.g. Cleaning"
                  className="mb-1"
                  style={inputStyle}
                />
              </>
            )}
          </ScrollView>

          <View className="flex-row justify-end px-6 pb-5 pt-3" style={{ gap: 10 }}>
            <Pressable onPress={onClose} className="rounded-lg px-4 py-2.5">
              <Text style={{ fontFamily: fonts.sansMedium, color: "#78716c" }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={saving}
              className="items-center rounded-lg px-5 py-2.5"
              style={{ backgroundColor: colors.primary, opacity: saving || !ready ? 0.5 : 1 }}
            >
              <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                {saving ? "Adding…" : amountValid ? `Add $${parsedAmount.toFixed(2)}` : "Add"}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
