export * from './model.js'
export { loadConfig, describeConfig, type BftConfig, type BftServiceAccess, type Env } from './config.js'
export { parseTaskList } from './parse-list.js'
export { parseTaskView } from './parse-view.js'
export { classifyLinks } from './classify-links.js'
export { parseLastSync } from './last-sync.js'
export { boardColumns, queueGroups, searchTasks, type BftGroup } from './queue.js'
export { BacklogReader, type BacklogReaderPorts } from './reader.js'
export {
  readTextFileWithNode,
  runCommandWithNode,
  type CommandResult,
  type ReadTextFile,
  type RunCommand,
} from './ports.js'
export {
  BftError,
  BacklogUnavailableError,
  BacklogFailedError,
  BacklogTimeoutError,
  DocumentOutsideWorkspaceError,
  DocumentUnreadableError,
  InvalidTaskIdError,
  TaskNotFoundError,
} from './errors.js'
export { BFT_CHANNEL, dispatch, type RpcResult } from './channel.js'
export { Config, toBftConfig, type PluginConfig } from './plugin-config.js'

// Харнесс грузит плагин по имени пакета, то есть через эту точку входа:
// без `apply` и `name` здесь композиция его просто не найдёт.
// `Config` уже отдан выше из plugin-config.js — второй раз не реэкспортируем.
export { name, apply } from './plugin.js'
