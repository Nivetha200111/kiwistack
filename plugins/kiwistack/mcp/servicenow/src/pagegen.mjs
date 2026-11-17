// @ts-check
// Page compiler: a short "attention board" spec -> a complete kiwi bundle for a Next Experience
// workspace page (route, screen type, screen, page macroponent, client scripts, render include,
// navigation relay event, optional audience). Element shapes are the ones verified rendering in
// Service Operations Workspace on a Brazil PDI (P1 attention board run, 2026-11-17).
//
// Data comes from the OOTB "GlideRecord Collection Query" GraphQL broker, so reads run under the
// tables' existing ACLs and no new ACL (which needs security_admin) is required.

import { randomBytes } from 'node:crypto';
import { newSysId } from './bundle.mjs';

export const PAGE_TEMPLATE = '19be392623033300f4b4c50947bf65ba';
export const GQL_COLLECTION = '21f155c65310101024e5ddeeff7b1210';
export const NAV_ITEM_SELECTED = '8b82bf18e5276c8e423b6e4e0889b463';
export const COMPONENTS = {
  container: 'd356d14b6e293a3020a244b63d278d8f',
  heading: '1f6e0643eca7a637e36bd7833549ec9e',
  stext: '4335ba6dca80378f7ba7a67cd6667bec',
  card: 'e772e788e32ce32b8daa2ac7b092d2c6',
  hv: '7fdccde954f753ae89139c6c24551be5',
  empty: '6f51fcc407363e5a52ac464315713ee9',
  alert: '553e398f150099fe18ece6938b5bea46',
  button: 'd37ce8abca89d02905fed903c8e34d8e',
  skeleton: 'd183245237fbfcd1dc7487857919ddb0',
};
const COLORS = new Set(['critical', 'high', 'warning', 'moderate', 'info', 'positive', 'low']);
const REASON_KINDS = new Set(['empty', 'equals', 'sla_breached']);

/** Keys of every record the compiler owns, so a rebuild can reuse live sys_ids. */
export const RECORD_KEYS = ['route', 'screen_type', 'screen', 'macroponent', 'render_include', 'event',
  'cs_apply', 'cs_failed', 'cs_refresh', 'cs_filter', 'cs_group', 'cs_showall', 'cs_open', 'audience', 'audience_link'];

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const pascal = (s) => slug(s).split('-').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('');

/** Checks a spec and fills defaults. Returns { spec, errors }. */
export function normalizeSpec(input) {
  const errors = [];
  const s = { ...(input || {}) };
  const need = (k) => { if (!s[k] || typeof s[k] !== 'string') errors.push(`spec.${k} is required.`); };
  ['name', 'route', 'title', 'table', 'query'].forEach(need);
  if (s.route && !/^[a-z0-9][a-z0-9-]{1,60}$/.test(s.route)) errors.push('spec.route must be lowercase letters, digits and hyphens.');
  if (s.table && !/^[a-z0-9_]+$/.test(s.table)) errors.push('spec.table is not a table name.');
  s.fields = { number: 'number', summary: 'short_description', owner: 'assigned_to', group: 'assignment_group', opened: 'opened_at', ...(s.fields || {}) };
  for (const [k, v] of Object.entries(s.fields)) if (!/^[a-z0-9_]+$/.test(v)) errors.push(`spec.fields.${k} is not a field name.`);
  s.order_by = s.order_by || s.fields.opened;
  s.limit = Math.min(Math.max(Number(s.limit) || 200, 1), 1000);
  s.noun = s.noun || 'records';
  s.subtitle = s.subtitle || '';
  s.summary_label = s.summary_label || 'Need you now';
  s.summary_hint = s.summary_hint || 'Need attention';
  s.list_heading = s.list_heading || 'Needs you now';
  s.breakdown_heading = s.breakdown_heading || 'Where they sit';
  s.no_group_label = s.no_group_label || 'No group yet';
  s.empty = { heading: 'Nothing needs you right now', body: 'Every record in this view is in good shape. Choose Clear filters to widen the view.', ...(s.empty || {}) };
  s.no_access = { heading: 'You need access to see this page', body: 'Ask your ServiceNow admin for the role this page needs.', ...(s.no_access || {}) };
  if (!Array.isArray(s.reasons) || !s.reasons.length) errors.push('spec.reasons needs at least one reason.');
  s.reasons = (s.reasons || []).map((r, i) => {
    const out = { color: 'warning', icon: 'circle-exclamation-outline', ...r };
    if (!/^[a-z][a-z0-9_]{0,30}$/.test(out.key || '')) errors.push(`spec.reasons[${i}].key must be a short lowercase key.`);
    if (!out.label) errors.push(`spec.reasons[${i}].label is required.`);
    if (!REASON_KINDS.has(out.kind)) errors.push(`spec.reasons[${i}].kind must be one of ${[...REASON_KINDS].join(', ')}.`);
    if (out.kind !== 'sla_breached' && !/^[a-z0-9_]+$/.test(out.field || '')) errors.push(`spec.reasons[${i}].field is required for kind ${out.kind}.`);
    if (out.kind === 'equals' && out.value === undefined) errors.push(`spec.reasons[${i}].value is required for kind equals.`);
    if (!COLORS.has(out.color)) errors.push(`spec.reasons[${i}].color must be one of ${[...COLORS].join(', ')}.`);
    out.row_label = out.row_label || out.label;
    out.hint = out.hint || '';
    return out;
  });
  const keys = s.reasons.map((r) => r.key);
  if (new Set(keys).size !== keys.length) errors.push('spec.reasons keys must be unique.');
  if (s.reasons.filter((r) => r.kind === 'sla_breached').length > 1) errors.push('Only one sla_breached reason is supported.');
  s.breakdown_reasons = (s.breakdown_reasons || keys.slice(0, 2)).filter((k) => keys.includes(k)).slice(0, 3);
  return { spec: s, errors };
}

