import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    // .mts included so scripts/ is linted; it was silently skipped before
    // ("File ignored because no matching configuration was supplied").
    files: ['**/*.{ts,tsx,mts}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // Verification harnesses: they drive raw SQL rows and MCP JSON responses,
    // where `any` is the honest type. api/ already tolerates the same thing via
    // scattered inline disables; one scoped rule beats 21 of those. Everything
    // else — including the type checking added in tsconfig.scripts.json — still
    // applies here.
    files: ['scripts/**/*.mts'],
    languageOptions: { globals: globals.node },
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
])
