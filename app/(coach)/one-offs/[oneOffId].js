import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { PressFade } from "../../../components/PressFade";
import { fonts, colors } from "../../../lib/theme";

// The one-off builder is desktop-only, same as every other builder in this
// app: the drag-ordered library doesn't hold up on a phone. This native twin
// exists so the route resolves; the SPC client page only offers templates at
// phone width, so nothing links here on a phone.
export default function OneOffBuilderNative() {
  const router = useRouter();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: colors.coachCanvas }}>
      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: "#2a211c", textAlign: "center" }}>
        Build this session on a computer
      </Text>
      <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#78716c", textAlign: "center", marginTop: 6 }}>
        On a phone you can assign a one-off from a template.
      </Text>
      <PressFade onPress={() => (router.canGoBack() ? router.back() : router.push("/(coach)/spc"))} style={{ marginTop: 16 }}>
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: colors.primaryOnWhite }}>‹ Back</Text>
      </PressFade>
    </View>
  );
}
