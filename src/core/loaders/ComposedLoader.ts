import _ from 'lodash'
import { Disposable } from 'vscode'
import { LocaleNode, LocaleTree, FlattenLocaleTree, PendingWrite } from '../types'
import { Translator } from '../Translator'
import { Log } from '../../utils'
import { Loader } from './Loader'

export class ComposedLoader extends Loader {
  constructor () {
    super('[Composed]')
    this._disposables.push(
      Translator.onDidChange(() => this._onDidChange.fire()),
    )
  }

  _loaders: Loader[] = []
  _watchers: Disposable[] = []
  _isFlattenLocaleTreeDirty = true

  get files () {
    return _.flatten(this._loaders.map(l => l.files))
  }

  get loaders () {
    return this._loaders
  }

  set loaders (value: Loader[]) {
    this._watchers.forEach(d => d.dispose())
    this._loaders = value
    this._watchers = this.loaders.filter(i => i).map(loader =>
      loader.onDidChange((e) => {
        this._isFlattenLocaleTreeDirty = true
        this._onDidChange.fire(`${e}+${this.name}`)
      }),
    )
    // this._onDidChange.fire(this.name)
  }

  get loadersReversed () {
    return this._loaders.reverse()
  }

  get root (): LocaleTree {
    const children: Record<string | number, LocaleTree | LocaleNode> = {}
    for (const loader of this._loaders) {
      const loaderChildren = loader.root.children
      for (const key of Object.keys(loaderChildren))
        children[key] = loaderChildren[key]
    }
    return new LocaleTree({ keypath: '', children })
  }

  get flattenLocaleTree (): FlattenLocaleTree {
    if (!this._isFlattenLocaleTreeDirty)
      return this._flattenLocaleTree

    this._flattenLocaleTree = {}
    for (const loader of this._loaders) {
      const loaderChildren = loader.flattenLocaleTree
      Object.assign(this._flattenLocaleTree, loaderChildren)
    }
    this._isFlattenLocaleTreeDirty = false
    return this._flattenLocaleTree
  }

  get locales (): string[] {
    return _(this._loaders)
      .flatMap(l => l.locales)
      .uniq()
      .value()
  }

  getShadowFilePath (keypath: string, locale: string) {
    for (const loader of this.loadersReversed) {
      const value = loader.getShadowFilePath(keypath, locale)
      if (value)
        return value
    }
  }

  getTreeNodeByKey (keypath: string, tree?: LocaleTree) {
    for (const loader of this.loadersReversed) {
      const value = loader.getTreeNodeByKey(keypath, tree)
      if (value)
        return value
    }
  }

  getFilepathByKey (keypath: string, locale?: string) {
    for (const loader of this.loadersReversed) {
      const value = loader.getFilepathByKey(keypath, locale)
      if (value)
        return value
    }
  }

  getValueByKey (keypath: string, locale?: string, maxLength = 0, stringifySpace?: number) {
    for (const loader of this.loadersReversed) {
      const value = loader.getValueByKey(keypath, locale, maxLength, stringifySpace)
      if (value)
        return value
    }
  }

  fire (src?: string) {
    this._onDidChange.fire(src || this.name)
  }

  async write (pendings: PendingWrite | PendingWrite[]) {
    if (!Array.isArray(pendings))
      pendings = [pendings]
    pendings = pendings.filter(i => i)

    console.log(pendings)

    const distrubtedPendings: PendingWrite[][] = new Array(this.loadersReversed.length).fill(null).map(_ => [])
    const loaders = this.loadersReversed
    for (const pending of pendings) {
      let handled = false
      loaders.forEach((loader, index) => {
        if (handled)
          return
        if (loader.canHandleWrites(pending)) {
          distrubtedPendings[index].push(pending)
          handled = true
        }
      })
      if (!handled)
        Log.info(`💥 Unhandled write ${JSON.stringify(pending)}`)
    }

    await Promise.all(loaders.map(async (loader, index) => {
      if (distrubtedPendings[index] && distrubtedPendings[index].length)
        await loader.write(distrubtedPendings[index])
    }))
  }

  // TODO:sfc merge tree nodes
}
