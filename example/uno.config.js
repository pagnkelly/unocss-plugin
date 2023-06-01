import {
  defineConfig,
  // presetAttributify,
  presetUno,
  transformerVariantGroup
} from 'unocss'
import { presetBase } from '@mpxjs/unocss-base'
console.log(presetBase(), 'presetBase()')
export default defineConfig({
  presets: [
    presetBase()
  ],
  safelist: ['dark:text-green-300'],
  transformers: [transformerVariantGroup()]
})
