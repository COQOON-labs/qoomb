/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'style',
        'refactor',
        'test',
        'chore',
        'perf',
        'ci',
        'build',
        'revert',
      ],
    ],
    // Allow any casing in commit subjects (release-please uses lowercase, etc.)
    'subject-case': [0],
    // Allow long bodies (changelogs, migration notes, etc.)
    'body-max-line-length': [0],
  },
  ignores: [
    // GitHub merge commits
    (message) => message.startsWith('Merge'),
    // release-please auto-generated commits
    (message) => /^chore\(main\): release/.test(message),
  ],
};
