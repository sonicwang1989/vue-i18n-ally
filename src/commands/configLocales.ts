import * as path from 'path'
import * as fg from 'fast-glob'
import { Uri, workspace, window, commands } from 'vscode'
import { Commands, Config } from '../core'
import { ExtensionModule } from '../modules'
import i18n from '../i18n'

export class ConfigLocalesGuide {
  static async prompt () {
    const okText = i18n.t('prompt.config_locales_button')
    const result = await window.showInformationMessage(
      i18n.t('prompt.config_locales_info'),
      okText,
    )

    if (result !== okText)
      return

    this.config()
  }

  static async config () {
    const dirs = await this.pickDir()
    Config.updateLocalesPaths(dirs)

    this.success()
  }

  static async pickDir (): Promise<string[]> {
    const rootPath = workspace.rootPath
    if (!rootPath)
      return []

    const dirs = await window.showOpenDialog({
      defaultUri: Uri.file(rootPath),
      canSelectFolders: true,
    })

    if (!dirs)
      return []

    return dirs
      .map((item) => {
        if (process.platform === 'win32') // path on windows will starts with '/'
          return item.path.slice(1)
        return item.path
      })
      .map(pa => path.relative(rootPath, pa))
  }

  static async success () {
    await window.showInformationMessage(i18n.t('prompt.config_locales_success'))
  }

  static async autoSet () {
    const rootPath = workspace.rootPath
    if (!rootPath)
      return

    const pattern = ['src/**/(locales|locale|i18n|lang|langs)']
    const result: string[] = await fg(pattern, {
      cwd: rootPath,
      ignore: ['**/node_modules'],
      onlyDirectories: true,
    })

    if (result.length) {
      Config.updateLocalesPaths(result)

      await window.showInformationMessage(
        i18n.t('prompt.config_locales_auto_success', result.join(';').toString()),
      )
    }
    else {
      window.showWarningMessage(i18n.t('prompt.locales_dir_not_found'))
      this.prompt()
    }
  }
}

const m: ExtensionModule = () => {
  return [
    commands.registerCommand(Commands.config_locales_auto,
      () => ConfigLocalesGuide.autoSet()),
    commands.registerCommand(Commands.config_locales,
      () => ConfigLocalesGuide.config()),
  ]
}

export default m
