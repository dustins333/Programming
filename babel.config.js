module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: [["./babel/maxFontSizeMultiplierPlugin", { max: 1.3 }]],
  };
};
