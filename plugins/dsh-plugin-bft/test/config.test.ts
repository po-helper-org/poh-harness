import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describeConfig, loadConfig } from '../src/config.js'

const MINIMAL = { BFT_WORKSPACE_ROOT: '/w' }

test('без корня воркспейса падает с понятной ошибкой', () => {
  assert.throws(() => loadConfig({}), /BFT_WORKSPACE_ROOT/)
})

test('пустая строка равносильна незаданной переменной', () => {
  assert.throws(() => loadConfig({ BFT_WORKSPACE_ROOT: '   ' }), /BFT_WORKSPACE_ROOT/)
})

test('умолчания работают без единой переменной, кроме корня', () => {
  const c = loadConfig(MINIMAL)
  assert.equal(c.backlogBin, 'backlog')
  assert.equal(c.docsPath, 'bft/documentation')
  assert.equal(c.indexPath, 'bft/index')
  assert.equal(c.taskType, 'bft')
  assert.equal(c.teamName, 'PO team')
  // Хост не угадывается по умолчанию: без JIRA_HOST/CONFLUENCE_HOST распознавание
  // эпик- и Confluence-ссылок остаётся выключенным (см. classifyLinks/LinkHosts).
  assert.equal(c.jira.baseUrl, undefined)
  assert.equal(c.confluence.baseUrl, undefined)
})

test('окружение перекрывает умолчания', () => {
  const c = loadConfig({
    ...MINIMAL,
    BFT_BACKLOG_BIN: '/opt/homebrew/bin/backlog',
    BFT_TEAM_NAME: 'Другая команда',
    JIRA_HOST: 'https://jira.example.com',
  })
  assert.equal(c.backlogBin, '/opt/homebrew/bin/backlog')
  assert.equal(c.teamName, 'Другая команда')
  assert.equal(c.jira.baseUrl, 'https://jira.example.com')
})

test('токены необязательны — без них остаются только ссылки', () => {
  const c = loadConfig(MINIMAL)
  assert.equal(c.jira.token, undefined)
  assert.equal(c.confluence.token, undefined)
})

test('токены читаются из окружения', () => {
  const c = loadConfig({ ...MINIMAL, JIRA_TOKEN: 'секрет-1', CONFLUENCE_TOKEN: 'секрет-2' })
  assert.equal(c.jira.token, 'секрет-1')
  assert.equal(c.confluence.token, 'секрет-2')
})

test('сводка сообщает о наличии токена, но не печатает его', () => {
  const lines = describeConfig(loadConfig({
    ...MINIMAL,
    JIRA_HOST: 'https://jira.example.com',
    JIRA_TOKEN: 'очень-секретный-токен',
  }))
  const text = lines.join('\n')
  assert.ok(!text.includes('очень-секретный-токен'), 'токен не должен попадать в вывод')
  assert.match(text, /JIRA: https:\/\/jira\.example\.com, токен задан/)
  assert.match(text, /Confluence: .*токен не задан/)
})

test('сводка сообщает, что хост не настроен', () => {
  const text = describeConfig(loadConfig(MINIMAL)).join('\n')
  assert.match(text, /JIRA: не задана \(JIRA_HOST\)/)
  assert.match(text, /Confluence: не задана \(CONFLUENCE_HOST\)/)
})

test('таблица инициатив необязательна', () => {
  assert.equal(loadConfig(MINIMAL).initiativesSheetUrl, undefined)
  const c = loadConfig({ ...MINIMAL, BFT_INITIATIVES_SHEET_URL: 'https://docs.google.com/spreadsheets/d/x' })
  assert.equal(c.initiativesSheetUrl, 'https://docs.google.com/spreadsheets/d/x')
})

test('рабочее пространство чатов по умолчанию — внутренняя папка bft', () => {
  assert.equal(loadConfig(MINIMAL).sessionPath, 'bft')
})

test('рабочее пространство чатов переопределяется окружением', () => {
  assert.equal(loadConfig({ ...MINIMAL, BFT_SESSION_PATH: 'bft/chats' }).sessionPath, 'bft/chats')
})

test('пустой BFT_SESSION_PATH выключает привязку, а не возвращает умолчание', () => {
  // Отличие от остальных переменных: пустая строка здесь осмысленна («не привязывать»),
  // поэтому она не должна трактоваться как «переменная не задана».
  assert.equal(loadConfig({ ...MINIMAL, BFT_SESSION_PATH: '' }).sessionPath, '')
})

test('сводка сообщает, куда привязаны чаты по требованиям', () => {
  assert.match(describeConfig(loadConfig(MINIMAL)).join('\n'), /рабочее пространство чатов: bft/)
  assert.match(
    describeConfig(loadConfig({ ...MINIMAL, BFT_SESSION_PATH: '' })).join('\n'),
    /рабочее пространство чатов: не привязано \(текущее\)/,
  )
})
