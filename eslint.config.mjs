import js from "@eslint/js";
import tseslint from "typescript-eslint";

// Known AI SDK bare specifiers. An enumerated list can never be complete —
// the dependency-allowlist tests in packages/domain/test/no-ai-dependencies
// .test.ts are the backstop that catches unlisted vendors.
const AI_SDK_IMPORT_PATTERNS = [
  "@anthropic-ai/*", "openai", "openai/*", "ai", "ai/*", "@ai-sdk/*",
  "langchain", "langchain/*", "@langchain/*", "@google/generative-ai",
  "@google/genai", "@google-cloud/vertexai", "@aws-sdk/client-bedrock-runtime",
  "@mistralai/*", "cohere-ai", "cohere-ai/*", "groq-sdk", "ollama",
  "ollama/*", "together-ai", "@huggingface/inference", "replicate",
  "@icg/ai", "@icg/ai/*",
];

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/next-env.d.ts",
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
    // Deterministic core, bottom of the dependency direction (docs/05):
    // packages/domain imports no AI SDK and no other @icg package. One
    // complete rule entry per file set — flat config replaces, not merges,
    // the same rule key across blocks.
    files: ["packages/domain/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: AI_SDK_IMPORT_PATTERNS, message: "AI SDKs are forbidden in the deterministic core." },
            { group: ["@icg/*"], message: "packages/domain imports no other @icg package." },
          ],
        },
      ],
    },
  },
  {
    // packages/rules: zero AI dependencies; may import only @icg/domain.
    // Scoped to src: tests wire @icg/data in as the dataset source.
    files: ["packages/rules/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: AI_SDK_IMPORT_PATTERNS, message: "AI SDKs are forbidden in the deterministic core." },
            { group: ["@icg/*", "!@icg/domain"], message: "packages/rules may depend on @icg/domain only." },
          ],
        },
      ],
    },
  },
);
