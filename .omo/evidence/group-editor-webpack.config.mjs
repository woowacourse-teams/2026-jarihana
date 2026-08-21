import baseConfigFactory from "../../frontend/webpack.config.mjs";

export default (environment, arguments_) => {
  const base = baseConfigFactory(environment, arguments_);
  return {
    ...base,
    entry: new URL("../../frontend/src/pages/group-editor/index.jsx", import.meta.url).pathname,
    output: {
      ...base.output,
      clean: true,
      path: "/tmp/jarihana-group-editor-build"
    },
    plugins: base.plugins.filter((plugin) => plugin.constructor.name !== "HtmlWebpackPlugin")
  };
};
