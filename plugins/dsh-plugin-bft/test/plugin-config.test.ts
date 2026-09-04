import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Config, toBftConfig } from '../src/plugin-config.js'

test('обязателен только корень воркспейса', () => {
  const parsed = Config({ workspaceRoot: '/w' })
  assert.equal(parsed.workspaceRoot, '/w')
  assert.equal(parsed.backlogBin, 'backlog')
  assert.equal(parsed.docsPath, 'bft/documentation')
  assert.equal(parsed.indexPath, 'bft/index')
  assert.equal(parsed.taskType, 'bft')
  assert.equal(parsed.teamName, 'PO team')
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

test('без токенов и хостов в окружении конфигурация всё равно собирается', () => {
  const config = toBftConfig(Config({ workspaceRoot: '/w' }), {})
  assert.equal(config.jira.token, undefined)
  assert.equal(config.confluence.token, undefined)
  // Хост не угадывается по умолчанию — без JIRA_HOST/CONFLUENCE_HOST распознавание
  // эпик- и Confluence-ссылок остаётся выключенным (см. classifyLinks/LinkHosts).
  assert.equal(config.jira.baseUrl, undefined)
  assert.equal(config.confluence.baseUrl, undefined)
})

test('JIRA_HOST/CONFLUENCE_HOST из окружения попадают в конфигурацию', () => {
  const config = toBftConfig(Config({ workspaceRoot: '/w' }), {
    JIRA_HOST: 'https://jira.example.com',
    CONFLUENCE_HOST: 'https://confluence.example.com',
  })
  assert.equal(config.jira.baseUrl, 'https://jira.example.com')
  assert.equal(config.confluence.baseUrl, 'https://confluence.example.com')
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

test('рабочее пространство чатов по умолчанию — внутренняя папка bft', () => {
  assert.equal(toBftConfig(Config({ workspaceRoot: '/w' }), {}).sessionPath, 'bft')
})

test('рабочее пространство чатов переопределяется строкой профиля', () => {
  const config = toBftConfig(Config({ workspaceRoot: '/w', sessionPath: 'bft/chats' }), {})
  assert.equal(config.sessionPath, 'bft/chats')
})

test('пустой sessionPath — осознанное «не привязывать», а не повод для умолчания', () => {
  // Отличается от остальных путей: пустая строка здесь не «значение не задано», а
  // выключенная привязка, поэтому подставлять 'bft' обратно нельзя.
  assert.equal(toBftConfig(Config({ workspaceRoot: '/w', sessionPath: '' }), {}).sessionPath, '')
  assert.equal(toBftConfig(Config({ workspaceRoot: '/w', sessionPath: '   ' }), {}).sessionPath, '')
})
