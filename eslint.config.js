import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { ignores: ['dist', 'node_modules'] },
  {
    // Rules 1 & 2 (§19.2): the simulation is renderer-free and deterministic.
    // These are build failures, not conventions.
    files: ['src/simulation/**/*.ts', 'src/map/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['phaser', 'phaser/*', '**/rendering/*', '**/ui/*', '**/input/*'] },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded Random (§19.2 Rule 2).' },
        { object: 'Date', property: 'now', message: 'Time is tick count (§19.2 Rule 2).' },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'performance', message: 'No wall-clock reads in the simulation (§19.2 Rule 2).' },
      ],
    },
  },
)
