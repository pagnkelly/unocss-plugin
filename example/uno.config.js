import {
  defineConfig
} from 'unocss'
import { presetBase } from '@mpxjs/unocss-base'
import transformerDirectives from '@unocss/transformer-directives'
export default defineConfig({
  presets: [
    presetBase()
  ],
  safelist: ['dark:text-green-300'],
  transformers: [
    transformerDirectives()
  ]
})
