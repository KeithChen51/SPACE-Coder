import fs from 'node:fs';
import path from 'node:path';

const [inputDirArg, outputPathArg] = process.argv.slice(2);

if (!inputDirArg || !outputPathArg) {
  console.error('Usage: node generate-astryx-component-map.mjs <astryx-cli-output-dir> <output-json>');
  process.exit(1);
}

const inputDir = path.resolve(inputDirArg);
const outputPath = path.resolve(outputPathArg);
const listJsonPath = path.join(inputDir, 'component-list.json');
const listTextPath = path.join(inputDir, 'component-list.txt');

const readUtf8 = (filePath) => fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');

const listJson = JSON.parse(readUtf8(listJsonPath));
const listText = readUtf8(listTextPath);

const importByName = {};
for (const line of listText.split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Za-z][A-Za-z0-9]*)\s+←\s+(.+)$/);
  if (match) importByName[match[1]] = match[2].trim();
}

const mappingTypes = {
  direct_map: '名称和语义基本一致，可作为我们组件族的直接候选。',
  semantic_map: '能力一致但命名、API、token 和实现按我们技术方案重建。',
  pattern_only: '只吸收交互、信息架构、可访问性模式，暂不进入首批 runtime。',
  defer: '有效但非通用高频，后续按项目需求再评估。',
  reject: '不适合吸收。当前版本没有 reject 项。'
};

