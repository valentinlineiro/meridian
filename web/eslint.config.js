import tseslint from 'typescript-eslint';
import angular from 'angular-eslint';

export default tseslint.config(
  // evaluation-fixtures.ts es generado (web/scripts/evaluation-fixtures.gen.ts)
  { ignores: ['dist/**', '.angular/**', 'src/app/features/evaluations/evaluation-fixtures.ts'] },
  {
    files: ['src/**/*.ts'],
    extends: [...tseslint.configs.recommended, ...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^_', ignoreRestSiblings: true }],
      // prefijos de selector: cosmético, mezcla histórica
      '@angular-eslint/directive-selector': 'off',
      '@angular-eslint/component-selector': 'off',
    },
  },
  { files: ['src/**/*.spec.ts'], rules: { '@typescript-eslint/no-explicit-any': 'off' } },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
  },
  {
    // el fondo del modal cierra con clic; el teclado cierra con Escape (otro manejador)
    files: ['src/**/match-detail-modal.component.ts/*.html', 'src/**/games-entry-modal.component.ts/*.html'],
    rules: { '@angular-eslint/template/click-events-have-key-events': 'off', '@angular-eslint/template/interactive-supports-focus': 'off' },
  },
);
