#!/usr/bin/env node
/**
 * ledger-io.mjs — shared module for BRD ledger scripts.
 * Not a CLI entry point. Imported by ledger-mutate/query/render.
 */

// ─────────────────────────────────────────────
// Schema version
// ─────────────────────────────────────────────

export const SCHEMA_VERSION = '1.0.0';

// ─────────────────────────────────────────────
// Universal P0 fields
// All definitions trace to: references/p0-fields.md §通用P0
// ─────────────────────────────────────────────

export const UNIVERSAL_P0 = [
  // ref: p0-fields.md #1
  {
    id: 'project_type',
    display_name: '项目类型',
    field_type: 'decision',
    value_type: 'text',
    section: 'universal',
    condition: null,
  },
  // ref: p0-fields.md #2
  {
    id: 'has_c_page',
    display_name: '是否包含C端页面',
    field_type: 'fact',
    value_type: 'text',
    section: 'universal',
    condition: null,
  },
  // ref: p0-fields.md #3
  {
    id: 'is_commercial',
    display_name: '是否涉及直接商业化',
    field_type: 'decision',
    value_type: 'text',
    section: 'universal',
    condition: null,
  },
  // ref: p0-fields.md #4
  {
    id: 'project_background',
    display_name: '项目背景',
    field_type: 'fact',
    value_type: 'text',
    section: 'universal',
    condition: null,
  },
  // ref: p0-fields.md #5
  {
    id: 'stakeholder_roles',
    display_name: '利益相关角色',
    field_type: 'fact',
    value_type: 'text',
    section: 'universal',
    condition: null,
  },
  // ref: p0-fields.md #6
  {
    id: 'core_pain_points',
    display_name: '核心痛点',
    field_type: 'fact',
    value_type: 'text',
    section: 'universal',
    condition: null,
  },
  // ref: p0-fields.md #7
  {
    id: 'goal_success_metric',
    display_name: '目标与成功标准',
    field_type: 'decision',
    value_type: 'text',
    section: 'universal',
    condition: null,
  },
  // ref: p0-fields.md #8
  {
    id: 'core_value_model',
    display_name: '核心价值模型',
    field_type: 'decision',
    value_type: 'text',
    section: 'universal',
    condition: null,
  },
  // ref: p0-fields.md #9
  {
    id: 'scope_definition',
    display_name: '范围定义',
    field_type: 'decision',
    value_type: 'text',
    section: 'universal',
    condition: null,
  },
  // ref: p0-fields.md #10
  {
    id: 'key_risks',
    display_name: '关键风险与兜底策略',
    field_type: 'fact',
    value_type: 'text',
    section: 'universal',
    condition: null,
  },
  // ref: p0-fields.md #11
  {
    id: 'milestones',
    display_name: '阶段性里程碑',
    field_type: 'fact',
    value_type: 'text',
    section: 'universal',
    condition: null,
  },
];

// ─────────────────────────────────────────────
// Type-specific P0 fields
// All definitions trace to: references/p0-fields.md §各类型追加P0
// ─────────────────────────────────────────────

