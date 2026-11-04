const prefix = process.env.APP_DEPLOY_ENV === "production" ? "jarihana" : "jarihana-dev";
const root = `https://techcourse-project-2026.s3.ap-northeast-2.amazonaws.com/${prefix}/images/gomoku-rules`;

export const ruleExampleImages = {
  three: `${root}/double-three-0bf79c9a2abc.png`,
  four: `${root}/double-four-5e2f907f652a.png`
};
