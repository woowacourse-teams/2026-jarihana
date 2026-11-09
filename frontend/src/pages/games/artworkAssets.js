const prefix = process.env.APP_DEPLOY_ENV === "production" ? "jarihana" : "jarihana-dev";
const root = `https://techcourse-project-2026.s3.ap-northeast-2.amazonaws.com/${prefix}/images/games`;

export const gameArtwork = {
  gomoku: `${root}/gomoku-lounge-v1.webp`,
  rhythm: "/game-assets/rhythm-harpoon/assets/rhythm-lounge-harpoon-v2.webp"
};
