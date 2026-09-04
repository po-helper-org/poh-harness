/**
 * Caveman response style as a global system-prompt section.
 *
 * Why a section and not a persona: every shipped agent preset (`standard`,
 * `ptc`, `cordis`) mounts its own `@deepseek-ai/dsh-persona` row under the
 * `deployment:persona` section name, which SHADOWS the deployment persona
 * configured on the host `system-prompt` row. A host-level persona patch is
 * therefore silently inert. A section registered under a DIFFERENT name in the
 * global layer is merged into every agent scope instead, so one host row
 * reaches all presets without forking any preset composition.
 *
 * Section order 10 places the style directly after the persona (order 0) and
 * well before `PLAN_POLICY` (500) and the tool guidance blocks (>= 1000).
 *
 * Style source: the `caveman` Claude Code plugin by JuliusBrussee
 * (https://github.com/JuliusBrussee/caveman), condensed to the rules that
 * survive without its skill-loading machinery.
 * @module dsh-plugin-caveman
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-system-prompt'

/** Cordis plugin name. */
export const name = 'caveman-style'

/** The prompt registry this row contributes to. */
export const inject = ['systemPrompt']

/** Compression intensity levels, mirroring the upstream caveman skill. */
export type CavemanLevel = 'lite' | 'full' | 'ultra'

/** Plugin config: the response-style contract this row contributes. */
export interface Config {
  /**
   * Compression intensity. `lite` drops filler only, `full` is classic
   * caveman, `ultra` additionally strips conjunctions where cause and effect
   * stay unambiguous.
   */
  level?: CavemanLevel
  /**
   * Keep code, commit messages, PR descriptions, security warnings,
   * irreversible-action confirmations, and multi-step instructions in normal
   * prose (the upstream Auto-Clarity carve-out).
   */
  preserveCodeStyle?: boolean
  /**
   * Section sort order. The default sits just after the persona (0) and before
   * every plan, team, and tool guidance section.
   */
  order?: number
}

/** Runtime schema for the caveman style row. */
export const Config: z<Config> = z.object({
  level: z.union(['lite', 'full', 'ultra'] as const).default('ultra'),
  preserveCodeStyle: z.boolean().default(true),
  order: z.number().default(10),
})

const LEVEL_RULES: Record<CavemanLevel, string> = {
  lite: 'Level lite. Drop filler and hedging. Keep articles and full sentences. Professional but tight.',
  full: 'Level full. Drop articles, filler, and pleasantries. Fragments fine. Short synonyms (big not extensive, fix not "implement a solution for").',
  ultra: 'Level ultra. Drop articles, filler, pleasantries, and hedging. Strip conjunctions when cause and effect stay unambiguous. One word when one word is enough. State each fact once.',
}

const BASE_RULES = [
  'Respond like a terse expert. Every piece of technical substance stays; only fluff dies.',
  'Drop: articles (a/an/the), filler (just, really, basically, actually, simply), pleasantries (sure, certainly, of course, happy to), hedging, and preamble.',
  'No narration of tool calls, no decorative tables, no emoji, no restating the question back.',
  'Never dump long raw error logs unless asked — quote the shortest decisive line, verbatim.',
  'Never invent abbreviations (cfg, impl, req, res, fn, auth). The tokenizer splits them the same as the full word: zero tokens saved, reader still has to decode. Standard well-known acronyms (DB, API, HTTP, CLI) are fine.',
  'No causal arrows (→). They cost their own token and save nothing.',
  'Preserve the user\'s dominant language. User writes Russian, you answer in compressed Russian. Compress the style, not the language. No forced English openings or status phrases.',
  'Keep verbatim regardless of language: technical terms, code, file paths, API names, CLI commands, commit-type keywords (feat/fix/...), and exact error strings.',
  'Never name or announce this style, never write a normal answer plus a compressed recap. Answer once, compressed. Exception: the user explicitly asks what the style is.',
  'Pattern: `[thing] [action] [reason]. [next step].` Not "Sure! I\'d be happy to help. The issue you\'re experiencing is likely caused by..." but "Bug in auth middleware. Token expiry check uses `<` not `<=`. Fix:"',
] as const

const CLARITY_RULES = [
  'Write normally, in full sentences, for: code and code comments, commit messages, PR descriptions, security warnings, confirmations of irreversible or destructive actions, and multi-step sequences where fragment order or an omitted conjunction risks a misread.',
  'Also drop compression whenever compressing would create technical ambiguity, and whenever the user asks you to clarify or repeats a question. Resume compressed style right after the part that needed clarity.',
] as const

const CONTROL_RULES = [
  'This style is active in every response and does not decay over a long conversation. It stays active when you are unsure.',
  'The user switches intensity with `/caveman lite|full|ultra` and turns it off with "stop caveman" or "normal mode"; honor either immediately for the rest of the session.',
] as const

/**
 * Build the model-facing style section text.
 * @param config - resolved level and carve-out policy.
 * @returns the rendered section body.
 */
export function buildStyleText(config: Config): string {
  const level = config.level ?? 'ultra'
  const lines = [
    '## Response style',
    '',
    LEVEL_RULES[level],
    '',
    ...BASE_RULES.map(rule => `- ${rule}`),
    ...((config.preserveCodeStyle ?? true) ? CLARITY_RULES.map(rule => `- ${rule}`) : []),
    ...CONTROL_RULES.map(rule => `- ${rule}`),
  ]
  return lines.join('\n')
}

/**
 * Register the caveman style section in the calling context's layer.
 * @param ctx - the mounting context; the host tree's global layer merges into every agent scope.
 * @param config - the level, carve-out policy, and section order.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'style:caveman',
    order: config.order ?? 10,
    text: buildStyleText(config),
  }), 'caveman.section()')
}
