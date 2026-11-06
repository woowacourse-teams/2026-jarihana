const prefix = process.env.APP_DEPLOY_ENV === "production" ? "jarihana" : "jarihana-dev";
const root = `https://techcourse-project-2026.s3.ap-northeast-2.amazonaws.com/${prefix}/images/header-chairs`;

export const headerChairAssets = {
  browse: `${root}/browse-4f688d968a42.png`,
  memories: `${root}/memories-a90bf2e651a0.png`,
  proposal: `${root}/proposal-bbe9cc84d137.png`
};
