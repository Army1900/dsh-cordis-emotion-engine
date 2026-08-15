/**
 * tsdown 构建配置：产出 lib/index.js（Host）、lib/client.js（Client bundle）、
 * lib/typert.remote-client.js（Remote contribution）。
 * 类型声明由 tsc 单独产出到 lib/types/（见 tsconfig.json）。
 */
import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: ['src/index.ts'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    dts: false,
    clean: false,
  },
  {
    entry: ['src/client/index.tsx'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'browser',
    target: 'es2024',
    deps: {
      alwaysBundle: ['zod'],
      neverBundle: ['react', '@deepseek-ai/*'],
    },
    dts: false,
    clean: false,
  },
  {
    entry: ['src/typert.remote-client.ts'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'neutral',
    target: 'es2024',
    dts: false,
    clean: false,
  },
])
