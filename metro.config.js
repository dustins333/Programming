const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// supabase/functions/** are Deno Edge Functions — a separate runtime Metro
// should never bundle or even scan (their .ts files aren't part of the app
// and shouldn't trigger Expo's "are you using TypeScript?" auto-detection).
config.resolver.blockList = [/supabase\/functions\/.*/];

module.exports = withNativeWind(config, { input: "./global.css" });
