module.exports = {
  presets: [
    ["@babel/preset-env", { targets: "defaults and not IE 11" }],
    ["@babel/preset-react", { runtime: "automatic" }]
  ]
};
