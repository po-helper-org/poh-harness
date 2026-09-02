import { classifyLinks } from './classify-links.js'
import { CANON_ORDER, type BftPriority, type BftStage, type BftTask } from './model.js'

const STAGES = new Set<string>(CANON_ORDER)
const TITLE_RE = /^Task\s+([A-Z]+-[\d.]+)\s+-\s+(.+)$/m
const FIELD_RE = (name: string) => new RegExp(`^${name}:\\s*(.+)$`, 'm')
const AC_RE = /^-\s+\[[ x]\]\s+#(\d+)\s+(.+)$/
const TITLE_PREFIX = /^БФТ:\s*/
const REASON_PREFIX = /^Причина:\s*/
const SMART_HEADING_RE = /^## SMART$/m
const PRIORITIES = new Set<string>(['high', 'medium', 'low'])

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
  const normalized = stdout.replace(/^﻿/, '').replace(/\r\n?/g, '\n')

  const head = TITLE_RE.exec(normalized)
  if (!head) throw new Error('не удалось разобрать задачу: нет строки «Task <id> - <название>»')

  const rawStage = FIELD_RE('Status').exec(normalized)?.[1].replace(/^[^\wА-Яа-я]+/, '').trim() ?? ''
  if (!STAGES.has(rawStage)) throw new Error(`не удалось разобрать задачу: неизвестная стадия «${rawStage}»`)
  const stage = rawStage as BftStage

  const refs = (FIELD_RE('References').exec(normalized)?.[1] ?? '')
    .split(/[,\s]+/)
    .filter(Boolean)

  const descriptionRaw = section(normalized, 'Description')
  const smartHeading = SMART_HEADING_RE.exec(descriptionRaw)
  const description = (smartHeading ? descriptionRaw.slice(0, smartHeading.index) : descriptionRaw).trim()
  const smart = smartHeading
    ? descriptionRaw.slice(smartHeading.index + smartHeading[0].length).trim() || undefined
    : undefined

  const howToDemo = section(normalized, 'Acceptance Criteria')
    .split('\n')
    .map(line => AC_RE.exec(line.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .sort((a, b) => Number(a[1]) - Number(b[1]))
    .map(m => m[2].trim())

  const rawPriority = FIELD_RE('Priority').exec(normalized)?.[1].trim().toLowerCase() ?? 'medium'
  const priority = (PRIORITIES.has(rawPriority) ? rawPriority : 'medium') as BftPriority

  const notes = section(normalized, 'Implementation Notes')
  const cancelReason = stage === 'Cancelled' && notes
    ? notes.replace(REASON_PREFIX, '').trim() || undefined
    : undefined

  return {
    id: head[1],
    title: head[2].replace(TITLE_PREFIX, '').trim(),
    stage,
    priority,
    description,
    smart,
    howToDemo,
    links: classifyLinks(refs),
    cancelReason,
  }
}