/** Prefixes every condition of an encoded query with `task.`, for querying task_sla by its task. */
export function prefixQuery(query, prefix) {
  return String(query).split('^').filter((c) => c && !c.startsWith('ORDERBY')).map((c) => (c.startsWith('OR') && !c.startsWith('ORDERBY') ? `OR${prefix}${c.slice(2)}` : c === 'NQ' ? c : `${prefix}${c}`)).join('^');
}

/**
 * @param {any} spec normalized spec
 * @param {{ scope: string, appConfig: string, shell: string, roleId?: string, ids?: Record<string,string>, host?: string }} env
 */
export function compileBoard(spec, env) {
  const ids = Object.fromEntries(RECORD_KEYS.map((k) => [k, env.ids?.[k] || newSysId()]));
  const { scope } = env;
  const S = spec;
  const F = S.fields;
  const hasSla = S.reasons.some((r) => r.kind === 'sla_breached');
  const resources = hasSla ? ['records', 'breaches'] : ['records'];
  const eventName = `NAV_ITEM_SELECTED_RELAY_${S.route.toUpperCase().replace(/-/g, '_')}`;
  const renderApi = `${scope}.${pascal(S.route)}Render`;
  let seq = 0;
  const mid = () => 'kiwiG' + (++seq).toString(36) + randomBytes(6).toString('base64url').replace(/[^A-Za-z]/g, 'q');

  // ---------- value and element helpers (verified shapes) ----------
  const lit = (value) => ({ type: 'JSON_LITERAL', value });
  const tr = (message) => ({ type: 'TRANSLATION_LITERAL', value: { code: null, comment: '', message } });
  const st = (...address) => ({ binding: { address }, type: 'STATE_BINDING' });
  const item = (...address) => ({ binding: { address, category: 'value' }, type: 'REPEATER_ITEM_BINDING' });
  const hiddenUnless = (name) => ({ operation: { operand: st(name), operator: 'NOT' }, type: 'UNARY' });
  const val = (v) => (v && typeof v === 'object' && typeof v.type === 'string' ? v : lit(v));
  const mapping = (source, targets) => ({
    eventMappingId: mid(), isConfiguration: false, offRowStorageId: null, sourceEventApiName: source, sourceEventCorrelationId: null,
    sourceEventDefinition: { apiName: source, id: null, type: 'UXEVENT' }, sourceEventSysId: null, targets,
  });
  const scriptTarget = (sysId) => ({ broker: null, clientScript: { payload: lit({}), sysId }, conditional: null, declarativeAction: null, event: null, operation: null, targetId: mid(), type: 'CLIENT_SCRIPT' });
  const flex = (items, styles) => ({ default: { children: null, items: items.map(([element_id, s]) => (s ? { element_id, styles: s } : { element_id })), root: null, rules: null, styles, templateId: '5832fd4d53c31010e6bcddeeff7b12db', type: 'flex' }, version: '3.1.0' });
  const el = (def, elementId, label, propertyValues, extra = {}) => ({ definition: { id: def, type: 'MACROPONENT' }, elementId, elementLabel: label, eventMappings: [], isHidden: lit(null), preset: null, propertyValues, slot: null, styles: null, ...extra });
  const overrides = (children, layoutStyles) => ({ composition: children.map((c) => c[0]), layout: flex(children.map((c) => [c[0].elementId, c[1]]), layoutStyles) });
  const C = COMPONENTS;
  const container = (id, label, children, layoutStyles, extra = {}, aria = '') => el(C.container, id, label, { ariaRegionHeadingLevel: lit('1'), ariaRegionName: tr(aria), ariaRole: lit(''), includeAriaHeading: lit(false), type: lit('section') }, { extensionPoints: [], isHero: false, isNonDestructive: false, items: [], overrides: overrides(children, layoutStyles), ...extra });
  const heading = (id, label, text, level, variant) => el(C.heading, id, label, { hasNoMargin: lit(true), label: text, level: lit(level), variant: lit(variant), wontWrap: lit(false) });
  const stext = (id, label, text, tag = 'span', css = '* { margin: 0; }') => el(C.stext, id, label, { configAria: { container: {}, type: 'MAP_CONTAINER' }, css: lit(css), tag: lit(tag), text });
  const hv = (id, label, text, color, icon) => el(C.hv, id, label, { color: val(color), icon: val(icon), label: text, size: lit('sm'), tooltipContent: tr(''), variant: lit('secondary'), willWrap: lit(true) });
  const card = (id, label, aria, children, layoutStyles, events, size, sidebar, interaction = 'click') => el(C.card, id, label, { configAria: val(aria), hideShadow: lit(false), interaction: lit(interaction), manageSelected: lit(false), selected: lit(false), sidebar: val(sidebar), size: lit(size) }, { eventMappings: events, overrides: overrides(children, layoutStyles) });
  const repeater = (id, label, repeatWith, child, layoutStyles, isHidden) => ({ definition: { id: 'REPEATER', type: 'REPEATER' }, elementId: id, elementLabel: label, eventMappings: [], isHidden, overrides: { composition: [child], layout: flex([[child.elementId]], layoutStyles) }, preset: null, propertyValues: {}, repeatWith, slot: null, styles: { default: {} } });
  const emptyState = (id, label, head, body, illustration, isHidden) => el(C.empty, id, label, { actions: lit(null), alignment: lit('vertical-centered'), content: tr(body), heading: lit({ label: head, level: 3 }), illustration: lit(illustration) }, { isHidden });
  const button = (id, label, text, tip, sysId) => el(C.button, id, label, { configAria: lit(null), disabled: lit(false), icon: lit(null), label: tr(text), landmark: lit(null), size: lit('md'), tooltipContent: tr(tip), variant: lit('secondary') }, { eventMappings: [mapping('sn_button.NOW_BUTTON#CLICKED', [scriptTarget(sysId)])] });
  const alert = (id, label, status, head, body, icon, isHidden) => el(C.alert, id, label, { action: lit(null), configAria: lit(null), content: tr(body), enableFocus: lit(false), expanded: lit(false), header: tr(head), icon: lit(icon), manageExpanded: lit(false), maxHeight: lit(null), status: lit(status), textLinkProps: { container: {}, type: 'MAP_CONTAINER' } }, { isHidden });

  const SECONDARY = '* { margin: 0; color: rgb(var(--now-color_text--secondary)); }';
  const TERTIARY = '* { margin: 0; color: rgb(var(--now-color_text--tertiary)); }';
  const ELLIPSIS = (c) => `* { display: block; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;${c ? ` color: rgb(var(--now-color_text--${c}));` : ''} }`;
  const NUMERIC = (c) => `* { margin: 0; text-align: end;${c ? ` color: rgb(var(--now-color_text--${c}));` : ''} }`;
  const BIG = '* { margin: 0; font-size: var(--now-font-size--xl, 1.75rem); font-weight: var(--now-font-weight--semibold, 600); line-height: 1.2; }';
  const rowStyles = { display: 'flex', 'flex-direction': 'row', 'flex-wrap': 'wrap', 'align-items': 'center', gap: 'var(--now-scalable-space--md)' };
  const lineStyles = { display: 'flex', 'flex-direction': 'row', 'flex-wrap': 'nowrap', 'align-items': 'center', gap: 'var(--now-scalable-space--md)', 'min-width': '0' };
  const col = (gap = 'var(--now-scalable-space--sm)') => ({ display: 'flex', 'flex-direction': 'column', gap });

  // ---------- composition ----------
  const header = container('page_header', 'Page header', [
    [container('title_row', 'Title row', [
      [heading('page_heading', 'Page heading', tr(S.title), '1', 'header-primary'), { flex: '1 1 auto', 'min-width': '0' }],
      [button('refresh_button', 'Refresh button', 'Refresh', `Load the latest ${S.noun}`, ids.cs_refresh)],
    ], { ...rowStyles, 'justify-content': 'space-between' }, {}, 'Page title')],
    [stext('page_subtitle', 'Page subtitle', st('subtitle'), 'p', SECONDARY)],
  ], col('var(--now-scalable-space--xs)'), {}, 'Page header');

  const skel = (id, size) => card(id, `Loading ${id}`, lit(null), [[el(C.skeleton, `${id}_skeleton`, `${id} skeleton`, {}), { width: '100%' }]], col(), [], size, {}, 'none');
  const loading = container('loading_section', 'Loading placeholders', [
    [stext('loading_text', 'Loading message', tr(`Loading ${S.noun}…`), 'p', SECONDARY)],
    [repeater('loading_cards', 'Loading summary cards', st('placeholderCards'), skel('loading_card', 'md'), { ...rowStyles, 'align-items': 'stretch' }, lit(null)), { width: '100%' }],
    [repeater('loading_rows', 'Loading rows', st('placeholderRows'), skel('loading_row', 'sm'), col(), lit(null)), { width: '100%' }],
  ], col('var(--now-scalable-space--md)'), { isHidden: hiddenUnless('loading') }, 'Loading');

  const summaryCard = card('summary_card', 'Summary card', item('aria'), [
    [stext('summary_label', 'Summary label', item('label'), 'p', SECONDARY)],
    [stext('summary_value', 'Summary value', item('count'), 'p', BIG)],
    [stext('summary_caption', 'Summary caption', item('caption'), 'p', TERTIARY)],
    [hv('summary_status', 'Summary status', item('status'), item('color'), item('icon'))],
  ], { ...col('var(--now-scalable-space--xs)'), 'align-items': 'flex-start' }, [mapping('sn_card.NOW_CARD#CLICKED', [scriptTarget(ids.cs_filter)])], 'md', item('sidebar'));
  const summaryRow = container('summary_row', 'Summary row', [[repeater('summary_repeater', 'Summary cards', st('summaryCards'), summaryCard, { ...rowStyles, 'align-items': 'stretch' }, lit(null)), { width: '100%' }]], col(), {}, 'Summary');

  const filterBar = container('filter_bar', 'Filter bar', [
    [stext('filter_label', 'Current filter', st('filterLabel'), 'p', SECONDARY), { flex: '1 1 16rem' }],
    [button('show_all_button', 'Clear filters button', 'Clear filters', `Show every ${S.noun} that needs you, in every group`, ids.cs_showall)],
  ], { ...rowStyles, 'justify-content': 'space-between' }, {}, 'Filters');
  const slaWarning = alert('sla_warning', 'SLA unavailable warning', 'warning', 'SLA status is unavailable right now', 'Breached SLAs are not shown, so SLA counts and reasons may be missing. Choose Refresh to try again.', 'triangle-exclamation-outline', hiddenUnless('showSlaWarning'));

  const A = { flex: '0 0 9rem', 'min-width': '0' };
  const B = { flex: '1 1 0', 'min-width': '0' };
  const Cc = { flex: '0 0 14rem', 'min-width': '0' };
  const line = (id, label, cells) => container(id, label, cells, lineStyles, {}, '');
  const head = (k, label, s) => [stext(`items_head_${k}`, `${label} column header`, tr(label), 'span', ELLIPSIS('tertiary')), s];
  const cell = (k, label, s, c) => [stext(`item_${k}`, `Row ${label}`, item(k), 'span', ELLIPSIS(c)), s];
  const L = { number: S.labels?.number || 'Number', summary: S.labels?.summary || 'Summary', reason: S.labels?.reason || 'Why it needs you', group: S.labels?.group || 'Group', owner: S.labels?.owner || 'Assigned to', opened: S.labels?.opened || 'Opened' };
  const itemsHeader = container('items_header', 'List column headers', [
    [line('items_head_line1', 'Header line 1', [head('number', L.number, A), head('summary', L.summary, B), head('reasonLabel', L.reason, Cc)]), { width: '100%' }],
    [line('items_head_line2', 'Header line 2', [head('groupName', L.group, A), head('owner', L.owner, B), head('openedLabel', L.opened, Cc)]), { width: '100%' }],
  ], { ...col('var(--now-scalable-space--xxs)'), 'padding-inline': 'var(--now-scalable-space--md)' }, { isHidden: hiddenUnless('showList') }, 'Column headers');
  const itemCard = card('item_card', 'Row', item('aria'), [
    [line('item_line1', 'Row line 1', [cell('number', L.number, A), cell('summary', L.summary, B, 'secondary'), [hv('item_reasonLabel', `Row ${L.reason}`, item('reasonLabel'), item('reasonColor'), 'circle-exclamation-outline'), Cc]]), { width: '100%' }],
    [line('item_line2', 'Row line 2', [cell('groupName', L.group, A, 'secondary'), cell('owner', L.owner, B, 'secondary'), cell('openedLabel', L.opened, Cc, 'secondary')]), { width: '100%' }],
  ], col('var(--now-scalable-space--xs)'), [mapping('sn_card.NOW_CARD#CLICKED', [scriptTarget(ids.cs_open)])], 'sm', item('sidebar'));
  const listSection = container('list_section', 'List section', [
    [heading('list_heading', 'List heading', tr(S.list_heading), '2', 'header-secondary')],
    [itemsHeader],
    [emptyState('items_empty_state', 'Empty state', S.empty.heading, S.empty.body, 'completed-tasks', hiddenUnless('showEmpty'))],
    [repeater('items_repeater', 'List rows', st('rows'), itemCard, col(), hiddenUnless('showList'))],
  ], col('var(--now-scalable-space--md)'), {}, S.list_heading);

  const NAME = { flex: '1 1 0', 'min-width': '0' };
  const NUM = { flex: '0 0 4.5rem', 'min-width': '0' };
  const reasonLabel = (k) => S.reasons.find((r) => r.key === k).label;
  const groupCols = [['name', L.group, NAME], ['total', S.noun_label || S.noun[0].toUpperCase() + S.noun.slice(1), NUM], ...S.breakdown_reasons.map((k) => [`r_${k}`, reasonLabel(k), NUM])];
  const groupsHeader = container('groups_header', 'Breakdown column headers', groupCols.map(([k, label, s]) => [stext(`groups_head_${k}`, `${label} column header`, tr(label), 'span', k === 'name' ? ELLIPSIS('tertiary') : NUMERIC('tertiary')), s]), { ...lineStyles, 'align-items': 'flex-end', 'padding-inline': 'var(--now-scalable-space--md)' }, { isHidden: hiddenUnless('showGroups') }, 'Column headers');
  const groupCard = card('group_card', 'Breakdown row', item('aria'), groupCols.map(([k, label, s]) => [stext(`group_${k}`, `Breakdown ${label}`, item(k), 'span', k === 'name' ? ELLIPSIS() : NUMERIC('secondary')), s]), lineStyles, [mapping('sn_card.NOW_CARD#CLICKED', [scriptTarget(ids.cs_group)])], 'sm', item('sidebar'));
  const groupsSection = container('groups_section', 'Breakdown section', [
    [heading('groups_heading', 'Breakdown heading', tr(S.breakdown_heading), '2', 'header-secondary')],
    [groupsHeader],
    [repeater('groups_repeater', 'Breakdown rows', st('groupRows'), groupCard, col(), hiddenUnless('showGroups'))],
  ], col('var(--now-scalable-space--md)'), {}, S.breakdown_heading);

  const columns = container('columns', 'Two columns', [[listSection, { flex: '2 1 40rem', 'min-width': '0' }], [groupsSection, { flex: '1 1 22rem', 'min-width': '0' }]], { ...rowStyles, 'align-items': 'flex-start', gap: 'var(--now-scalable-space--lg)' }, {}, 'Details');
  const content = container('board_content', 'Board content', [[summaryRow], ...(hasSla ? [[slaWarning, { width: '100%' }]] : []), [filterBar], [columns]], col('var(--now-scalable-space--lg)'), { isHidden: hiddenUnless('showContent') }, S.title);
  const errorSection = container('error_section', 'Load error', [
    [alert('error_alert', 'Load error alert', 'critical', `We couldn't load the ${S.noun}`, 'Choose Try again. If it keeps failing, tell your ServiceNow admin.', 'circle-exclamation-outline', lit(null)), { width: '100%' }],
    [button('retry_button', 'Try again button', 'Try again', `Load the ${S.noun} again`, ids.cs_refresh)],
  ], { ...col(), 'align-items': 'flex-start' }, { isHidden: hiddenUnless('showError') }, 'Load error');
  const noAccess = emptyState('no_access_state', 'No access state', S.no_access.heading, S.no_access.body, 'permissions', hiddenUnless('showNoAccess'));

  const composition = [header, loading, errorSection, noAccess, content];
  const layout = { default: { children: null, isInline: null, items: composition.map((e) => ({ element_id: e.elementId, styles: { width: '100%' } })), root: null, rules: null, styles: { display: 'flex', 'flex-direction': 'column', gap: 'var(--now-scalable-space--lg)', padding: 'var(--now-scalable-space--lg)' }, templateId: 'b719698953c31010e6bcddeeff7b1275', type: 'flex' }, version: '3.0.0' };

  // ---------- data ----------
  const reasonFields = S.reasons.filter((r) => r.field).map((r) => r.field);
  const returnFields = [...new Set(['sys_id', F.number, F.summary, F.owner, F.group, F.opened, ...reasonFields])].join(',');
  const gql = (id, label, table, q, orderBy, fields) => ({
    cachePolicy: null, definition: { id: GQL_COLLECTION, type: 'GRAPHQL' }, dependencies: {}, elementId: id, elementLabel: label,
    eventMappings: [mapping('sn_uxf.DATA_FETCH_SUCCEEDED', [scriptTarget(ids.cs_apply)]), mapping('sn_uxf.DATA_FETCH_FAILED', [scriptTarget(ids.cs_failed)])],
    inputValues: { encodedQuery: lit(q), limit: lit(String(S.limit)), offset: lit(null), orderBy: lit(orderBy), queryCategory: lit(''), returnFieldMetadata: lit(false), returnFields: lit(fields), returnRowCount: lit(true), returnTableMetadata: lit(false), sortType: lit('asc'), table: lit(table) },
    readEvaluationMode: 'EAGER',
  });
  const data = [gql('records', S.name, S.table, `${S.query}^ORDERBY${S.order_by}`, S.order_by, returnFields)];
  if (hasSla) data.push(gql('breaches', 'SLA breaches', 'task_sla', `active=true^has_breached=true^task.sys_class_name=${S.table}^${prefixQuery(S.query, 'task.')}^ORDERBYplanned_end_time`, 'planned_end_time', 'task,planned_end_time'));

  // ---------- client state ----------
  const sp = (name, value, t) => ({ description: '', fieldType: t, initialValue: lit(value), label: name, name, shape: '', valueType: t });
  const stateProps = [
    sp('activeFilter', 'all', 'string'), sp('groupFilter', '', 'string'), sp('model', null, 'json'),
    sp('pending', Object.fromEntries(resources.map((r) => [r, true])), 'json'), sp('loading', true, 'boolean'),
    sp('placeholderCards', S.reasons.slice(0, 3).concat([{}]).map((_, i) => ({ id: i + 1 })), 'json'),
    sp('placeholderRows', [1, 2, 3, 4, 5].map((id) => ({ id })), 'json'),
    ...['showContent', 'showNoAccess', 'showError', 'showSlaWarning', 'showEmpty', 'showList', 'showGroups'].map((n) => sp(n, false, 'boolean')),
    sp('subtitle', S.subtitle, 'string'), sp('filterLabel', '', 'string'), sp('summaryCards', [], 'json'), sp('rows', [], 'json'), sp('groupRows', [], 'json'),
  ];

  // ---------- client scripts ----------
  const CONFIG = {
    table: S.table, noun: S.noun, subtitle: S.subtitle, summaryLabel: S.summary_label, summaryHint: S.summary_hint, noGroup: S.no_group_label,
    reasons: S.reasons.map((r) => ({ key: r.key, label: r.label, rowLabel: r.row_label, hint: r.hint, color: r.color, icon: r.icon, kind: r.kind, field: r.field || null, value: r.value === undefined ? null : String(r.value) })),
    breakdown: S.breakdown_reasons,
  };
  const RENDER = `
    var CONFIG = ${JSON.stringify(CONFIG)};
    var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    function pad(n) { return n < 10 ? '0' + n : String(n); }
    function day(ms) { var d = new Date(ms); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
    function dayTime(ms) { var d = new Date(ms); return day(ms) + ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
    function ago(mins) { if (mins < 60) { return mins + (mins === 1 ? ' minute ago' : ' minutes ago'); } var h = Math.floor(mins / 60); return h < 48 ? h + ' hours ago' : Math.floor(h / 24) + ' days ago'; }
    var THIRTY_DAYS = 30 * 24 * 60;
    function openedLabel(ms, now) { if (!ms) { return ''; } var m = Math.max(0, Math.round((now - ms) / 60000)); return m <= THIRTY_DAYS ? ago(m) : 'Opened ' + day(ms); }
    function breachLabel(ms, now) { var m = Math.max(0, Math.round((now - ms) / 60000)); return m <= THIRTY_DAYS ? 'SLA breached ' + ago(m) + ' (' + dayTime(ms) + ')' : 'SLA breached on ' + dayTime(ms); }
    function matches(reason, rec, breach) {
        if (reason.kind === 'sla_breached') { return !!breach; }
        var v = rec.f[reason.field] || '';
        return reason.kind === 'empty' ? !v : v === reason.value;
    }
    function render(api, model, filter, group) {
        var keys = CONFIG.reasons.map(function (r) { return r.key; });
        filter = filter === 'all' || keys.indexOf(filter) > -1 ? filter : 'all';
        group = group || '';
        var now = Date.now();
        var slaOk = model.slaOk !== false;
        var counts = { needYou: 0 };
        keys.forEach(function (k) { counts[k] = 0; });
        var groups = {}, groupList = [], items = [];
        (model.records || []).forEach(function (rec) {
            var breach = slaOk ? (model.breaches || {})[rec.sysId] : null;
            var hit = CONFIG.reasons.filter(function (r) { return matches(r, rec, breach); });
            hit.forEach(function (r) { counts[r.key]++; });
            if (hit.length) { counts.needYou++; }
            var gk = rec.groupId || 'none';
            if (!groups[gk]) { groups[gk] = { groupId: gk, name: rec.groupId ? rec.groupName : CONFIG.noGroup, total: 0, r: {} }; groupList.push(groups[gk]); }
            groups[gk].total++;
            hit.forEach(function (r) { groups[gk].r[r.key] = (groups[gk].r[r.key] || 0) + 1; });
            if (!hit.length) { return; }
            if (filter !== 'all' && !hit.some(function (r) { return r.key === filter; })) { return; }
            if (group && gk !== group) { return; }
            var parts = hit.map(function (r) { return r.kind === 'sla_breached' ? breachLabel(breach.endMs, now) : r.rowLabel; });
            items.push({
                sysId: rec.sysId, number: rec.number, summary: rec.summary, reasonLabel: parts.join(' \\u00b7 '), reasonColor: hit[0].color,
                rank: keys.indexOf(hit[0].key), overdue: breach ? Math.max(0, Math.round((now - breach.endMs) / 60000)) : 0, openedMs: rec.openedMs,
                groupName: rec.groupId ? rec.groupName : CONFIG.noGroup, owner: rec.ownerId ? rec.owner : 'Nobody yet', openedLabel: openedLabel(rec.openedMs, now),
                sidebar: { color: hit[0].color, variant: 'primary' }, aria: { button: { 'aria-label': 'Open ' + rec.number + ': ' + parts.join(', ') } }
            });
        });
        items.sort(function (a, b) { return a.rank - b.rank || b.overdue - a.overdue || a.openedMs - b.openedMs; });
        groupList.sort(function (a, b) { return b.total - a.total || (a.name > b.name ? 1 : -1); });
        var dash = '\\u2014';
        var cards = [['all', CONFIG.summaryLabel, String(counts.needYou), 'of ' + (model.total || 0) + ' ' + CONFIG.noun, CONFIG.summaryHint, 'info', 'circle-info-outline']]
            .concat(CONFIG.reasons.map(function (r) {
                var na = r.kind === 'sla_breached' && !slaOk;
                return [r.key, r.label, na ? dash : String(counts[r.key]), na ? 'SLA status unavailable' : '', r.hint, r.color, r.icon];
            }))
            .map(function (d) {
                var sel = filter === d[0];
                return { filter: d[0], label: d[1], count: d[2], caption: d[3], status: d[4], color: d[5], icon: d[6],
                    aria: { button: { 'aria-label': d[1] + ': ' + (d[2] === dash ? 'unavailable' : d[2]) + (d[3] ? ' ' + d[3] : '') + '. ' + (sel ? 'Filter applied.' : 'Show these in the list.') } },
                    sidebar: sel ? { color: 'info', variant: 'primary' } : {} };
            });
        var groupRows = groupList.map(function (g) {
            var row = { groupId: g.groupId, name: g.name, total: String(g.total),
                aria: { button: { 'aria-label': (group === g.groupId ? 'Show every group instead of ' : 'Show only ') + g.name + ': ' + g.total + ' ' + CONFIG.noun } },
                sidebar: group === g.groupId ? { color: 'info', variant: 'primary' } : {} };
            CONFIG.breakdown.forEach(function (k) {
                var r = CONFIG.reasons.filter(function (x) { return x.key === k; })[0];
                row['r_' + k] = r && r.kind === 'sla_breached' && !slaOk ? dash : String(g.r[k] || 0);
            });
            return row;
        });
        var names = { all: CONFIG.summaryLabel };
        CONFIG.reasons.forEach(function (r) { names[r.key] = r.label; });
        var label = 'Showing: ' + names[filter] + (group ? ' in ' + (groups[group] ? groups[group].name : 'the selected group') : '') + ' (' + items.length + ')';
        if (model.truncated) { label += '. Only the first ' + model.records.length + ' of ' + model.total + ' are checked.'; }
        api.setState('activeFilter', filter); api.setState('groupFilter', group);
        api.setState('summaryCards', cards); api.setState('rows', items); api.setState('groupRows', groupRows);
        api.setState('filterLabel', label);
        api.setState('subtitle', (CONFIG.subtitle ? CONFIG.subtitle + ' ' : '') + 'Updated ' + model.loadedLabel + '.');
        api.setState('loading', false); api.setState('showError', false); api.setState('showNoAccess', false);
        api.setState('showSlaWarning', !slaOk); api.setState('showContent', true);
        api.setState('showEmpty', items.length === 0); api.setState('showList', items.length > 0); api.setState('showGroups', groupRows.length > 0);
    }
`;
  const hdr = '/**\n * @param {params} params\n * @param {api} params.api\n * @param {any} params.event\n * @param {any} params.imports\n * @param {ApiHelpers} params.helpers\n */\n';
  const handler = (body, withRender = true) => hdr + 'function handler({api, event, helpers, imports}) {\n' + (withRender ? `    var render = imports['${renderApi}']();\n` : '') + body + '\n}';
  const pendingAll = JSON.stringify(Object.fromEntries(resources.map((r) => [r, true])));
  const pendingNone = JSON.stringify(Object.fromEntries(resources.map((r) => [r, false])));
  const fieldMap = JSON.stringify(Object.fromEntries(reasonFields.map((f) => [f, f])));
  const scripts = {
    cs_apply: [`${S.name} - apply data`, handler(`    var id = event && event.payload && event.payload.dataElemId;
    var pending = Object.assign(${pendingNone}, api.state.pending || {});
    if (id) { pending[id] = false; }
    api.setState('pending', pending);
    if (${resources.map((r) => `pending.${r}`).join(' || ')}) { return; }
    var out = api.data.records && api.data.records.output;
    var q = out && out.data && out.data.GlideRecord_Query && out.data.GlideRecord_Query['${S.table}'];
    if (!out || (out.errors && out.errors.length) || !q) {
        api.setState('loading', false); api.setState('showContent', false); api.setState('showError', false); api.setState('showNoAccess', true);
        return;
    }
    var v = function (r, f) { return r && r[f] ? (r[f].value || '') : ''; };
    var d = function (r, f) { return r && r[f] ? (r[f].displayValue || '') : ''; };
    var ms = function (s) { return s ? Date.parse(String(s).replace(' ', 'T') + 'Z') : 0; };
    var extra = ${fieldMap};
    var records = (q._results || []).map(function (r) {
        var f = {};
        Object.keys(extra).forEach(function (k) { f[k] = v(r, k); });
        return { sysId: v(r, 'sys_id'), number: d(r, '${F.number}') || v(r, '${F.number}'), summary: d(r, '${F.summary}'),
            ownerId: v(r, '${F.owner}'), owner: d(r, '${F.owner}'), groupId: v(r, '${F.group}'), groupName: d(r, '${F.group}'), openedMs: ms(v(r, '${F.opened}')), f: f };
    });
    var breaches = {}, slaOk = true;
    ${hasSla ? `var so = api.data.breaches && api.data.breaches.output;
    var sq = so && so.data && so.data.GlideRecord_Query && so.data.GlideRecord_Query.task_sla;
    slaOk = !!so && !(so.errors && so.errors.length) && !!sq;
    ((slaOk && sq._results) || []).forEach(function (r) { var t = v(r, 'task'); if (t && !breaches[t]) { breaches[t] = { endMs: ms(v(r, 'planned_end_time')) }; } });` : ''}
    var total = Number(q._rowCount) || records.length;
    var model = { records: records, breaches: breaches, total: total, truncated: total > records.length, slaOk: slaOk, loadedLabel: new Date().toLocaleString() };
    api.setState('model', model);
    render(api, model, api.state.activeFilter, api.state.groupFilter);`)],
    cs_failed: [`${S.name} - show load error`, handler(`    api.setState('pending', ${pendingNone});
    api.setState('loading', false); api.setState('showContent', false); api.setState('showNoAccess', false); api.setState('showError', true);`, false)],
    cs_refresh: [`${S.name} - refresh data`, handler(`    api.setState('pending', ${pendingAll});
    api.setState('loading', true); api.setState('showContent', false); api.setState('showError', false); api.setState('showNoAccess', false);
${resources.map((r) => `    api.data.${r}.refresh();`).join('\n')}`, false)],
    cs_filter: [`${S.name} - filter by summary card`, handler(`    var card = event && event.context && event.context.item && event.context.item.value;
    if (!card || !api.state.model) { return; }
    render(api, api.state.model, card.filter, '');`)],
    cs_group: [`${S.name} - filter by group`, handler(`    var row = event && event.context && event.context.item && event.context.item.value;
    if (!row || !api.state.model) { return; }
    render(api, api.state.model, api.state.activeFilter, api.state.groupFilter === row.groupId ? '' : row.groupId);`)],
    cs_showall: [`${S.name} - clear filters`, handler(`    if (!api.state.model) { return; }
    render(api, api.state.model, 'all', '');`)],
    cs_open: [`${S.name} - open record`, handler(`    var row = event && event.context && event.context.item && event.context.item.value;
    if (!row || !row.sysId) { return; }
    api.emit('${eventName}', { route: 'record', fields: { table: '${S.table}', sysId: row.sysId }, params: null, redirect: null, passiveNavigation: null, title: row.number || null, multiInstField: null, targetRoute: null, external: null, navigationOptions: null });`, false)],
  };

  const messages = new Set();
  JSON.stringify(composition, (k, v) => { if (v && v.type === 'TRANSLATION_LITERAL' && v.value?.message) messages.add(v.value.message); return v; });
  const J = (v) => JSON.stringify(v);
  const usesRender = (k) => !['cs_failed', 'cs_open', 'cs_refresh'].includes(k);
  const payload = Object.fromEntries(['external', 'fields', 'multiInstField', 'navigationOptions', 'params', 'passiveNavigation', 'redirect', 'route', 'targetRoute', 'title'].map((k) => [k, { binding: { address: [k] }, type: 'EVENT_PAYLOAD_BINDING' }]));
  const eventProps = [
    ['string', 'global.route', 'Route type', 'route'], ['json', 'global.route', 'Route fields', 'fields'], ['json', 'global.route', 'Optionals parameters', 'params'],
    ['boolean', null, 'Remove previous URL from browser history', 'redirect'], ['boolean', null, 'Load in background (advanced)', 'passiveNavigation'],
    ['string', null, 'Title (advanced)', 'title'], ['string', null, 'Multi-instance field (advanced)', 'multiInstField'],
    ['string', null, 'Sub-navigation route (advanced)', 'targetRoute'], ['json', 'global.route', 'External URL object', 'external'],
  ].map(([fieldType, interfaceApiName, label, name]) => ({ fieldType, interfaceApiName, label, name }));
  const macroponentConfig = { bare: lit(true), headerLevel: lit('1'), headingOnlyVisibleToScreenReaders: lit(false), interceptNotifications: lit(false), label: tr(''), propagateNotifications: lit(false), scrollable: lit('y') };
  const screenEvents = [{
    eventMappingId: mid(), isConfiguration: null, offRowStorageId: null, sourceEventApiName: `${scope}.${eventName}`, sourceEventCorrelationId: null,
    sourceEventDefinition: { apiName: `${scope}.${eventName}`, id: null, type: 'UXEVENT' }, sourceEventSysId: null,
    targets: [{ broker: null, clientScript: null, conditional: null, declarativeAction: null, event: { apiName: 'sn_canvas_core.NAV_ITEM_SELECTED', payload: { container: payload, type: 'MAP_CONTAINER' }, sysId: NAV_ITEM_SELECTED }, operation: null, targetId: mid(), type: 'EVENT' }],
  }];

  const R = (table, key, values) => ({ table, sys_id: ids[key], values: { ...values, sys_id: ids[key] } });
  const records = [
    R('sys_ux_event', 'event', { event_name: eventName, label: `Link to destination Relay (${S.name})`, props: J(eventProps), schema_version: '1.0.0' }),
    R('sys_ux_client_script_include', 'render_include', { name: `${pascal(S.route)}Render`, api_name: renderApi, access: 'package_private', includes: '', script_api_version: '2.0.0', required_translations: '', script: `/** Shapes the ${S.name} view from the loaded model. Generated by kiwistack sn_ux_build_page. */\nfunction include({imports}) {${RENDER}    return render;\n}` }),
    R('sys_ux_macroponent', 'macroponent', {
      name: S.name, category: 'page', extends: PAGE_TEMPLATE, schema_version: '1.0.0', composition: J(composition), data: J(data), layout: J(layout), state_properties: J(stateProps),
      internal_event_mappings: '{}', dispatched_events: ids.event, handled_events: '', props: '[]', bundles: '[]', form_factors: '{}', root_component_config: '{}',
      required_translations: J([...messages].sort().map((message) => ({ message, comment: '' }))), disable_auto_reflow: 'false', description: S.description || S.title,
    }),
    ...Object.entries(scripts).map(([k, [name, script]]) => R('sys_ux_client_script', k, { name, script, type: 'default', target: '', macroponent: ids.macroponent, script_api_version: '2.0.0', required_translations: '[ ]', includes: usesRender(k) ? ids.render_include : '', preset: '', controller_preset: '' })),
    R('sys_ux_screen_type', 'screen_type', { name: S.name, description: S.description || S.title }),
    R('sys_ux_screen', 'screen', { name: S.name, screen_type: ids.screen_type, macroponent: ids.macroponent, app_config: env.appConfig, parent_macroponent: env.shell, order: '100', active: 'true', disable_interoperable: 'false', disable_auto_reflow: 'false', macroponent_config: J(macroponentConfig), event_mappings: J(screenEvents) }),
    R('sys_ux_app_route', 'route', { name: S.name, route_type: S.route, app_config: env.appConfig, screen_type: ids.screen_type, parent_macroponent: env.shell, order: '0', interoperable: 'false' }),
  ];
  if (env.roleId) {
    records.push(R('sys_ux_applicability', 'audience', { name: `${S.name} audience`, roles: env.roleId, active: 'true', description: `Who can see ${S.name}.` }));
    records.push(R('sys_ux_applicability_m2m_screen', 'audience_link', { applicability: ids.audience, screen: ids.screen, active: 'true', order: '100' }));
  }
  const external = { [PAGE_TEMPLATE]: 'sys_ux_macroponent', [GQL_COLLECTION]: 'sys_ux_data_broker_graphql', [NAV_ITEM_SELECTED]: 'sys_ux_event', [env.appConfig]: 'sys_ux_app_config', [env.shell]: 'sys_ux_macroponent', ...Object.fromEntries(Object.values(COMPONENTS).map((id) => [id, 'sys_ux_macroponent'])) };
  if (env.roleId) external[env.roleId] = 'sys_user_role';
  return {
    bundle: {
      kiwi_bundle: 1,
      source: { host: env.host, built_from: 'kiwistack sn_ux_build_page (attention board)' },
      root: { table: 'sys_ux_screen_type', sys_id: ids.screen_type },
      records,
      external_refs: Object.entries(external).map(([sys_id, table]) => ({ table, sys_id })),
      warnings: [],
    },
    ids,
    event_name: eventName,
    render_api: renderApi,
  };
}
