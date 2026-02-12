/** @type { import("eslint").Linter.Config } */
module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  parserOptions: { ecmaVersion: 2022, sourceType: "script" },
  extends: ["eslint:recommended"],
  ignorePatterns: [
    "functions/",
    "node_modules/",
    "*.min.js",
    "firebase-config.js",
    "config.local.js",
    "fix-index-encoding.js",
    "scripts/",
    "tests/",
    "playwright.config.js",
  ],
  globals: {
    firebase: "readonly",
    db: "readonly",
    storage: "readonly",
    grecaptcha: "readonly",
    emailjs: "readonly",
    AuthManagerSecure: "readonly",
    adminPanel: "writable",
    adminRSVPPanel: "writable",
    isViewingEnabled: "readonly",
    isUploadEnabled: "readonly",
    WEDDING_CONFIG: "readonly",
  },
  rules: {
    "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    "no-console": "off",
  },
  overrides: [
    {
      files: ["auth-manager-secure.js"],
      globals: { AuthManagerSecure: "off" },
    },
  ],
};
