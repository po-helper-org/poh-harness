/**
 * Мобильный скин poh-harness — серверная половина (заглушка).
 *
 * Плагин целиком живёт в браузерной половине (../client/index.ts): вставляет
 * <style> с media-правилами под узкий экран. Серверной конфигурации нет,
 * потому apply() пуст — композиции нужен только факт существования записи.
 */
import type { Context } from '@deepseek-ai/cordis'

export const name = 'poh-mobile-skin'

export function apply(_ctx: Context, _config: Record<string, never>): void {
  /* намеренно пусто: см. комментарий файла */
}
