// @ts-ignore
import * as limax from 'limax'
import { commands, window, workspace } from 'vscode'
import { trim } from 'lodash'
import { ExtensionModule } from '../modules'
import { ExtractTextOptions, Global, Commands, Config, CurrentFile } from '../core'
import i18n from '../i18n'

const m: ExtensionModule = () => {
  return commands.registerCommand(Commands.extract_text,
    async (options: ExtractTextOptions) => {
      let { filepath, text, range, languageId } = options
      let suggestText: string | undefined = ''; // 建议的替换文本
      let default_keypath = '';
      let attributeName = '';
      let isHTMLAttribute: boolean = false; // 是否是html标签属性
      let promptMsg: string = '🙃' + i18n.t('prompt.enter_i18n_key');
      let testReg = new RegExp(/^.+\s*=\s*('|"){1}.+('|"){1}$/);
      let equalIndex: number = -1;

      if (testReg.test(text)) {
        equalIndex = text.indexOf('=');
        isHTMLAttribute = true;
        attributeName = text.substring(0, equalIndex);
        text = text.substring(equalIndex + 1);

        window.showInformationMessage(`😂匹配到html属性：${attributeName}，使用默认规则替换`)
      }

      // 根据值到翻译字典里取对应的key
      suggestText = Global.loader.getKeyByValue(text);
      if (suggestText) {
        default_keypath = suggestText;
        promptMsg = `😂匹配到文本：${suggestText}，建议适用此代码`;
      }
      else {
        // 如果没找到据适用默认的
        default_keypath = limax(text, { separator: Config.preferredDelimiter, tone: false }) as string
      }

      // prompt for keypath
      const keypath = await window.showInputBox({
        prompt: promptMsg,
        value: default_keypath,
      })

      if (!keypath) {
        window.showWarningMessage(i18n.t('prompt.extraction_canceled'))
        return
      }

      // keypath existence check
      const node = Global.loader.getNodeByKey(keypath)
      let willSkip = suggestText ? true : false;
      if (!willSkip && node) {
        const Override = i18n.t('prompt.button_override')
        const Skip = i18n.t('prompt.button_skip')
        const Reenter = i18n.t('prompt.button_reenter')
        const result = await window.showInformationMessage(
          i18n.t('prompt.key_already_exists'),
          { modal: true },
          Override,
          Skip,
          Reenter,
        )

        // canceled
        if (!result) {
          return
        }
        else if (result === Reenter) {
          commands.executeCommand(Commands.extract_text, options)
          return
        }
        else if (result === Skip) {
          willSkip = true
        }
        // else override
      }

      const value = trim(text, '\'"')

      let replacer: string | undefined = '';

      // 如果是html的话，使用默认规则
      if (isHTMLAttribute) {
        replacer = `:${attributeName}="$t('${keypath}')"`;
      }
      else {
        // prompt for template
        replacer = await window.showQuickPick(
          Global.refactorTemplates(keypath, languageId),
          {
            placeHolder: i18n.t('prompt.replace_text_as'),
          })

        if (!replacer) {
          window.showWarningMessage(i18n.t('prompt.extraction_canceled'))
          return
        }
      }

      // open editor if not exists
      let editor = window.activeTextEditor
      if (!editor) {
        const document = await workspace.openTextDocument(filepath)
        editor = await window.showTextDocument(document)
      }
      editor.edit((editBuilder) => {
        if (replacer) {
          editBuilder.replace(range, replacer.toString());
        }
      })

      if (willSkip)
        return

      // save key
      await CurrentFile.loader.write({
        filepath: undefined,
        keypath,
        value,
        locale: Config.sourceLanguage,
      })
    })
}

export default m