const familyDefaults = {
  'app-frame': {
    mapping_type: 'semantic_map',
    adoption_priority: 'P1',
    implementation_strategy: 'own_navigation_or_frame_component',
    tokens_needed: ['surface', 'border', 'spacing', 'density'],
    must_have_states: ['desktop', 'narrow', 'mobile'],
    capabilities_to_absorb: ['frame slots', 'navigation state', 'responsive region policy']
  },
  layout: {
    mapping_type: 'semantic_map',
    adoption_priority: 'P1',
    implementation_strategy: 'own_layout_primitive',
    tokens_needed: ['spacing', 'surface', 'border'],
    must_have_states: ['desktop', 'narrow', 'mobile'],
    capabilities_to_absorb: ['region slots', 'spacing rhythm', 'responsive contract']
  },
  button: {
    mapping_type: 'direct_map',
    adoption_priority: 'P0',
    implementation_strategy: 'own_component',
    tokens_needed: ['color-action', 'height-control', 'radius-control', 'focus-ring'],
    must_have_states: ['default', 'hover', 'active', 'focus-visible', 'disabled', 'loading'],
    capabilities_to_absorb: ['variants', 'sizes', 'loading', 'disabled', 'accessible name']
  },
  field: {
    mapping_type: 'semantic_map',
    adoption_priority: 'P1',
    implementation_strategy: 'own_or_wrap_accessible_field_component',
    tokens_needed: ['height-control', 'border', 'radius-control', 'text-muted', 'focus-ring'],
    must_have_states: ['default', 'focus', 'disabled', 'loading', 'error', 'helper'],
    capabilities_to_absorb: ['label', 'helper', 'error', 'keyboard behavior', 'aria-describedby']
  },
  'data-table': {
    mapping_type: 'semantic_map',
    adoption_priority: 'P0',
    implementation_strategy: 'own_component_with_astryx_capability_reference',
    tokens_needed: ['density', 'row-height', 'border', 'surface', 'data-color'],
    must_have_states: ['loading', 'empty', 'error', 'permission denied', 'partial data'],
    capabilities_to_absorb: ['column definitions', 'sorting', 'filtering', 'pagination', 'selection', 'sticky columns', 'column resize', 'row expansion']
  },
  dialog: {
    mapping_type: 'semantic_map',
    adoption_priority: 'P0',
    implementation_strategy: 'own_accessible_dialog_component',
    tokens_needed: ['surface', 'shadow', 'radius-panel', 'spacing', 'focus-ring'],
    must_have_states: ['open', 'closing', 'loading', 'error', 'unsaved changes'],
    capabilities_to_absorb: ['focus trap', 'Escape close', 'return focus', 'background inert']
  },
  overlay: {
    mapping_type: 'semantic_map',
    adoption_priority: 'P1',
    implementation_strategy: 'own_or_wrap_accessible_overlay_library',
    tokens_needed: ['overlay', 'surface', 'shadow', 'radius-panel', 'focus-ring'],
    must_have_states: ['closed', 'open', 'active', 'disabled'],
    capabilities_to_absorb: ['layering', 'dismiss behavior', 'keyboard navigation']
  },
  status: {
    mapping_type: 'semantic_map',
    adoption_priority: 'P0',
    implementation_strategy: 'own_status_primitives',
    tokens_needed: ['status-success', 'status-warning', 'status-danger', 'status-info'],
    must_have_states: ['success', 'warning', 'danger', 'info', 'neutral'],
    capabilities_to_absorb: ['stable semantic status', 'compact metadata', 'count and filter chips']
  },
  'resource-state': {
    mapping_type: 'semantic_map',
    adoption_priority: 'P0',
    implementation_strategy: 'own_resource_state_component',
    tokens_needed: ['surface-muted', 'text-muted', 'status-color', 'skeleton-color'],
    must_have_states: ['loading', 'empty', 'error', 'permission denied', 'partial data'],
    capabilities_to_absorb: ['nearby feedback', 'empty explanation', 'recoverable error copy']
  },
  'agent-input': {
    mapping_type: 'semantic_map',
    adoption_priority: 'P0',
    implementation_strategy: 'own_agent_ui_component',
    tokens_needed: ['surface', 'border', 'spacing', 'focus-ring'],
    must_have_states: ['empty', 'typing', 'submitting', 'disabled', 'approval blocking'],
    capabilities_to_absorb: ['composer input', 'control row', 'attached context', 'send or stop action']
  },
  'agent-output': {
    mapping_type: 'semantic_map',
    adoption_priority: 'P0',
    implementation_strategy: 'own_agent_ui_component',
    tokens_needed: ['surface', 'spacing', 'text-muted', 'status-color'],
    must_have_states: ['user', 'assistant', 'system', 'streaming', 'collapsed'],
    capabilities_to_absorb: ['document flow', 'message metadata', 'streaming state', 'artifact panel slot']
  },
  'agent-event-row': {
    mapping_type: 'semantic_map',
    adoption_priority: 'P0',
    implementation_strategy: 'own_agent_event_component',
    tokens_needed: ['text-muted', 'status-color', 'spacing-compact'],
    must_have_states: ['pending', 'running', 'success', 'warning', 'error', 'collapsed'],
    capabilities_to_absorb: ['tool call grouping', 'low-emphasis event rows', 'collapsed technical detail']
  },
  'command-palette': {
    mapping_type: 'semantic_map',
    adoption_priority: 'P2',
    implementation_strategy: 'own_or_wrap_command_palette_library',
    tokens_needed: ['overlay', 'surface', 'focus-ring', 'spacing'],
    must_have_states: ['closed', 'open', 'searching', 'empty', 'keyboard navigation'],
    capabilities_to_absorb: ['global command search', 'grouped results', 'keyboard navigation']
  },
  navigation: {
    mapping_type: 'semantic_map',
    adoption_priority: 'P2',
    implementation_strategy: 'own_link_or_navigation_component',
    tokens_needed: ['link-color', 'text-muted', 'focus-ring', 'spacing'],
    must_have_states: ['default', 'current', 'hover', 'focus-visible', 'disabled'],
    capabilities_to_absorb: ['current route state', 'router adapter', 'hierarchy']
  },
  list: {
    mapping_type: 'semantic_map',
    adoption_priority: 'P1',
    implementation_strategy: 'own_list_component',
    tokens_needed: ['spacing', 'border', 'density', 'focus-ring'],
    must_have_states: ['default', 'hover', 'selected', 'empty', 'disabled'],
    capabilities_to_absorb: ['edge-to-edge rows', 'dividers', 'interactive item slots']
  },
  content: {
    mapping_type: 'semantic_map',
    adoption_priority: 'P2',
    implementation_strategy: 'own_or_wrap_content_renderer',
    tokens_needed: ['font-family', 'font-size', 'line-height', 'text-color', 'text-muted'],
    must_have_states: ['default', 'overflow'],
    capabilities_to_absorb: ['typography semantics', 'copy action where relevant']
  },
  container: {
    mapping_type: 'semantic_map',
    adoption_priority: 'P2',
    implementation_strategy: 'own_container_component',
    tokens_needed: ['surface', 'border', 'radius-card', 'shadow', 'spacing'],
    must_have_states: ['default', 'hover', 'selected', 'disabled'],
    capabilities_to_absorb: ['surface variants', 'selection or click state']
  },
  media: {
    mapping_type: 'pattern_only',
    adoption_priority: 'P3',
    implementation_strategy: 'defer_until_media_or_gallery_need',
    tokens_needed: ['surface-muted', 'radius-card', 'spacing'],
    must_have_states: ['loaded', 'loading', 'error'],
    capabilities_to_absorb: ['media ratio', 'thumbnail state', 'gallery pattern']
  },
  theme: {
    mapping_type: 'pattern_only',
    adoption_priority: 'P2',
    implementation_strategy: 'token_and_theme_bridge_not_runtime_dependency',
    tokens_needed: ['color', 'typography', 'radius', 'motion', 'spacing'],
    must_have_states: ['light', 'dark', 'system'],
    capabilities_to_absorb: ['token bridge', 'theme provider pattern', 'component variant strategy']
  },
  accessibility: {
    mapping_type: 'direct_map',
    adoption_priority: 'P0',
    implementation_strategy: 'own_utility',
    tokens_needed: [],
    must_have_states: ['default'],
    capabilities_to_absorb: ['screen-reader-only content']
  }
};

