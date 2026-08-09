import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/coverage/**",
      "design/**",
      "docs/**",
      "prompts/**",
      "golden/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // The deterministic core must not import AI providers or the ai package.
    files: ["packages/domain/**/*.ts", "packages/rules/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@icg/ai", "@icg/ai/*"], message: "packages/domain and packages/rules must have zero AI dependencies." },
            { group: ["@anthropic-ai/*", "openai", "openai/*", "ai", "ai/*", "@ai-sdk/*", "langchain", "langchain/*", "@langchain/*"], message: "AI SDKs are forbidden in the deterministic core." },
          ],
        },
      ],
    },
  },
);
