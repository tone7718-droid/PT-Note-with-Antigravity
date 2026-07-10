import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Electron 메인/프리로드는 CommonJS 필수 (no-require-imports 미적용 대상)
    "electron/**",
    // 일회성 개발 스크립트 (앱 코드 아님)
    "read_pdf.js",
  ]),
]);

export default eslintConfig;
