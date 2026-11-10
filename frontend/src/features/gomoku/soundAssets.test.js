const originalEnvironment = process.env.APP_DEPLOY_ENV;
afterEach(() => {
  if (originalEnvironment === undefined) delete process.env.APP_DEPLOY_ENV;
  else process.env.APP_DEPLOY_ENV = originalEnvironment;
});

test.each([
  ["development", "jarihana-dev"],
  ["production", "jarihana"],
  [undefined, "jarihana-dev"]
])("%s loads sounds from its own S3 prefix", (environment, prefix) => {
  if (environment === undefined) delete process.env.APP_DEPLOY_ENV;
  else process.env.APP_DEPLOY_ENV = environment;
  jest.isolateModules(() => {
    const { gomokuSounds } = require("./soundAssets");
    expect(gomokuSounds.start).toBe(`https://techcourse-project-2026.s3.ap-northeast-2.amazonaws.com/${prefix}/sounds/gomoku/start-1500ms-725a2f7fce07.wav`);
  });
});
