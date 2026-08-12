import { Modal, View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { PressFade } from "./PressFade";
import { fonts, colors } from "../lib/theme";
import { formatDateMD } from "../lib/formatDate";

// The finalize preflight (design_handoff_coach_web_v2, 1c).
//
// Finalizing publishes every remaining draft in a block at once, which is
// the single action in this app that reaches a whole program's membership
// in one click. So it's a read-through, not a confirm dialog: blockers are
// separated from things merely worth a look, every line jumps to its own
// fix, and the button names the actual consequence rather than saying
// "Confirm".
//
// What it does NOT claim: the mock's footnote said finalizing also "locks
// the block's dates". Nothing in this schema locks a block, and a button
// that says it did would be lying — so the footnote says only what really
// happens, which is that the drafts go live and stay editable afterwards.

const MUST_BG = "#fdf6f2";
const MUST_BORDER = "#eddcd2";

function CheckRow({ item, onGo, emphasis, first }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 13,
        paddingHorizontal: 16,
        borderTopWidth: emphasis || first ? 0 : 1,
        borderTopColor: "#f4f1ec",
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: "#2a211c" }}>{item.title}</Text>
        <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e", marginTop: 2 }}>{item.detail}</Text>
      </View>
      {emphasis ? (
        <PressFade
          onPress={() => onGo(item)}
          style={{ backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 }}
        >
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 12.5, color: "#fff" }}>{item.actionLabel}</Text>
        </PressFade>
      ) : (
        <Pressable onPress={() => onGo(item)}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.primaryOnWhite }}>{item.actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

function SectionLabel({ children, count, color }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 9 }}>
      <Text style={{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1.3, color }}>{children}</Text>
      <View style={{ backgroundColor: "#f1efed", borderRadius: 99, paddingVertical: 2, paddingHorizontal: 8 }}>
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: "#78716c" }}>{count}</Text>
      </View>
    </View>
  );
}

export function FinalizeBlockModal({
  visible,
  onClose,
  programName,
  blockLabel,
  block,
  weeks,
  sessionCount,
  memberCount,
  draftCount,
  checks,
  busy,
  onGo,
  onFinalize,
}) {
  const mustFix = checks?.mustFix ?? [];
  const worthALook = checks?.worthALook ?? [];
  const blocked = mustFix.length > 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(68,64,60,0.35)", alignItems: "center", justifyContent: "center", padding: 24 }}>
        {/* Coach-side desktop dialog, so a centred card rather than the
            member app's bottom sheet — same convention as every other
            modal in (coach). */}
        <Pressable
          onPress={(e) => e.stopPropagation?.()}
          style={{ width: "100%", maxWidth: 620, maxHeight: "88%", backgroundColor: "#fff", borderRadius: 18, overflow: "hidden" }}
        >
          <View style={{ paddingHorizontal: 24, paddingTop: 22, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: "#f4f1ec" }}>
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1.3, color: "#a8a29e" }}>FINALIZE BLOCK</Text>
            <Text style={{ fontFamily: fonts.display, fontSize: 26, color: colors.primary, marginTop: 8 }}>
              {programName} | {blockLabel}
            </Text>
            <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#78716c", marginTop: 5 }}>
              {block ? `${formatDateMD(block.block_start_date)} → ${formatDateMD(block.block_end_date)} · ` : ""}
              {weeks} week{weeks === 1 ? "" : "s"} · {sessionCount} session{sessionCount === 1 ? "" : "s"} · {memberCount} member
              {memberCount === 1 ? "" : "s"}
            </Text>
          </View>

          <ScrollView style={{ paddingHorizontal: 24, paddingTop: 18 }}>
            {mustFix.length > 0 ? (
              <View style={{ marginBottom: 18 }}>
                <SectionLabel count={mustFix.length} color="#b23a22">
                  MUST FIX
                </SectionLabel>
                <View style={{ backgroundColor: MUST_BG, borderWidth: 1, borderColor: MUST_BORDER, borderRadius: 12 }}>
                  {mustFix.map((item) => (
                    <CheckRow key={item.key} item={item} onGo={onGo} emphasis />
                  ))}
                </View>
              </View>
            ) : null}

            {worthALook.length > 0 ? (
              <View style={{ marginBottom: 18 }}>
                <SectionLabel count={worthALook.length} color="#8a5a2e">
                  WORTH A LOOK
                </SectionLabel>
                <View style={{ borderWidth: 1, borderColor: "#ece7e1", borderRadius: 12, overflow: "hidden" }}>
                  {worthALook.map((item, i) => (
                    <CheckRow key={item.key} item={item} onGo={onGo} emphasis={false} first={i === 0} />
                  ))}
                </View>
              </View>
            ) : null}

            {mustFix.length === 0 && worthALook.length === 0 ? (
              <View style={{ borderWidth: 1, borderColor: "#ece7e1", borderRadius: 12, padding: 18, marginBottom: 18 }}>
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: "#2a211c" }}>Nothing to flag.</Text>
                <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e", marginTop: 3 }}>
                  Every session has lifts and a title.
                </Text>
              </View>
            ) : null}

            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#f7f6f3", borderRadius: 12, padding: 16, marginBottom: 18 }}>
              <View style={{ width: 26, height: 26, borderRadius: 99, backgroundColor: "#e3ead9", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 12, color: "#4d6142" }}>{draftCount}</Text>
              </View>
              <Text style={{ flex: 1, fontFamily: fonts.sans, fontSize: 12.5, color: "#57534e", lineHeight: 18 }}>
                Finalizing publishes{" "}
                <Text style={{ fontFamily: fonts.sansBold }}>
                  {draftCount} draft session{draftCount === 1 ? "" : "s"}
                </Text>{" "}
                to <Text style={{ fontFamily: fonts.sansBold }}>{memberCount} member{memberCount === 1 ? "" : "s"}</Text>. Sessions
                stay editable afterwards.
              </Text>
            </View>
          </ScrollView>

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 24, paddingVertical: 18, borderTopWidth: 1, borderTopColor: "#f4f1ec" }}>
            <PressFade onPress={onClose} style={{ borderWidth: 1, borderColor: "#d9d4cd", borderRadius: 9, paddingVertical: 11, paddingHorizontal: 20 }}>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#44403c" }}>Cancel</Text>
            </PressFade>
            <Pressable
              onPress={blocked || busy || draftCount === 0 ? undefined : onFinalize}
              style={{
                backgroundColor: blocked || draftCount === 0 ? "#d6d1ca" : colors.primary,
                borderRadius: 9,
                paddingVertical: 11,
                paddingHorizontal: 22,
                opacity: busy ? 0.6 : 1,
              }}
            >
              {busy ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: "#fff" }}>
                  {blocked
                    ? `Fix ${mustFix.length} first`
                    : draftCount === 0
                      ? "Nothing left to publish"
                      : `Publish ${draftCount} and finalize`}
                </Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
