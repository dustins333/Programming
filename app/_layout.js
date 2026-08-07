import "../global.css";

import { useCallback, useEffect } from "react";
import { Slot } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import {
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
} from "@expo-google-fonts/montserrat";
import { ProtestStrike_400Regular } from "@expo-google-fonts/protest-strike";
import { AuthProvider } from "../lib/auth/AuthProvider";
import { PushRegistrar } from "../lib/notifications/PushRegistrar";
import { NumericInputAccessory } from "../components/NumericInputAccessory";
import { ViewportZoomReset } from "../components/ViewportZoomReset";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
    ProtestStrike_400Regular,
  });

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded || fontError) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    onLayoutRootView();
  }, [onLayoutRootView]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <AuthProvider>
          <PushRegistrar />
          <ViewportZoomReset />
          <Slot />
          <NumericInputAccessory />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
