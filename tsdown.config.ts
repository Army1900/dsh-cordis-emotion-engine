/**
 * tsdown 构建配置：产出 lib/index.mjs（Host）、lib/client.js（Client factory
 * bundle）、lib/typert.remote-client.js（Remote contribution）。
 *
 * Client bundle 必须遵循 DSH 的模块加载协议：
 *   window.__ModuleLoader__.load({ id, factory: (require) => { ... } })
 * 依赖通过 factory 的 require 从 shell 模块表解析（react、@deepseek-ai/* 平台模块），
 * 其余依赖（zod 等）内联进 bundle。参考 harness packages/client/tsdown.client.ts。
 * 类型声明由 tsc 单独产出到 lib/types/（见 tsconfig.json）。
 */
import { defineConfig } from 'tsdown'

/** shell 模块表提供的平台模块（external，由浏览器运行时注入 require）。 */
const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
] as const

const PACKAGE_ID = 'dsh-cordis-emotion-engine'

export default defineConfig([
  {
    name: `${PACKAGE_ID}/host`,
    entry: ['src/index.ts'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    dts: false,
    clean: false,
  },
  {
    name: `${PACKAGE_ID}/client`,
    entry: { client: 'src/client/index.tsx' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2024',
    dts: false,
    sourcemap: true,
    clean: false,
    external: [...PLATFORM_MODULES],
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
    },
    // 平台模块保持 external（模块表提供），其余依赖（zod 等）全部内联。
    noExternal: (id: string) => (PLATFORM_MODULES.includes(id) ? undefined : true),
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_ID)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
  {
    name: `${PACKAGE_ID}/remote`,
    entry: ['src/typert.remote-client.ts'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'neutral',
    target: 'es2024',
    dts: false,
    clean: false,
  },
])
