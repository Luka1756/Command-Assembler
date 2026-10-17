// @ts-check

/**
 * Block identifiers for the 3D editor.
 *
 * Validation checks the SHAPE of an identifier (namespace:path, lowercase, no block states or NBT).
 * It does not check that the block exists in the game: no registry is bundled, and the list below
 * is a set of common blocks for the picker, not a complete or version-verified list. An id that
 * passes validation but does not exist makes the game reject the command.
 */

export const MAX_BLOCK_ID_LENGTH = 100;

const NAMESPACE = /^[a-z0-9_.-]+$/;
const PATH = /^[a-z0-9_./-]+$/;
// Air placed as a block would make "erased" cells indistinguishable from placed ones. Use Erase.
const AIR_PATHS = new Set(['air', 'cave_air', 'void_air']);

/**
 * @param {string} input
 * @returns {{ ok: true, id: string } | { ok: false, error: string }}
 */
export function normalizeBlockId(input) {
  if (typeof input !== 'string') return { ok: false, error: 'Enter a block id such as minecraft:glass.' };
  const text = input.trim().toLowerCase();
  if (text === '') return { ok: false, error: 'Enter a block id such as minecraft:glass.' };
  if (text.length > MAX_BLOCK_ID_LENGTH) {
    return { ok: false, error: `A block id can be at most ${MAX_BLOCK_ID_LENGTH} characters.` };
  }
  if (/[[\]{}]/.test(text)) {
    return { ok: false, error: 'Block states and NBT are not supported. Enter only the block id, such as minecraft:glass.' };
  }
  if (text.startsWith('#')) return { ok: false, error: 'Block tags are not supported. Enter a block id.' };

  let namespace = 'minecraft';
  let path = text;
  const colon = text.indexOf(':');
  if (colon !== -1) {
    namespace = text.slice(0, colon);
    path = text.slice(colon + 1);
  }
  if (path === '' || path.includes(':') || !NAMESPACE.test(namespace) || !PATH.test(path)) {
    return {
      ok: false,
      error: 'Use letters, numbers and _ . - only, in the form minecraft:glass (or just glass).',
    };
  }
  if (namespace === 'minecraft' && AIR_PATHS.has(path)) {
    return { ok: false, error: 'Air cannot be placed as a block. Use the Erase tool to leave a cell empty.' };
  }
  return { ok: true, id: `${namespace}:${path}` };
}

const COMMON_PATHS = [
  'bedrock', 'glass', 'stone', 'cobblestone', 'stone_bricks', 'smooth_stone', 'andesite', 'diorite', 'granite',
  'deepslate', 'deepslate_bricks', 'polished_deepslate', 'blackstone', 'polished_blackstone', 'obsidian',
  'crying_obsidian', 'netherrack', 'nether_bricks', 'end_stone', 'end_stone_bricks', 'purpur_block',
  'quartz_block', 'smooth_quartz', 'sandstone', 'smooth_sandstone', 'red_sandstone', 'sand', 'gravel', 'dirt',
  'grass_block', 'oak_planks', 'spruce_planks', 'birch_planks', 'jungle_planks', 'acacia_planks',
  'dark_oak_planks', 'mangrove_planks', 'cherry_planks', 'bamboo_planks', 'crimson_planks', 'warped_planks',
  'oak_log', 'spruce_log', 'birch_log', 'bricks', 'mud_bricks', 'clay', 'terracotta', 'white_terracotta',
  'white_concrete', 'light_gray_concrete', 'gray_concrete', 'black_concrete', 'brown_concrete', 'red_concrete',
  'orange_concrete', 'yellow_concrete', 'white_wool', 'light_gray_wool', 'gray_wool', 'black_wool',
  'brown_wool', 'red_wool', 'orange_wool', 'yellow_wool', 'white_stained_glass', 'light_gray_stained_glass',
  'gray_stained_glass', 'black_stained_glass', 'tinted_glass', 'iron_block', 'gold_block', 'copper_block',
  'diamond_block', 'lapis_block', 'redstone_block', 'coal_block', 'netherite_block', 'glowstone',
  'sea_lantern', 'shroomlight', 'barrier', 'iron_bars', 'ice', 'packed_ice', 'blue_ice', 'snow_block',
  'sponge', 'slime_block', 'honey_block', 'tnt', 'bookshelf', 'hay_block', 'bone_block', 'prismarine',
  'dark_prismarine', 'prismarine_bricks', 'smooth_basalt', 'basalt', 'calcite', 'tuff', 'dripstone_block',
  'moss_block', 'mud', 'packed_mud', 'amethyst_block',
];

/** Common block ids offered by the picker. Not a complete list; any valid id can be typed. */
export const COMMON_BLOCK_IDS = COMMON_PATHS.map((path) => `minecraft:${path}`);
