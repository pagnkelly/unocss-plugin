import {
  defineConfig
} from 'unocss'
import { presetBase } from '@mpxjs/unocss-base'
export default defineConfig({
  presets: [
    presetBase()
  ],
  safelist: ['dark:text-green-300']
})