const explicit = {
  AppShell: ['AppFrame', 'app-frame', 'P0'],
  Layout: ['Layout', 'layout', 'P0'],
  LayoutContent: ['LayoutContent', 'layout', 'P0'],
  LayoutPanel: ['InspectorPanel', 'layout', 'P0'],
  Button: ['Button', 'button', 'P0'],
  ButtonGroup: ['ButtonGroup', 'button', 'P0'],
  IconButton: ['IconButton', 'button', 'P0'],
  ToggleButton: ['ToggleButton', 'button', 'P1'],
  ToggleButtonGroup: ['ToggleButtonGroup', 'button', 'P1'],
  TextInput: ['TextField', 'field', 'P0'],
  TextArea: ['TextAreaField', 'field', 'P1'],
  Selector: ['SelectField', 'field', 'P0'],
  SelectorOption: ['SelectOption', 'field', 'P0'],
  MultiSelector: ['MultiSelectField', 'field', 'P1'],
  Typeahead: ['Combobox', 'field', 'P1'],
  BaseTypeahead: ['BaseCombobox', 'field', 'P2'],
  Field: ['FieldShell', 'field', 'P0'],
  FieldLabel: ['FieldLabel', 'field', 'P0'],
  FieldStatus: ['FieldStatus', 'field', 'P0'],
  Table: ['DataTable', 'data-table', 'P0'],
  TableCell: ['DataTableCell', 'data-table', 'P0'],
  TableHeaderCell: ['DataTableHeaderCell', 'data-table', 'P0'],
  TableRow: ['DataTableRow', 'data-table', 'P0'],
  Pagination: ['TablePagination', 'resource-state', 'P0'],
  Dialog: ['Dialog', 'dialog', 'P0'],
  DialogHeader: ['DialogHeader', 'dialog', 'P0'],
  AlertDialog: ['ConfirmDialog', 'dialog', 'P0'],
  EmptyState: ['ResourcePanel', 'resource-state', 'P0'],
  Skeleton: ['Skeleton', 'resource-state', 'P0'],
  Spinner: ['Spinner', 'resource-state', 'P1'],
  ProgressBar: ['ProgressBar', 'resource-state', 'P1'],
  Toast: ['Toast', 'resource-state', 'P1'],
  Badge: ['StatusBadge', 'status', 'P0'],
  StatusDot: ['StatusDot', 'status', 'P0'],
  Token: ['CodeToken', 'status', 'P1'],
  ChatComposer: ['AgentComposer', 'agent-input', 'P0'],
  ChatComposerInput: ['AgentComposerInput', 'agent-input', 'P0'],
  ChatSendButton: ['AgentSendButton', 'agent-input', 'P0'],
  ChatToolCalls: ['AgentEventRow', 'agent-event-row', 'P0'],
  ChatLayout: ['AgentChatLayout', 'agent-output', 'P0'],
  ChatMessage: ['AgentMessage', 'agent-output', 'P0'],
  ChatMessageList: ['AgentMessageList', 'agent-output', 'P0'],
  ChatMessageMetadata: ['AgentMessageMeta', 'agent-output', 'P1'],
  ChatMessageBubble: ['UserMessageBubble', 'agent-output', 'P1'],
  ChatSystemMessage: ['AgentSystemMessage', 'agent-output', 'P1'],
  ChatTokenizedText: ['TokenizedText', 'agent-output', 'P2'],
  ChatLayoutScrollButton: ['ScrollToLatestButton', 'agent-output', 'P2'],
  CommandPalette: ['CommandPalette', 'command-palette', 'P2'],
  CommandPaletteInput: ['CommandPaletteInput', 'command-palette', 'P2'],
  CommandPaletteList: ['CommandPaletteList', 'command-palette', 'P2'],
  CommandPaletteItem: ['CommandPaletteItem', 'command-palette', 'P2'],
  CommandPaletteGroup: ['CommandPaletteGroup', 'command-palette', 'P2'],
  CommandPaletteEmpty: ['CommandPaletteEmpty', 'command-palette', 'P2'],
  PowerSearch: ['PowerSearch', 'command-palette', 'P1'],
  VisuallyHidden: ['VisuallyHidden', 'accessibility', 'P0'],
  Theme: ['ThemeProvider', 'theme', 'P1'],
  LinkProvider: ['LinkAdapter', 'theme', 'P1'],
  MediaTheme: ['MediaTheme', 'theme', 'P3']
};

