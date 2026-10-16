// @ts-check

/** @typedef {import('./types').Example} Example */

/**
 * Bundled, read-only example library. To add an example, append an object here:
 * the id must be unique, and tests/examples.test.js checks that it generates cleanly.
 * Examples carry a script only; loading one keeps the user's build settings.
 *
 * @type {Example[]}
 */
export const EXAMPLES = [
  {
    id: 'basics-hello',
    category: 'Basics',
    title: 'Hello, world',
    description: 'A single chat message. The smallest working script.',
    script: 'say Hello, world!',
  },
  {
    id: 'basics-comments',
    category: 'Basics',
    title: 'Commented script',
    description: 'Lines starting with # are ignored, so you can annotate a script.',
    script: '# Announce the start\nsay Starting\n\n# Announce the end\nsay Done',
  },
  {
    id: 'world-clear-day',
    category: 'World',
    title: 'Clear day',
    description: 'Sets the time to day and clears the weather.',
    script: 'time set day\nweather clear',
  },
  {
    id: 'world-clear-items',
    category: 'World',
    title: 'Clear dropped items',
    description: 'Removes every item entity from loaded chunks and says so.',
    script: 'kill @e[type=item]\nsay Cleared dropped items',
  },
  {
    id: 'world-lightning',
    category: 'World',
    title: 'Lightning at nearest player',
    description: 'Summons a lightning bolt at the player nearest to the machine.',
    script: 'execute at @p run summon lightning_bolt ~ ~ ~',
  },
  {
    id: 'player-speed',
    category: 'Player',
    title: 'Speed boost',
    description: 'Speed III for one minute on the nearest player, without particles.',
    script: 'effect give @p minecraft:speed 60 2 true',
  },
  {
    id: 'player-night-vision',
    category: 'Player',
    title: 'Night vision',
    description: 'Ten minutes of night vision for the nearest player.',
    script: 'effect give @p minecraft:night_vision 600 0 true',
  },
  {
    id: 'player-food',
    category: 'Player',
    title: 'Starter food',
    description: 'Gives the nearest player cooked beef and bread.',
    script: 'give @p minecraft:cooked_beef 32\ngive @p minecraft:bread 16',
  },
  {
    id: 'player-launch',
    category: 'Player',
    title: 'Launch with slow falling',
    description: 'Gives slow falling, then teleports the nearest player 20 blocks up.',
    script: 'effect give @p minecraft:slow_falling 30 0 true\ntp @p ~ ~20 ~',
  },
  {
    id: 'chat-tellraw',
    category: 'Chat',
    title: 'Coloured message',
    description: 'A tellraw message with JSON text. Exercises quote escaping.',
    script: 'tellraw @a {"text":"Welcome to the server","color":"yellow","bold":true}',
  },
  {
    id: 'chat-title',
    category: 'Chat',
    title: 'Title and subtitle',
    description: 'Shows a title screen to everyone. The subtitle is set before the title.',
    script:
      'title @a times 10 60 10\ntitle @a subtitle {"text":"Have fun","color":"gray"}\ntitle @a title {"text":"Welcome","color":"gold"}',
  },
  {
    id: 'scoreboard-kills',
    category: 'Scoreboard',
    title: 'Kill counter sidebar',
    description: 'Creates a player-kill objective and shows it on the sidebar.',
    script: 'scoreboard objectives add kills playerKillCount\nscoreboard objectives setdisplay sidebar kills',
  },
];
