import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Config, toBftConfig } from '../src/plugin-config.js'

test('обязателен только корень воркспейса', () => {
  const parsed = Config({ workspaceRoot: '/w' })
  assert.equal(parsed.workspaceRoot, '/w')
  assert.equal(parsed.backlogBin, 'backlog')
  assert.equal(parsed.docsPath, '.bft/documentation')
  assert.equal(parsed.indexPath, '.bft/index')
  assert.equal(parsed.taskType, 'bft')
  assert.equal(parsed.teamName, 'GDS/Платформа')
})

test('значения строки профиля перекрывают умолчания', () => {
  const parsed = Config({ workspaceRoot: '/w', backlogBin: '/opt/backlog', taskType: 'req' })
  assert.equal(parsed.backlogBin, '/opt/backlog')
  assert.equal(parsed.taskType, 'req')
})

test('токены берутся из окружения, а не из строки профиля', () => {
  const config = toBftConfig(Config({ workspaceRoot: '/w' }), {
    JIRA_TOKEN: 'секрет-jira',
    CONFLUENCE_TOKEN: 'секрет-conf',
  })
  assert.equal(config.jira.token, 'секрет-jira')
  assert.equal(config.confluence.token, 'секрет-conf')
})

test('без токенов в окружении конфигурация всё равно собирается', () => {
  const config = toBftConfig(Config({ workspaceRoot: '/w' }), {})
  assert.equal(config.jira.token, undefined)
  assert.equal(config.confluence.token, undefined)
  assert.equal(config.jira.baseUrl, 'https://jira.mts.ru')
})

test('пути из строки профиля доезжают до конфигурации ядра', () => {
  const config = toBftConfig(Config({ workspaceRoot: '/w', docsPath: 'docs' }), {})
  assert.equal(config.workspaceRoot, '/w')
  assert.equal(config.docsPath, 'docs')
})

test('пустой корень воркспейса отвергается при сборке конфигурации', () => {
  // Схема пропускает пустую строку — проверка живёт в toBftConfig.
  assert.throws(() => toBftConfig(Config({ workspaceRoot: '' }), {}), /workspaceRoot/)
  assert.throws(() => toBftConfig(Config({ workspaceRoot: '   ' }), {}), /workspaceRoot/)
})

test('корень воркспейса очищается от краевых пробелов', () => {
  assert.equal(toBftConfig(Config({ workspaceRoot: '  /w  ' }), {}).workspaceRoot, '/w')
})
