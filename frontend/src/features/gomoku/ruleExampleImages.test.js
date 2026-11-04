const originalEnvironment = process.env.APP_DEPLOY_ENV;
afterEach(() => {
  if (originalEnvironment === undefined) delete process.env.APP_DEPLOY_ENV;
  else process.env.APP_DEPLOY_ENV = originalEnvironment;
});

test.each([
  ["development", "jarihana-dev"],
  ["production", "jarihana"]
])("%s loads rule examples from its own S3 prefix", (environment, prefix) => {
  process.env.APP_DEPLOY_ENV = environment;
  jest.isolateModules(() => {
    const { ruleExampleImages } = require("./ruleExampleImages");
    expect(ruleExampleImages.three).toContain(`/${prefix}/images/gomoku-rules/double-three-`);
    expect(ruleExampleImages.four).toContain(`/${prefix}/images/gomoku-rules/double-four-`);
  });
});
