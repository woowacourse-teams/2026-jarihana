import path from "node:path";
import { fileURLToPath } from "node:url";
import CopyWebpackPlugin from "copy-webpack-plugin";
import dotenv from "dotenv";
import HtmlWebpackPlugin from "html-webpack-plugin";
import webpack from "webpack";

const directory = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(directory, ".env"), quiet: true });

const publicEnvironmentKeys = [
  "APP_GITHUB_CLIENT_ID",
  "APP_GITHUB_REDIRECT_URI",
  "APP_OAUTH_COOKIE_NAME",
  "APP_OAUTH_COOKIE_DOMAIN",
  "APP_POSTHOG_PROJECT_TOKEN",
  "APP_POSTHOG_HOST",
  "APP_ANALYTICS_ENABLED",
  "APP_DEPLOY_ENV",
  "DISABLE_REACT_DEVTOOLS"
];

const publicEnvironmentDefinitions = Object.fromEntries(
  publicEnvironmentKeys.map((key) => [`process.env.${key}`, JSON.stringify(process.env[key] ?? "")])
);

export default (_, arguments_) => {
  const mode = arguments_.mode ?? "development";
  const isProduction = mode === "production";

  return {
    devtool: isProduction ? "source-map" : "eval-source-map",
    entry: path.resolve(directory, "src/index.jsx"),
    output: {
      clean: true,
      filename: isProduction ? "assets/[name].[contenthash:8].js" : "assets/[name].js",
      path: path.resolve(directory, "dist"),
      publicPath: "/"
    },
    resolve: {
      alias: isProduction
        ? {
            "react-grab": false,
            "react-scan": false
          }
        : {},
      extensions: [".js", ".jsx"]
    },
    module: {
      rules: [
        {
          exclude: /node_modules/,
          test: /\.jsx?$/,
          use: {
            loader: "babel-loader",
            options: {
              envName: mode
            }
          }
        },
        {
          test: /\.css$/,
          use: ["style-loader", "css-loader", "postcss-loader"]
        },
        {
          generator: {
            filename: "assets/[name].[contenthash:8][ext]"
          },
          test: /\.(avif|gif|jpe?g|png|svg|webp)$/i,
          type: "asset/resource"
        }
      ]
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: path.resolve(directory, "public/index.html")
      }),
      new CopyWebpackPlugin({
        patterns: [
          {
            from: path.resolve(directory, "src/shared/assets/brand/jarihana-favicon.png"),
            to: "favicon.png"
          },
          {
            from: path.resolve(directory, "public/manifest.webmanifest"),
            to: "manifest.webmanifest"
          },
          {
            from: path.resolve(directory, "public/images"),
            to: "images"
          }
        ]
      }),
      new webpack.DefinePlugin({
        ...publicEnvironmentDefinitions,
        "process.env.NODE_ENV": JSON.stringify(isProduction ? "production" : "development")
      })
    ],
    devServer: {
      client: {
        overlay: {
          errors: true,
          warnings: false
        }
      },
      allowedHosts: [".trycloudflare.com", "localhost"],
      historyApiFallback: true,
      hot: true,
      port: 5173,
      proxy: [
        {
          changeOrigin: true,
          context: ["/api"],
          target: "http://localhost:8080"
        }
      ],
      setupMiddlewares: (middlewares) => {
        middlewares.unshift({
          name: "group-share-preview",
          middleware: async (request, response, next) => {
            const groupPath = request.path.match(/^\/groups\/([1-9][0-9]*)\/?$/);
            if (request.method !== "GET" || !groupPath || request.query.preview) {
              next();
              return;
            }

            try {
              const previewResponse = await fetch(
                `http://localhost:8080/api/share/groups/${groupPath[1]}`
              );
              response.status(previewResponse.status);
              response.setHeader("Content-Type", "text/html; charset=UTF-8");
              response.setHeader("Cache-Control", "no-store");
              response.send(await previewResponse.text());
            } catch (error) {
              next(error);
            }
          }
        });
        return middlewares;
      },
      static: {
        directory: path.resolve(directory, "public")
      }
    }
  };
};