export const TYPE_SPECIFIC_P0 = {
  // ref: p0-fields.md §创新型追加P0
  innovation: [
    // ref: p0-fields.md 创新#12
    {
      id: 'innovation_target_user_scenario',
      display_name: '目标用户与核心场景',
      field_type: 'fact',
      value_type: 'text',
      section: 'innovation',
      condition: null,
    },
    // ref: p0-fields.md 创新#13
    {
      id: 'innovation_current_alternatives',
      display_name: '用户当前替代方案',
      field_type: 'fact',
      value_type: 'text',
      section: 'innovation',
      condition: null,
    },
    // ref: p0-fields.md 创新#14
    {
      id: 'innovation_validation_evidence',
      display_name: '需求验证证据',
      field_type: 'fact',
      value_type: 'text',
      section: 'innovation',
      condition: null,
    },
    // ref: p0-fields.md 创新#15
    {
      id: 'innovation_value_proposition',
      display_name: '核心价值主张',
      field_type: 'decision',
      value_type: 'text',
      section: 'innovation',
      condition: null,
    },
    // ref: p0-fields.md 创新#16
    {
      id: 'innovation_monetization',
      display_name: '变现模式与付费触发点',
      field_type: 'decision',
      value_type: 'text',
      section: 'innovation',
      condition: 'commercial',
    },
    // ref: p0-fields.md 创新#17 — structured: single-record metric
    {
      id: 'innovation_north_star',
      display_name: '北极星指标',
      field_type: 'decision',
      value_type: 'structured',
      schema: ['metric_name', 'formula', 'target', 'period'],
      section: 'innovation',
      condition: null,
    },
    // ref: p0-fields.md 创新#18
    {
      id: 'innovation_auxiliary_metrics',
      display_name: '辅助指标体系',
      field_type: 'decision',
      value_type: 'text',
      section: 'innovation',
      condition: null,
    },
    // ref: p0-fields.md 创新#19
    {
      id: 'innovation_dod',
      display_name: '功能验收标准（DoD）',
      field_type: 'decision',
      value_type: 'text',
      section: 'innovation',
      condition: null,
    },
    // ref: p0-fields.md 创新#20
    {
      id: 'innovation_page_positioning',
      display_name: '页面定位',
      field_type: 'fact',
      value_type: 'text',
      section: 'innovation',
      condition: 'has_pages',
    },
  ],

  // ref: p0-fields.md §改造型追加P0
  transformation: [
    // ref: p0-fields.md 改造#12
    {
      id: 'transformation_current_pain',
      display_name: '当前系统痛点',
      field_type: 'fact',
      value_type: 'text',
      section: 'transformation',
      condition: null,
    },
    // ref: p0-fields.md 改造#13 — structured: single-record metric
    {
      id: 'transformation_target_metric',
      display_name: '改造目标指标',
      field_type: 'decision',
      value_type: 'structured',
      schema: ['dimension', 'baseline', 'target'],
      section: 'transformation',
      condition: null,
    },
    // ref: p0-fields.md 改造#14
    {
      id: 'transformation_alt_comparison',
      display_name: '备选技术方案对比',
      field_type: 'decision',
      value_type: 'text',
      section: 'transformation',
      condition: null,
    },
    // ref: p0-fields.md 改造#15
    {
      id: 'transformation_page_positioning',
      display_name: '页面定位',
      field_type: 'fact',
      value_type: 'text',
      section: 'transformation',
      condition: 'has_pages',
    },
  ],

  // ref: p0-fields.md §扩展型追加P0
  extension: [
    // ref: p0-fields.md 扩展#12
    {
      id: 'extension_target_user_scenario',
      display_name: '目标用户与核心场景',
      field_type: 'fact',
      value_type: 'text',
      section: 'extension',
      condition: null,
    },
    // ref: p0-fields.md 扩展#13
    {
      id: 'extension_validation_evidence',
      display_name: '需求验证证据',
      field_type: 'fact',
      value_type: 'text',
      section: 'extension',
      condition: null,
    },
    // ref: p0-fields.md 扩展#14
    {
      id: 'extension_value_proposition',
      display_name: '核心价值主张',
      field_type: 'decision',
      value_type: 'text',
      section: 'extension',
      condition: null,
    },
    // ref: p0-fields.md 扩展#15 — structured: single-record metric
    {
      id: 'extension_core_metrics',
      display_name: '核心指标',
      field_type: 'decision',
      value_type: 'structured',
      schema: ['metric_name', 'formula', 'target', 'period'],
      section: 'extension',
      condition: null,
    },
    // ref: p0-fields.md 扩展#16
    {
      id: 'extension_dod',
      display_name: '功能验收标准（DoD）',
      field_type: 'decision',
      value_type: 'text',
      section: 'extension',
      condition: null,
    },
    // ref: p0-fields.md 扩展#17
    {
      id: 'extension_monetization',
      display_name: '变现模式与付费触发点',
      field_type: 'decision',
      value_type: 'text',
      section: 'extension',
      condition: 'commercial',
    },
    // ref: p0-fields.md 扩展#18
    {
      id: 'extension_page_positioning',
      display_name: '页面定位',
      field_type: 'fact',
      value_type: 'text',
      section: 'extension',
      condition: 'has_pages',
    },
  ],

  // ref: p0-fields.md §集成型追加P0 — 纯B2B，无页面字段
  integration: [
    // ref: p0-fields.md 集成#12
    {
      id: 'integration_upstream_downstream',
      display_name: '上下游系统画像',
      field_type: 'fact',
      value_type: 'text',
      section: 'integration',
      condition: null,
    },
    // ref: p0-fields.md 集成#13
    {
      id: 'integration_current_method',
      display_name: '当前对接方式',
      field_type: 'fact',
      value_type: 'text',
      section: 'integration',
      condition: null,
    },
    // ref: p0-fields.md 集成#14
    {
      id: 'integration_goal',
      display_name: '集成目标',
      field_type: 'decision',
      value_type: 'text',
      section: 'integration',
      condition: null,
    },
    // ref: p0-fields.md 集成#15
    {
      id: 'integration_alt_comparison',
      display_name: '备选集成方案对比',
      field_type: 'decision',
      value_type: 'text',
      section: 'integration',
      condition: null,
    },
  ],

  // ref: p0-fields.md §运营型追加P0 — 必有后台页面，页面字段通过PAGE_FIELDS注入
  operational: [
    // ref: p0-fields.md 运营#12
    {
      id: 'operational_internal_roles',
      display_name: '内部用户角色',
      field_type: 'fact',
      value_type: 'text',
      section: 'operational',
      condition: null,
    },
    // ref: p0-fields.md 运营#13
    {
      id: 'operational_current_workflow',
      display_name: '当前工作流',
      field_type: 'fact',
      value_type: 'text',
      section: 'operational',
      condition: null,
    },
    // ref: p0-fields.md 运营#14 — structured: single-record metric
    {
      id: 'operational_efficiency_goal',
      display_name: '效率目标',
      field_type: 'decision',
      value_type: 'structured',
      schema: ['dimension', 'baseline', 'target'],
      section: 'operational',
      condition: null,
    },
    // ref: p0-fields.md 运营#15
    {
      id: 'operational_dod',
      display_name: '功能验收标准（DoD）',
      field_type: 'decision',
      value_type: 'text',
      section: 'operational',
      condition: null,
    },
  ],

  // ref: p0-fields.md §合规型追加P0
  compliance: [
    // ref: p0-fields.md 合规#12
    {
      id: 'compliance_gap',
      display_name: '当前合规差距',
      field_type: 'fact',
      value_type: 'text',
      section: 'compliance',
      condition: null,
    },
    // ref: p0-fields.md 合规#13
    {
      id: 'compliance_standard',
      display_name: '合规达标标准',
      field_type: 'decision',
      value_type: 'text',
      section: 'compliance',
      condition: null,
    },
    // ref: p0-fields.md 合规#14
    {
      id: 'compliance_scope_priority',
      display_name: '整改范围与优先级',
      field_type: 'decision',
      value_type: 'text',
      section: 'compliance',
      condition: null,
    },
    // ref: p0-fields.md 合规#15
    {
      id: 'compliance_page_positioning',
      display_name: '页面定位',
      field_type: 'fact',
      value_type: 'text',
      section: 'compliance',
      condition: 'has_pages',
    },
  ],
};

