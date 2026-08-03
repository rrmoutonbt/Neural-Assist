/**
 * Parallel webpack config for the LadderBot standalone shell.
 *
 * Deliberately isolated from webpack.config.js — the GXT trading
 * platform build stays untouched. LadderBot ships as its own SPA
 * with its own entry, its own HTML template, and a dev-server that
 * proxies /api/ladder to the Flask backend.
 *
 * Scripts:
 *   npm run dev:ladder       — dev server on :3100, HMR, proxy to :5000
 *   npm run build:ladder     — production bundle in dist-ladder/
 */

const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

const isProd = process.env.NODE_ENV === "production";
const backendUrl = process.env.LADDER_API_URL || "http://127.0.0.1:5000";

module.exports = {
  mode: isProd ? "production" : "development",
  entry: "./src/ladder-entry.tsx",
  target: "web",

  output: {
    path: path.resolve(__dirname, "dist-ladder"),
    filename: isProd ? "ladder.[contenthash].js" : "ladder.js",
    clean: true,
    publicPath: "/",
  },

  resolve: {
    extensions: [".tsx", ".ts", ".js"],
  },

  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: {
          loader: "ts-loader",
          options: {
            // Keep the LadderBot build off the sibling app's paths so a
            // type error in the GXT app never blocks the ladder build.
            onlyCompileBundledFiles: true,
            transpileOnly: false,
          },
        },
      },
    ],
  },

  plugins: [
    new HtmlWebpackPlugin({
      template: "./public/ladder.html",
      filename: "index.html",
      inject: "body",
      scriptLoading: "defer",
    }),
  ],

  devServer: {
    static: {
      directory: path.resolve(__dirname, "public"),
      publicPath: "/",
    },
    port: 3100,
    hot: true,
    open: false,
    historyApiFallback: true,
    proxy: [
      {
        context: ["/api/ladder"],
        target: backendUrl,
        changeOrigin: true,
        logLevel: "warn",
      },
    ],
    client: {
      overlay: { errors: true, warnings: false },
    },
  },

  devtool: isProd ? "source-map" : "eval-cheap-module-source-map",

  performance: {
    hints: isProd ? "warning" : false,
    maxAssetSize: 1_500_000,
    maxEntrypointSize: 1_500_000,
  },

  stats: {
    modules: false,
    children: false,
    assets: !isProd,
    entrypoints: false,
  },
};
