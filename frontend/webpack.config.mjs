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
      static: {
        directory: path.resolve(directory, "public")
      }
    }
  };
};
