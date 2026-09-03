/** Общий предок ошибок плагина: интерфейс показывает `message` пользователю как есть. */
export class BftError extends Error {}

/** `backlog` не найден. Показываем, как поставить, — это самая частая причина пустого раздела. */
export class BacklogUnavailableError extends BftError {
  constructor(bin: string, reason: string) {
    super(
      `не удалось запустить «${bin}»: ${reason}. ` +
        'Установите Backlog.md (brew install backlog-md) или укажите путь в BFT_BACKLOG_BIN',
    )
  }
}

/** CLI отработал, но вернул ошибку. Первая строка stderr обычно и есть причина. */
export class BacklogFailedError extends BftError {
  constructor(command: string, code: number, stderr: string) {
    const reason = stderr.trim().split('\n')[0] || 'без сообщения'
    super(`команда «${command}» завершилась с кодом ${code}: ${reason}`)
  }
}

/** Путь к документу приходит из данных задачи, поэтому проверяется перед чтением. */
export class DocumentOutsideWorkspaceError extends BftError {
  constructor(path: string) {
    super(`путь к документу «${path}» ведёт за пределы воркспейса и не будет прочитан`)
  }
}
