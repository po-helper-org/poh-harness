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
  assert.equal(c.teamName, 'GDS/Платформа')
  assert.equal(c.jira.baseUrl, 'https://jira.mts.ru')
  assert.equal(c.confluence.baseUrl, 'https://confluence.mts.ru')
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
  const lines = describeConfig(loadConfig({ ...MINIMAL, JIRA_TOKEN: 'очень-секретный-токен' }))
  const text = lines.join('\n')
  assert.ok(!text.includes('очень-секретный-токен'), 'токен не должен попадать в вывод')
  assert.match(text, /JIRA: https:\/\/jira\.mts\.ru, токен задан/)
  assert.match(text, /Confluence: .*токен не задан/)
})

test('таблица инициатив необязательна', () => {
  assert.equal(loadConfig(MINIMAL).initiativesSheetUrl, undefined)
  const c = loadConfig({ ...MINIMAL, BFT_INITIATIVES_SHEET_URL: 'https://docs.google.com/spreadsheets/d/x' })
  assert.equal(c.initiativesSheetUrl, 'https://docs.google.com/spreadsheets/d/x')
})
