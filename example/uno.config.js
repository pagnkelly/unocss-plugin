import {
  defineConfig,
  // presetAttributify,
  presetUno,
  transformerVariantGroup
} from 'unocss'

export default defineConfig({
  presets: [
    presetUno()
  ],
  safelist: ['dark:text-green-300'],
  transformers: [transformerVariantGroup()]
})
