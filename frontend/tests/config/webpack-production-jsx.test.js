const path = require("node:path");
const { execFileSync } = require("node:child_process");

test("Given a production webpack mode, when configuring Babel, then it selects the production JSX runtime", () => {
  const configPath = path.resolve(__dirname, "../../webpack.config.mjs");
  const result = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `import createWebpackConfig from ${JSON.stringify(configPath)};\nconst config = createWebpackConfig({}, { mode: "production" });\nconst rule = config.module.rules.find((candidate) => candidate.test.test("screen.jsx"));\nconsole.log(JSON.stringify({ acceptsJsx: rule.test.test("screen.jsx"), aliases: config.resolve.alias, use: rule.use }));`
    ],
    { encoding: "utf8" }
  );
  const jsxRule = JSON.parse(result);

  expect(jsxRule.acceptsJsx).toBe(true);
  expect(jsxRule.aliases).toEqual({
    "react-grab": false,
    "react-scan": false
  });
  expect(jsxRule.use).toEqual({
    loader: "babel-loader",
    options: {
      envName: "production"
    }
  });
});