// ─────────────────────────────────────────────
// Page fields
// ref: p0-fields.md §页面定位全套字段
// ─────────────────────────────────────────────

export const PAGE_FIELDS = [
  // ref: p0-fields.md 页面#1
  {
    id: 'page_coverage',
    display_name: '项目覆盖对象',
    field_type: 'fact',
    value_type: 'text',
    section: 'page',
    condition: null,
  },
  // ref: p0-fields.md 页面#2
  {
    id: 'page_target_users',
    display_name: '各端目标用户',
    field_type: 'fact',
    value_type: 'text',
    section: 'page',
    condition: null,
  },
  // ref: p0-fields.md 页面#3
  {
    id: 'page_primary_use',
    display_name: '各端主要用途',
    field_type: 'fact',
    value_type: 'text',
    section: 'page',
    condition: null,
  },
  // ref: p0-fields.md 页面#4
  {
    id: 'page_positioning',
    display_name: '页面定位判断',
    field_type: 'fact',
    value_type: 'text',
    section: 'page',
    condition: null,
  },
  // ref: p0-fields.md 页面#5
  {
    id: 'page_structure',
    display_name: '单页整合vs多入口拆分',
    field_type: 'fact',
    value_type: 'text',
    section: 'page',
    condition: null,
  },
  // ref: p0-fields.md 页面#6
  {
    id: 'page_downstream_boundary',
    display_name: '下游待确认边界',
    field_type: 'fact',
    value_type: 'text',
    section: 'page',
    condition: null,
  },
];

// ─────────────────────────────────────────────
// Helper: derive hasPages from project type and hasCPage flag
// ref: p0-fields.md §集成型（纯B）/ §运营型（必有后台页面）
// ─────────────────────────────────────────────

/**
 * Derive whether the project has pages.
 * @param {string} projectType - one of: innovation|transformation|extension|integration|operational|compliance
 * @param {boolean} hasCPage - whether the project has C-side pages (from universal field has_c_page)
 * @returns {boolean}
 */
export function deriveHasPages(projectType, hasCPage) {
  if (projectType === 'integration') return false;   // pure B2B, never has pages
  if (projectType === 'operational') return true;    // always has backend pages
  return Boolean(hasCPage);
}

// ─────────────────────────────────────────────
// Helper: build the full field set for a given project context
// ─────────────────────────────────────────────

/**
 * Build the complete ordered field set for a BRD project.
 * Returns field definitions only — no value/status (those are added by init).
 *
 * @param {string} projectType - one of: innovation|transformation|extension|integration|operational|compliance
 * @param {boolean} hasCPage - raw value of has_c_page universal field
 * @param {boolean} isCommercial - raw value of is_commercial universal field
 * @returns {Array<Object>} ordered array of field definition objects
 */
export function buildFieldSet(projectType, hasCPage, isCommercial) {
  const hasPages = deriveHasPages(projectType, hasCPage);

  const typeFields = (TYPE_SPECIFIC_P0[projectType] ?? []).filter((field) => {
    if (field.condition === 'commercial' && !isCommercial) return false;
    if (field.condition === 'has_pages' && !hasPages) return false;
    return true;
  });

  const pageFields = hasPages ? PAGE_FIELDS : [];

  return [...UNIVERSAL_P0, ...typeFields, ...pageFields];
}
