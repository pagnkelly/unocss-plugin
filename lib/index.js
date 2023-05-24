const minimatch = require('minimatch')
const unoConfig = require('@unocss/config')
const core = require('@unocss/core')
const mpxConfig = require('@mpxjs/webpack-plugin/lib/config')
const toPosix = require('@mpxjs/webpack-plugin/lib/utils/to-posix')
const { parseClasses, parseStrings, parseTags, parseMustache, stringifyAttr, parseComments, parseCommentConfig } = require('./parser')
const { getReplaceSource, getConcatSource, getRawSource } = require('./source')
const { buildAliasTransformer, transformGroups, mpEscape, cssRequiresTransform } = require('./transform')

const PLUGIN_NAME = 'MpxUnocssPlugin'

function filterFile(file, scan) {
  const { include = [], exclude = [] } = scan
  for (const pattern of exclude) {
    if (minimatch(file, pattern))
      return false
  }

  for (const pattern of include) {
    if (!minimatch(file, pattern))
      return false
  }

  return true
}

function normalizeOptions(options) {
  let {
    // 小程序特有的配置
    windiFile = 'styles/uno',
    styleIsolation = 'isolated',
    minCount = 2,
    scan = {},
    // 公共的配置
    root = process.cwd(),
    config,
    configFiles,
    transformCSS = true,
    transformGroups = true,
    webOptions = {},
    ...rest
  } = options
  // web配置，剔除小程序的配置，防影响
  webOptions = {
    root,
    config,
    configFiles,
    transformCSS,
    transformGroups,
    scan: {
      include: ['src/**/*'],
    },
    ...rest,
    ...webOptions,
  }
  // virtualModulePath暂不支持配置
  webOptions.virtualModulePath = ''
  return {
    windiFile,
    root,
    styleIsolation,
    minCount,
    scan,
    transformCSS,
    transformGroups,
    webOptions,
    configFiles,
    config,
    ...rest,
  }
}

class MpxUnocssPlugin {
  constructor(options = {}) {
    this.options = normalizeOptions(options)
  }

  apply(compiler) {
    const uno = core.createGenerator({}, {})
    let config = {}
    unoConfig.loadConfig(this.options.root, {}, [], {}).then((r) => {
      config = r.config
      uno.setConfig(config)
    })

    compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation) => {
      compilation.hooks.processAssets.tapPromise({
        name: PLUGIN_NAME,
        stage: compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
      }, async (assets) => {
        const { __mpx__: mpx } = compilation
        const error = (msg) => {
          compilation.errors.push(new Error(msg))
        }
        const warn = (msg) => {
          compilation.warnings.push(new Error(msg))
        }

        const { mode, dynamicEntryInfo, appInfo } = mpx
        // 包相关
        const packages = Object.keys(dynamicEntryInfo)
        function getPackageName(file) {
          file = toPosix(file)
          for (const packageName of packages) {
            if (packageName === 'main')
              continue
            if (file.startsWith(`${packageName}/`))
              return packageName
          }
          return 'main'
        }
        // 处理wxss
        const processStyle = async (file, source) => {
          const content = source.source()
          if (!content || !cssRequiresTransform(content))
            return

          const unores = await uno.generate(content, { preflights: false, safelist: false })
          const output = unores.css
          if (!output || output.length <= 0) {
            error(`${file} 解析style错误,检查样式文件输入!`)
            return
          }
          assets[file] = getRawSource(output)
        }
        // 处理wxml
        const { template: templateExt, styles: styleExt } = mpxConfig[mode].typeExtMap
        const packageClassesMaps = {
          main: new Set(),
        }
        const mainClassesSet = packageClassesMaps.main
        const cssEscape = core.toEscapedSelector

        const transformAlias = buildAliasTransformer(config.alias)
        const transformClasses = (source, classNameHandler = c => c) => {
          // pre process
          source = transformAlias(source)
          if (this.options.transformGroups)
            source = transformGroups(source)
          const content = source.source()
          // escape & fill classesMap
          return content.split(/\s+/).map(classNameHandler).join(' ')
        }

        const processTemplate = async (file, source) => {
          source = getReplaceSource(source)
          const content = source.original().source()
          const packageName = getPackageName(file)
          const filename = file.slice(0, -templateExt.length)
          const currentClassesSet = packageClassesMaps[packageName] = packageClassesMaps[packageName] || new Set()

          // process classes
          const classNameHandler = (className) => {
            if (!className)
              return className
            if (packageName === 'main')
              mainClassesSet.add(className)
            else if (!mainClassesSet.has(className))
              currentClassesSet.add(className)

            return mpEscape(cssEscape(className))
          }
          parseClasses(content).forEach(({ result, start, end }) => {
            let { replaced, val } = parseMustache(result, (exp) => {
              const expSource = getReplaceSource(exp)
              parseStrings(exp).forEach(({ result, start, end }) => {
                result = transformClasses(result, classNameHandler)
                expSource.replace(start, end, result)
              })
              return expSource.source()
            }, str => transformClasses(str, classNameHandler))
            if (replaced) {
              val = stringifyAttr(val)
              source.replace(start - 1, end + 1, val)
            }
          })
          // process comments
          const commentConfig = {}
          parseComments(content).forEach(({ result, start, end }) => {
            Object.assign(commentConfig, parseCommentConfig(result))
            source.replace(start, end, '')
          })
          if (commentConfig.safelist) {
            this.getSafeListClasses(commentConfig.safelist).forEach((className) => {
              classNameHandler(className)
            })
          }

          const commentConfigMap = {}
          commentConfigMap[filename] = commentConfig
          console.log(packageClassesMaps, 'packageClassesMaps')
        }
        await Promise.all(Object.entries(assets).map(([file, source]) => {
          if (!filterFile(file, this.options.scan))
            return Promise.resolve()
          if (this.options.transformCSS && file.endsWith(styleExt))
            return processStyle(file, source)
          if (file.endsWith(templateExt))
            return processTemplate(file, source)
          return Promise.resolve()
        }))
      })
    })
  }
}

module.exports = MpxUnocssPlugin
