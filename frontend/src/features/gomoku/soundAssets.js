const prefix = process.env.APP_DEPLOY_ENV === "production" ? "jarihana" : "jarihana-dev";
const root = `https://techcourse-project-2026.s3.ap-northeast-2.amazonaws.com/${prefix}/sounds/gomoku`;

export const gomokuSounds = {
  start: `${root}/start-1s-eb641c00b98b.wav`,
  stone: `${root}/stone-e83122800fe1.wav`
};
