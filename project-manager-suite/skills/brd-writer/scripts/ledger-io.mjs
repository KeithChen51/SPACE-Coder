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

// ─────────────────────────────────────────────
// Phase migration graph
// ref: SKILL.md §6
// ─────────────────────────────────────────────

/**
 * Allowed phase transitions.
 * Keys are "from" phases; values are arrays of allowed "to" phases.
 * Conditions noted in comments but not enforced here — callers apply guard logic.
 */
export const PHASE_GRAPH = {
  B:    ['C'],
  C:    ['D.5', 'E'],      // D.5 when should_trigger_d5; E when D.5 already passed
  'D.5': ['E', 'C'],       // E when premises passed; C when premises failed
  E:    ['E.5', 'C'],      // E.5 when all gates pass; C when gates fail
  'E.5': ['F', 'C'],       // F when user confirmed; C when user wants modifications
  F:    ['DONE'],          // save-brd success
  DONE: ['C'],             // reopen for iteration
};

/**
 * Check whether a phase transition is valid.
 * @param {string} from - current phase
 * @param {string} to   - target phase
 * @returns {boolean}
 */
export function isValidTransition(from, to) {
  const allowed = PHASE_GRAPH[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

// ─────────────────────────────────────────────
// Chapter cropping matrix
// ref: references/brd-template.md §各项目类型的章节裁剪规则
// ─────────────────────────────────────────────

/**
 * CHAPTER_MATRIX — keyed by template chapter number (1–13).
 * Each entry:
 *   title            : default Chinese chapter title
 *   commercial_only  : true → skip unless isCommercial
 *   page_dependent   : true → skip unless hasPages
 *   types            : per-type config { status: 'required'|'skip'|'conditional', title_override? }
 */
export const CHAPTER_MATRIX = {
  1: {
    title: '项目背景与机会判断',
    commercial_only: false,
    page_dependent: false,
    types: {
      innovation:     { status: 'required' },
      transformation: { status: 'required', title_override: '项目背景与改造动因' },
      extension:      { status: 'required' },
      integration:    { status: 'required', title_override: '项目背景与集成目的' },
      operational:    { status: 'required' },
      compliance:     { status: 'required', title_override: '项目背景与法规要求' },
    },
  },
  2: {
    title: '商业目标与成功标准',
    commercial_only: false,
    page_dependent: false,
    types: {
      innovation:     { status: 'required' },
      transformation: { status: 'required', title_override: '改造目标指标' },
      extension:      { status: 'required' },
      integration:    { status: 'required', title_override: '集成目标' },
      operational:    { status: 'required', title_override: '效率目标' },
      compliance:     { status: 'required', title_override: '合规达标标准' },
    },
  },
  3: {
    title: '利益相关角色与核心场景',
    commercial_only: false,
    page_dependent: false,
    types: {
      innovation:     { status: 'required' },
      transformation: { status: 'required', title_override: '利益相关角色与当前系统痛点' },
      extension:      { status: 'required' },
      integration:    { status: 'required', title_override: '利益相关角色与上下游系统画像' },
      operational:    { status: 'required', title_override: '内部用户角色与当前工作流' },
      compliance:     { status: 'required', title_override: '利益相关角色与合规影响范围' },
    },
  },
  4: {
    title: '核心价值主张',
    commercial_only: false,
    page_dependent: false,
    types: {
      innovation:     { status: 'required' },
      transformation: { status: 'skip' },
      extension:      { status: 'required' },
      integration:    { status: 'skip' },
      operational:    { status: 'skip' },
      compliance:     { status: 'skip' },
    },
  },
  5: {
    title: '市场与竞品差异化',
    commercial_only: false,
    page_dependent: false,
    types: {
      innovation:     { status: 'required' },
      transformation: { status: 'skip' },
      extension:      { status: 'conditional' },
      integration:    { status: 'skip' },
      operational:    { status: 'skip' },
      compliance:     { status: 'skip' },
    },
  },
  6: {
    title: '核心价值模型',
    commercial_only: false,
    page_dependent: false,
    types: {
      innovation:     { status: 'required' },
      transformation: { status: 'required', title_override: '改造价值模型' },
      extension:      { status: 'required' },
      integration:    { status: 'required', title_override: '集成价值模型' },
      operational:    { status: 'required' },
      compliance:     { status: 'required', title_override: '合规达标模型' },
    },
  },
  7: {
    title: '商业化路径与收入模型',
    commercial_only: true,
    page_dependent: false,
    types: {
      innovation:     { status: 'conditional' },  // only when commercial
      transformation: { status: 'skip' },
      extension:      { status: 'conditional' },  // only when commercial
      integration:    { status: 'skip' },
      operational:    { status: 'skip' },
      compliance:     { status: 'skip' },
    },
  },
  8: {
    title: 'MVP 范围',
    commercial_only: false,
    page_dependent: false,
    types: {
      innovation:     { status: 'required' },
      transformation: { status: 'required', title_override: '改造范围（分期）' },
      extension:      { status: 'required' },
      integration:    { status: 'required', title_override: '集成范围' },
      operational:    { status: 'required' },
      compliance:     { status: 'required', title_override: '整改范围' },
    },
  },
  9: {
    title: '备选方案对比',
    commercial_only: false,
    page_dependent: false,
    types: {
      innovation:     { status: 'required' },
      transformation: { status: 'required', title_override: '备选技术方案对比' },
      extension:      { status: 'required' },
      integration:    { status: 'required' },
      operational:    { status: 'conditional' },
      compliance:     { status: 'conditional' },
    },
  },
  10: {
    title: '关键前提假设',
    commercial_only: false,
    page_dependent: false,
    types: {
      innovation:     { status: 'required' },
      transformation: { status: 'required', title_override: '关键前提假设（兼容性）' },
      extension:      { status: 'required' },
      integration:    { status: 'required', title_override: '关键前提假设（第三方稳定性）' },
      operational:    { status: 'conditional' },
      compliance:     { status: 'conditional' },
    },
  },
  11: {
    title: '关键风险与兜底策略',
    commercial_only: false,
    page_dependent: false,
    types: {
      innovation:     { status: 'required' },
      transformation: { status: 'required', title_override: '关键风险与兜底策略（迁移风险）' },
      extension:      { status: 'required' },
      integration:    { status: 'required', title_override: '关键风险与兜底策略（第三方风险）' },
      operational:    { status: 'conditional' },
      compliance:     { status: 'required' },
    },
  },
  12: {
    title: '阶段性里程碑',
    commercial_only: false,
    page_dependent: false,
    types: {
      innovation:     { status: 'required' },
      transformation: { status: 'required' },
      extension:      { status: 'required' },
      integration:    { status: 'required' },
      operational:    { status: 'required' },
      compliance:     { status: 'required', title_override: '阶段性里程碑（含合规 deadline）' },
    },
  },
  13: {
    title: '页面定位与架构约束',
    commercial_only: false,
    page_dependent: true,
    types: {
      innovation:     { status: 'conditional' },
      transformation: { status: 'conditional' },
      extension:      { status: 'conditional' },
      integration:    { status: 'skip' },          // pure B2B, no C-side
      operational:    { status: 'required' },      // always has backend pages
      compliance:     { status: 'conditional' },
    },
  },
};

/**
 * Compute the chapter plan for a given project context.
 *
 * @param {string}  projectType  - one of: innovation|transformation|extension|integration|operational|compliance
 * @param {boolean} isCommercial - whether the project involves direct monetization
 * @param {boolean} hasPages     - derived via deriveHasPages()
 * @returns {Array<{ template_number: number, title: string, status: string, reason?: string }>}
 */
export function getChapterPlan(projectType, isCommercial, hasPages) {
  const plan = [];

  for (const [numStr, chapter] of Object.entries(CHAPTER_MATRIX)) {
    const num = Number(numStr);
    const typeConfig = chapter.types[projectType];

    // Unknown project type — mark skip
    if (!typeConfig) {
      plan.push({ template_number: num, title: chapter.title, status: 'skip', reason: 'unknown project type' });
      continue;
    }

    // commercial_only filter
    if (chapter.commercial_only && !isCommercial) {
      plan.push({ template_number: num, title: chapter.title, status: 'skip', reason: 'non-commercial project' });
      continue;
    }

    // page_dependent filter
    if (chapter.page_dependent && !hasPages) {
      plan.push({ template_number: num, title: chapter.title, status: 'skip', reason: 'project has no pages' });
      continue;
    }

    // Type-level skip
    if (typeConfig.status === 'skip') {
      plan.push({ template_number: num, title: chapter.title, status: 'skip' });
      continue;
    }

    const resolvedTitle = typeConfig.title_override ?? chapter.title;
    plan.push({ template_number: num, title: resolvedTitle, status: typeConfig.status });
  }

  return plan;
}

// ─────────────────────────────────────────────
// Appendix downstream dependency mapping
// ref: references/brd-template.md §附录：下游交接清单
// ─────────────────────────────────────────────

export const APPENDIX_DEPENDENCIES = [
  {
    downstream_skill: 'page-designer',
    fields: [
      { semantic_name: '利益相关角色',       template_chapters: [3],  optional: false },
      { semantic_name: '各角色痛点与场景',   template_chapters: [3],  optional: false },
      { semantic_name: '核心价值模型',       template_chapters: [6],  optional: false },
      { semantic_name: '付费触发点',         template_chapters: [7],  optional: true  },
      { semantic_name: '页面定位与架构约束', template_chapters: [13], optional: false },
    ],
  },
  {
    downstream_skill: 'page-explainer',
    fields: [
      { semantic_name: '核心价值主张',       template_chapters: [4],  optional: true  },
      { semantic_name: '利益相关角色诉求',   template_chapters: [3],  optional: false },
      { semantic_name: '各端定位',           template_chapters: [13], optional: false },
    ],
  },
  {
    downstream_skill: 'foundation-builder',
    fields: [
      { semantic_name: '指标体系',             template_chapters: [2],  optional: true  },
      { semantic_name: '核心价值模型',         template_chapters: [6],  optional: false },
      { semantic_name: '关键风险与兜底策略',   template_chapters: [11], optional: false },
      { semantic_name: '是否包含C端页面',      template_chapters: [],   optional: false }, // header field
    ],
  },
  {
    downstream_skill: 'prd-writer',
    fields: [
      { semantic_name: '目标与成功标准',       template_chapters: [2],  optional: false },
      { semantic_name: '竞品差异化',           template_chapters: [5],  optional: true  },
      { semantic_name: 'MVP范围',              template_chapters: [8],  optional: false },
      { semantic_name: '功能验收标准 DoD',     template_chapters: [8],  optional: true  },
    ],
  },
];

// ─────────────────────────────────────────────
// Rule conflict definitions
// ─────────────────────────────────────────────

export const RULE_CONFLICTS = [
  {
    id: 'integration_no_c_page',
    check: (header, fieldId) => header.project_type === 'integration' && fieldId === 'has_c_page',
    description: '集成型不允许 C 端页面',
  },
  {
    id: 'no_commercial_monetization',
    check: (header, fieldId) => !header.is_commercial && fieldId.includes('monetization'),
    description: '非直接商业化项目不能锁定变现字段',
  },
  {
    id: 'no_pages_page_field',
    check: (header, fieldId) => !header.has_pages && fieldId.startsWith('page_'),
    description: '无页面项目不能锁定页面定位字段',
  },
];
