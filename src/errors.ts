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

/**
 * Порт остановил команду по собственному таймауту. Даже успешный код возврата ничего не значит:
 * ребёнок мог заглушить SIGTERM и досчитать до конца сам — вывод в этом случае всё равно
 * собирался под давлением остановки и не заслуживает доверия как полный.
 */
export class BacklogTimeoutError extends BftError {
  constructor(command: string) {
    super(
      `команда «${command}» не уложилась в отведённое время и была остановлена — результат мог оказаться неполным`,
    )
  }
}

/** Путь к документу приходит из данных задачи, поэтому проверяется перед чтением. */
export class DocumentOutsideWorkspaceError extends BftError {
  constructor(path: string) {
    super(`путь к документу «${path}» ведёт за пределы воркспейса и не будет прочитан`)
  }
}

/** Документ существует, но прочитать его не удалось: нет прав, по пути каталог и так далее. */
export class DocumentUnreadableError extends BftError {
  constructor(path: string, reason: string) {
    super(`документ «${path}» не удалось прочитать: ${reason}`)
  }
}

/**
 * Идентификатор задачи приходит от пользователя интерфейса, поэтому проверяется до похода в CLI.
 * `backlog task view --help --plain` тоже отвечает кодом 0 и печатает справку, то есть идентификатор
 * вида `--help` без этой проверки дал бы «успешный» разбор мусора вместо понятной ошибки.
 */
export class InvalidTaskIdError extends BftError {
  constructor(received: string) {
    super(`идентификатор задачи «${received}» не похож на настоящий (ожидался вид ПРЕФИКС-число)`)
  }
}

/** Backlog.md отвечает кодом 0 и текстом «не найдено»: обычно это устаревший идентификатор в очереди после синка. */
export class TaskNotFoundError extends BftError {
  constructor(id: string) {
    super(`задача «${id}» не найдена в Backlog.md — идентификатор мог устареть`)
  }
}