const groupFamilies = [
  [/Avatar/, 'Avatar', 'content', 'P2'],
  [/Breadcrumb/, 'Breadcrumbs', 'navigation', 'P2'],
  [/Calendar|Date|Time|Number|Checkbox|Radio|Switch|Slider|File|Input|Tokenizer/, null, 'field', 'P1'],
  [/Card|Collapsible|Section/, null, 'container', 'P2'],
  [/Carousel|AspectRatio|Lightbox|Thumbnail/, null, 'media', 'P3'],
  [/ContextMenu|Dropdown|Popover|HoverCard|Tooltip|Overlay|MoreMenu/, null, 'overlay', 'P1'],
  [/Divider|Grid|Center|FormLayout|Stack|Toolbar/, null, 'layout', 'P1'],
  [/SideNav|TopNav|MobileNav|Nav/, null, 'app-frame', 'P1'],
  [/List|Item|TreeList|OverflowList/, null, 'list', 'P1'],
  [/Markdown|CodeBlock|Citation|Blockquote|Kbd|Text|Timestamp/, null, 'content', 'P2'],
  [/Icon/, 'Icon', 'status', 'P0']
];

function classify(name) {
  if (explicit[name]) return explicit[name];
  for (const [pattern, componentName, family, priority] of groupFamilies) {
    if (pattern.test(name)) return [componentName || name, family, priority];
  }
  return [name, 'content', 'P3'];
}

function refine(name, family, defaults) {
  const entry = {...defaults};
  if (name.includes('MegaMenu') || name === 'Carousel' || name === 'Lightbox' || name === 'Outline' || name === 'OverflowList') {
    entry.mapping_type = 'defer';
    entry.adoption_priority = 'P3';
    entry.implementation_strategy = 'defer_until_project_need';
  }
  if (name.endsWith('Item') || name.endsWith('Header') || name.endsWith('Label') || name.endsWith('Status') || name.endsWith('Cell') || name.endsWith('Row')) {
    entry.implementation_strategy = `part_of_${family.replace(/-/g, '_')}`;
  }
  if (name === 'ContextMenu' || name === 'HoverCard') {
    entry.mapping_type = 'pattern_only';
    entry.adoption_priority = 'P3';
  }
  if (name === 'ChatDictationButton') {
    entry.mapping_type = 'defer';
    entry.adoption_priority = 'P3';
    entry.implementation_strategy = 'defer_until_voice_input';
  }
  return entry;
}

const entries = [];

for (const [group, components] of Object.entries(listJson.data)) {
  for (const component of components) {
    const [ourComponent, family, priority] = classify(component.name);
    const defaults = refine(component.name, family, familyDefaults[family] || familyDefaults.content);
    entries.push({
      astryx_component: component.name,
      astryx_group: group,
      astryx_package: component.package,
      astryx_import: importByName[component.name] || component.package,
      our_component: ourComponent,
      our_family: family,
      mapping_type: defaults.mapping_type,
      adoption_priority: priority || defaults.adoption_priority,
      implementation_strategy: defaults.implementation_strategy,
      capabilities_to_absorb: defaults.capabilities_to_absorb,
      tokens_needed: defaults.tokens_needed,
      must_have_states: defaults.must_have_states,
      notes: defaults.mapping_type === 'semantic_map'
        ? '吸收组件能力和状态模型，命名、API、token、实现按部门技术方案设计。'
        : '按映射类型处理，不照搬 Astryx 源码或 props。'
    });
  }
}

const summary = entries.reduce((acc, entry) => {
  acc.total_components += 1;
  acc.by_mapping_type[entry.mapping_type] = (acc.by_mapping_type[entry.mapping_type] || 0) + 1;
  acc.by_priority[entry.adoption_priority] = (acc.by_priority[entry.adoption_priority] || 0) + 1;
  acc.by_family[entry.our_family] = (acc.by_family[entry.our_family] || 0) + 1;
  return acc;
}, {total_components: 0, by_mapping_type: {}, by_priority: {}, by_family: {}});

const output = {
  schema_version: '0.1',
  source: {
    name: 'Astryx',
    core_package: '@astryxdesign/core',
    cli_package: '@astryxdesign/cli',
    version: '0.1.4',
    license: 'MIT',
    source_command: 'npx astryx --json component --list',
    generated_at: '2026-07-09',
    notes: [
      'Covers every component returned by Astryx CLI v0.1.4 component --list.',
      'Maps capability and semantics, not source code or props.',
      'Do not treat Astryx as the default runtime dependency for the department kit.'
    ]
  },
  mapping_types: mappingTypes,
  summary,
  entries
};

fs.mkdirSync(path.dirname(outputPath), {recursive: true});
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(summary, null, 2));
