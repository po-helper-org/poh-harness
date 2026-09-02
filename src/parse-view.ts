import { classifyLinks } from './classify-links.js'
import { CANON_ORDER, type BftPriority, type BftStage, type BftTask } from './model.js'

const STAGES = new Set<string>(CANON_ORDER)
const TITLE_RE = /^Task\s+([A-Z]+-[\d.]+)\s+-\s+(.+)$/m
const FIELD_RE = (name: string) => new RegExp(`^${name}:\\s*(.+)$`, 'm')
const AC_RE = /^-\s+\[[ x]\]\s+#(\d+)\s+(.+)$/
const TITLE_PREFIX = /^БФТ:\s*/
const REASON_PREFIX = /^Причина:\s*/

/**
 * Секция вывода — это заголовок, линия из дефисов и текст до следующего заголовка.
 * Флаг `m` здесь недопустим: с ним `$` означал бы конец строки, и ленивый захват
 * оборвался бы на первом же переводе строки.
 */
function section(stdout: string, name: string): string {
  const re = new RegExp(`(?:^|\\n)${name}:\\n-+\\n([\\s\\S]*?)(?=\\n\\n[A-ZА-Я][^\\n]*:\\n-+\\n|$)`)
  const body = re.exec(stdout)?.[1] ?? ''
  return body.trim()
}

/**
 * Разбирает вывод `backlog task view <id> --plain`.
 * SMART-цель живёт в описании отдельной секцией `## SMART`, HowToDemo — в пунктах приёмки,
 * причина отмены — в заметках. Так договорились в конвенции полей.
 */
export function parseTaskView(stdout: string): BftTask {
  const head = TITLE_RE.exec(stdout)
  if (!head) throw new Error('не удалось разобрать задачу: нет строки «Task <id> - <название>»')

  const rawStage = FIELD_RE('Status').exec(stdout)?.[1].replace(/^[^\wА-Яа-я]+/, '').trim() ?? ''
  if (!STAGES.has(rawStage)) throw new Error(`не удалось разобрать задачу: неизвестная стадия «${rawStage}»`)

  const refs = (FIELD_RE('References').exec(stdout)?.[1] ?? '')
    .split(/[,\s]+/)
    .filter(Boolean)

  const descriptionRaw = section(stdout, 'Description')
  const smartAt = descriptionRaw.indexOf('## SMART')
  const description = (smartAt === -1 ? descriptionRaw : descriptionRaw.slice(0, smartAt)).trim()
  const smart = smartAt === -1
    ? undefined
    : descriptionRaw.slice(smartAt + '## SMART'.length).trim() || undefined

  const howToDemo = section(stdout, 'Acceptance Criteria')
    .split('\n')
    .map(line => AC_RE.exec(line.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .sort((a, b) => Number(a[1]) - Number(b[1]))
    .map(m => m[2].trim())

  const notes = section(stdout, 'Implementation Notes')
  const cancelReason = notes ? notes.replace(REASON_PREFIX, '').trim() || undefined : undefined

  return {
    id: head[1],
    title: head[2].replace(TITLE_PREFIX, '').trim(),
    stage: rawStage as BftStage,
    priority: (FIELD_RE('Priority').exec(stdout)?.[1].trim().toLowerCase() ?? 'medium') as BftPriority,
    description,
    smart,
    howToDemo,
    links: classifyLinks(refs),
    cancelReason,
  }
}
