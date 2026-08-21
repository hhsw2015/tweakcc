import { describe, it, expect } from 'vitest';
import { REMINDER_REGISTRY } from './systemReminderOverrides';

const memoryUpdate = REMINDER_REGISTRY.find(r => r.id === 'memory-update')!;

// Memory_update case shaped like CC 2.1.177's cli.js: the wrapper call is
// preceded by a comma-expression (`return K.push(rm6),HT([U6(...`), unlike the
// other reminder cases which emit `return X([Y(...` directly. discoverWrappers
// used to anchor on `return X([` and so missed this, falling back to the stale
// hardcoded o5/j6 and crashing at runtime with "j6 is not a function".
const MOCK_COMMA_EMIT =
  'case"memory_update":{let K=[`${OSO[H.source]} updated your memory directory: ${H.summary}`];' +
  'return K.push(rm6),HT([U6({content:K.join(`\\n`),isMeta:!0})])}';

// Same case with the wrapper emitted directly after `return` (other builds).
const MOCK_DIRECT_EMIT =
  'case"memory_update":{let K=`updated your memory directory`;' +
  'return HT([U6({content:K,isMeta:!0})])}';

describe('memory-update reminder wrapper discovery', () => {
  it('reads the real wrapper/ctor past a comma-expression, not the o5/j6 fallback', () => {
    const result = memoryUpdate.apply(MOCK_COMMA_EMIT, 'memory changed', false);
    expect(result).not.toBeNull();
    expect(result).toContain('HT([U6({content:');
    expect(result).not.toContain('o5([j6(');
  });

  it('still reads a wrapper emitted directly after return', () => {
    const result = memoryUpdate.apply(
      MOCK_DIRECT_EMIT,
      'memory changed',
      false
    );
    expect(result).not.toBeNull();
    expect(result).toContain('HT([U6({content:');
  });
});

const taskListReminder = REMINDER_REGISTRY.find(
  r => r.id === 'task-list-reminder'
)!;

// 2.1.205 task-reminder case: the feature gate is a TWO-clause guard
// `if(!ZI()||YY())return[]` (2.1.204 was a single `if(!ZI())return[]`). The
// wrapper is gf/Lr and the delta param is `e`. The body must carry the
// "Here are the existing tasks" anchor findCaseBody keys on.
const MOCK_TASK_REMINDER_2205 =
  'switch(e.type){case"task_reminder":{if(!ZI()||YY())return[];' +
  'let r=e.content.map((o)=>`#${o.id}. [${o.status}] ${o.subject}`).join(`\n`),' +
  'n=`The task tools have not been used recently.`;' +
  'if(r.length>0)n+=`\n\nHere are the existing tasks:\n\n${r}`;' +
  'return gf([Lr({content:n,isMeta:!0})])}default:}';

describe('task-list-reminder feature-gate guard discovery', () => {
  it('preserves the 2.1.205 two-clause guard verbatim and never falls back to a hardcoded class name (GX)', () => {
    const result = taskListReminder.apply(
      MOCK_TASK_REMINDER_2205,
      'Tasks:\n\n${q}',
      false
    );
    expect(result).not.toBeNull();
    // full guard reused verbatim — both clauses, not just the first
    expect(result).toContain('if(!ZI()||YY())return[]');
    // must NEVER emit the stale hardcoded fallback (GX is `class GX extends Error`
    // in 2.1.205 → calling it without `new` crashes every task-reminder render)
    expect(result).not.toContain('if(!GX())');
    expect(result).toContain('return gf([Lr({content:`Tasks:\n\n${q}`');
  });

  it('still handles the single-clause guard shape', () => {
    const single = MOCK_TASK_REMINDER_2205.replace(
      'if(!ZI()||YY())',
      'if(!ZI())'
    );
    const result = taskListReminder.apply(single, 'Tasks:\n\n${q}', false);
    expect(result).not.toBeNull();
    expect(result).toContain('if(!ZI())return[]');
  });

  it('fails loud (null) when the guard shape drifted beyond recognition', () => {
    const drifted = MOCK_TASK_REMINDER_2205.replace(
      'if(!ZI()||YY())return[]',
      'if(someBareCond)return[]'
    );
    expect(taskListReminder.apply(drifted, 'Tasks:\n\n${q}', false)).toBeNull();
  });
});

const taskNotif = REMINDER_REGISTRY.find(
  r => r.id === 'task-notification-framing'
)!;

const NOTIF_BODY =
  '[SYSTEM NOTIFICATION - NOT USER INPUT]\n' +
  'This is an automated background-task event, NOT a message from the user.\n' +
  'Do NOT interpret this as user acknowledgement, confirmation, or response to any pending question.\n\n';

// 2.1.183 hoisted the inline body into a standalone framing function
// `function MBl(e){return`…${e}`}` (case site: `return MBl(e);`).
const MOCK_NOTIF_FN_2_1_183 =
  'function MBl(e){return`' + NOTIF_BODY + '${e}`}function NBl(){}';

// <=2.1.182 inline shape: `case"task-notification":return`…${H}`;`.
const MOCK_NOTIF_INLINE =
  'switch(t){case"task-notification":return`' + NOTIF_BODY + '${H}`;default:}';

// 2.1.205 hoisted the framing into a lazily-initialized module var (`hJn`) whose
// label is now wrapped as `${"[SYSTEM NOTIFICATION - NOT USER INPUT]"}`, plus a
// prepend helper `qUr(e){if(e.startsWith(hJn))return e;return`${hJn}${e}`}` that
// APPENDS the message. The framing var holds only the prefix (ends `\n\n`, no
// `${message}` inside). A new anti-injection paragraph was added to the body —
// the anchor tolerates it via `[^`]*`.
const MOCK_NOTIF_LAZYVAR_2205 =
  'var hJn;var azi=b(()=>{hJn=`${"[SYSTEM NOTIFICATION - NOT USER INPUT]"}\n' +
  'This is an automated background-task event, NOT a message from the user.\n' +
  'Do NOT interpret this as user acknowledgement, confirmation, or response to any pending question.\n' +
  'No human input has been received since the last genuine user message in this conversation.\n\n`})' +
  'function qUr(e){if(e.startsWith(hJn))return e;return`${hJn}${e}`}';

describe('task-notification-framing wrapper discovery', () => {
  it('rewrites the 2.1.183 standalone framing function in place, preserving ${param} and the `}` suffix', () => {
    const result = taskNotif.apply(MOCK_NOTIF_FN_2_1_183, 'PREFIX ${H}', false);
    expect(result).not.toBeNull();
    expect(result).toContain('function MBl(e){return`PREFIX ${e}`}');
    // sibling function untouched
    expect(result).toContain('function NBl(){}');
  });

  it('still rewrites the <=2.1.182 inline case shape', () => {
    const result = taskNotif.apply(MOCK_NOTIF_INLINE, 'PREFIX ${H}', false);
    expect(result).not.toBeNull();
    expect(result).toContain('case"task-notification":return`PREFIX ${H}`;');
  });

  it('suppresses to a bare `${param}` on the function shape (empty body)', () => {
    const result = taskNotif.apply(MOCK_NOTIF_FN_2_1_183, '${H}', true);
    expect(result).toContain('function MBl(e){return`${e}`}');
  });

  it('fails loud (null) when the framing body text changed', () => {
    const drifted = 'function MBl(e){return`[DIFFERENT FRAMING]\n${e}`}';
    expect(taskNotif.apply(drifted, 'x ${H}', false)).toBeNull();
  });

  it('rewrites the 2.1.205 lazy framing var in place, stripping the appended-message placeholder and leaving qUr untouched', () => {
    const result = taskNotif.apply(
      MOCK_NOTIF_LAZYVAR_2205,
      'MY FRAMING\n\n${H}',
      false
    );
    expect(result).not.toBeNull();
    expect(result).toContain('hJn=`MY FRAMING\n\n`');
    // the prepend helper that appends the message must be untouched
    expect(result).toContain(
      'function qUr(e){if(e.startsWith(hJn))return e;return`${hJn}${e}`}'
    );
  });

  it('suppresses the 2.1.205 lazy framing var to an empty template (empty body)', () => {
    const result = taskNotif.apply(MOCK_NOTIF_LAZYVAR_2205, '${H}', true);
    expect(result).not.toBeNull();
    expect(result).toContain('hJn=``');
  });
});

const userNewMsg = REMINDER_REGISTRY.find(
  r => r.id === 'user-sent-new-message'
)!;

// 2.1.205 reworded the trailing framing to an explanatory sentence and keeps the
// hoisted intro var (`${ksa}`). The em-dash is the literal `—` escape in the
// template source (backslash + u2014), so the fixture carries it as `\\u2014`.
const MOCK_USERMSG_2205 =
  'case"auto-continuation":case"human":case void 0:return`${ksa}${e}\n\n' +
  'This is how Claude Code surfaces messages the user sends mid-turn \\u2014 within ' +
  'the running turn, often alongside the next tool result, rather than as a ' +
  'separate conversation turn. Address the message above as you continue this turn.`';

// <=2.1.204 imperative framing (older intro var `${$Tq}`, message var `${H}`).
const MOCK_USERMSG_2204 =
  'case"human":case void 0:return`${$Tq}${H}\n\n' +
  "IMPORTANT: After completing your current task, you MUST address the user's message above. Do not ignore it.`";

describe('user-sent-new-message wrapper discovery', () => {
  it('rewrites the 2.1.205 reworded mid-turn framing, capturing the message var', () => {
    const result = userNewMsg.apply(MOCK_USERMSG_2205, 'MSG ${H}', false);
    expect(result).not.toBeNull();
    expect(result).toContain(
      'case"auto-continuation":case"human":case void 0:return`MSG ${e}`'
    );
  });

  it('still rewrites the <=2.1.204 imperative framing via the trailing alternation', () => {
    const result = userNewMsg.apply(MOCK_USERMSG_2204, 'MSG ${H}', false);
    expect(result).not.toBeNull();
    expect(result).toContain('case"human":case void 0:return`MSG ${H}`');
  });

  it('suppresses to a bare message var (empty body)', () => {
    const result = userNewMsg.apply(MOCK_USERMSG_2205, '${H}', true);
    expect(result).not.toBeNull();
    expect(result).toContain('return`${e}`');
  });

  it('fails loud (null) when the framing text drifted', () => {
    const drifted =
      'case"human":case void 0:return`${ksa}${e}\n\n[SOME NEW UNRELATED FRAMING]`';
    expect(userNewMsg.apply(drifted, 'x ${H}', false)).toBeNull();
  });
});

const selectedLines = REMINDER_REGISTRY.find(
  r => r.id === 'selected-lines-in-ide'
)!;

// Body the runtime hands `apply`: the defaultBody with placeholders already
// substituted to their `${H.x}` / `${q}` expressions by substitutePlaceholders.
const SELECTED_LINES_BODY =
  'The user selected the lines ${H.lineStart} to ${H.lineEnd} from ' +
  '${H.filename}:\n${q}\n\nThis may or may not be related to the current task.';

// 2.1.186+ direct-arrow shape: the truncation `{let q=…substring(0,2000)…}`
// wrapper is gone and the selected-text slot is an inlined function call
// (`${k6l(e.content)}`) rather than a local var.
const MOCK_SELECTED_NEW_2_1_186 =
  'selected_lines_in_ide:(e)=>sp([Ln({content:`The user selected the lines ' +
  '${e.lineStart} to ${e.lineEnd} from ${e.filename}:\n${k6l(e.content)}\n\n' +
  'This may or may not be related to the current task.`,isMeta:!0})])';

// <=2.1.185 shape: truncated content >2000 chars into a local `q` before emit.
const MOCK_SELECTED_OLD_2_1_185 =
  'selected_lines_in_ide:(H)=>{let q=H.content.length>2000?' +
  'H.content.substring(0,2000)+`\n... (truncated)`:H.content;' +
  'return o5([j6({content:`The user selected the lines ${H.lineStart} to ' +
  '${H.lineEnd} from ${H.filename}:\n${q}\n\nThis may or may not be related ' +
  'to the current task.`,isMeta:!0})])}';

// The sibling diff handler shares the trailing English; the patch must not
// rewrite it (anchored on `selected_lines_in_ide:` + the distinct phrasing).
const MOCK_SELECTED_DIFF_SIBLING =
  'selected_lines_in_diff:(e)=>sp([Ln({content:`The user selected the ' +
  'following ${e.lineCount} ${e.lineCount===1?"line":"lines"} from the diff ' +
  'view:\n${k6l(e.content)}\n\nThis may or may not be related to the current ' +
  'task.`,isMeta:!0})])';

describe('selected-lines-in-ide reminder shape handling', () => {
  it('rewrites the 2.1.186 direct-arrow shape, inlining the captured content expression for ${q}', () => {
    const result = selectedLines.apply(
      MOCK_SELECTED_NEW_2_1_186,
      SELECTED_LINES_BODY,
      false
    );
    expect(result).not.toBeNull();
    // Default body round-trips to the exact pristine code.
    expect(result).toBe(MOCK_SELECTED_NEW_2_1_186);
    // No stale `{let q=…}` wrapper or substring(0,2000) reintroduced.
    expect(result).not.toContain('substring(0,2000)');
    expect(result).toContain('${k6l(e.content)}');
  });

  it('maps a customized body onto the new shape, preserving the inlined content expression', () => {
    const custom =
      'SELECTED ${H.lineStart}-${H.lineEnd} in ${H.filename}:\n${q}';
    const result = selectedLines.apply(
      MOCK_SELECTED_NEW_2_1_186,
      custom,
      false
    );
    expect(result).not.toBeNull();
    expect(result).toContain(
      'selected_lines_in_ide:(e)=>sp([Ln({content:`SELECTED ' +
        '${e.lineStart}-${e.lineEnd} in ${e.filename}:\n${k6l(e.content)}`'
    );
  });

  it('suppresses the new shape to a bare empty-array arrow', () => {
    const result = selectedLines.apply(
      MOCK_SELECTED_NEW_2_1_186,
      SELECTED_LINES_BODY,
      true
    );
    expect(result).toContain('selected_lines_in_ide:(e)=>[]');
  });

  it('still rewrites the <=2.1.185 truncating shape via the fallback', () => {
    const result = selectedLines.apply(
      MOCK_SELECTED_OLD_2_1_185,
      SELECTED_LINES_BODY,
      false
    );
    expect(result).not.toBeNull();
    // Round-trips to pristine, keeping the truncation wrapper + local `q`.
    expect(result).toBe(MOCK_SELECTED_OLD_2_1_185);
  });

  it('does not touch the selected_lines_in_diff sibling', () => {
    expect(
      selectedLines.apply(
        MOCK_SELECTED_DIFF_SIBLING,
        SELECTED_LINES_BODY,
        false
      )
    ).toBeNull();
  });
});

describe('verify-plan reminder removed-feature handling', () => {
  const verifyPlan = REMINDER_REGISTRY.find(
    r => r.id === 'verify-plan-reminder'
  )!;

  // CC 2.1.187 gutted the verify-plan reminder: `verify_plan_reminder` survives
  // only as a type label with no case body / no injected text. The patch must
  // no-op (return content unchanged) instead of failing, so the apply log stays
  // clean on current CC while older supported CC (< 2.1.187) still patches.
  it('no-ops when the verify-plan case body was removed (CC 2.1.187)', () => {
    const removed =
      'function r(){return["plan_mode_enter","plan_mode_exit","verify_plan_reminder"]}';
    expect(verifyPlan.apply(removed, 'body', false)).toBe(removed);
    // Suppression path also no-ops rather than failing.
    expect(verifyPlan.apply(removed, '', true)).toBe(removed);
  });

  // But if the anchor text is still present and the case shape is unmatched,
  // that's a real shape drift on a build that still has the feature — surface it.
  it('still fails (null) on real drift when the anchor text is present', () => {
    const drifted =
      'case"other":You have completed implementing the plan but the shape changed';
    expect(verifyPlan.apply(drifted, 'body', false)).toBeNull();
  });
});

// CC 2.1.238 reworded/restructured eight reminder handlers: the wrapper renamed
// (ih/Vr → Zy/kn — already parameterized), several filename slots gained a path
// helper wrap (`${e.filename}` → `${Kae(e.filename)}`), output_style swapped its
// map-lookup guard for type/length guards, and edited_text_file became a block
// body that hoists a shared prefix. These verify the anchors match the 2.1.238
// shapes (and still suppress).
describe('reminder anchors — CC 2.1.238 shapes', () => {
  const get = (id: string) => REMINDER_REGISTRY.find(r => r.id === id)!;

  it('date-change: content-agnostic tail after the newDate prefix', () => {
    const mock =
      'date_change:(e)=>Zy([kn({content:`The date has changed. Today\'s date is now ${e.newDate}. No need to announce the new date \\u2014 the user\'s own clock shows it.`,isMeta:!0})])';
    const out = get('date-change').apply(mock, 'body ${H.newDate}', false)!;
    expect(out).not.toBeNull();
    expect(out).toContain('date_change:(e)=>Zy([kn({content:');
    expect(get('date-change').apply(mock, '', true)).toContain(
      'date_change:(e)=>[]'
    );
  });

  it('compact-file-reference: preserves the ${Kae(e.filename)} wrap', () => {
    const mock =
      'compact_file_reference:(e)=>Zy([kn({content:`Note: ${Kae(e.filename)} was read before the last conversation was summarized, but the contents are too large to include. Use ${mC.name} tool if you need to access it.`,isMeta:!0})])';
    const out = get('compact-file-reference').apply(
      mock,
      'Note: ${H.filename} use ${oO.name}',
      false
    )!;
    expect(out).toContain('Kae(e.filename)');
    expect(out).toContain('${mC.name}');
  });

  it('pdf-reference: preserves the ${Kae(e.filename)} wrap', () => {
    const mock =
      'pdf_reference:(e)=>Zy([kn({content:`PDF file: ${Kae(e.filename)} (${e.pageCount} pages, ${Ba(e.fileSize)}). This PDF is too large to read all at once. You MUST use the ${Ns} tool with the pages parameter to read specific page ranges (e.g., pages: "1-5"). Do NOT call ${Ns} without the pages parameter or it will fail. Maximum 20 pages per request.`,isMeta:!0})])';
    const out = get('pdf-reference').apply(
      mock,
      'PDF: ${H.filename} ${H.page_count} ${H.file_size} ${H.read_tool}',
      false
    )!;
    expect(out).not.toBeNull();
    expect(out).toContain('Kae(e.filename)');
  });

  it('selected-lines-in-ide: preserves filename wrap + content expr', () => {
    const mock =
      'selected_lines_in_ide:(e)=>Zy([kn({content:`The user selected the lines ${e.lineStart} to ${e.lineEnd} from ${Kae(e.filename)}:\n${Eqm(e.content)}\n\nThis may or may not be related to the current task.`,isMeta:!0})])';
    const out = get('selected-lines-in-ide').apply(
      mock,
      'lines ${H.lineStart}-${H.lineEnd} ${H.filename} ${q}',
      false
    )!;
    expect(out).toContain('Kae(e.filename)');
    expect(out).toContain('Eqm(e.content)');
  });

  it('opened-file-in-ide: reproduces exactly (no-op) with matching default', () => {
    const mock =
      'opened_file_in_ide:(e)=>Zy([kn({content:`The user opened the file ${Kae(e.filename)} in the IDE. This may or may not be related to the current task.`,isMeta:!0})])';
    const body =
      'The user opened the file ${H.filename} in the IDE. This may or may not be related to the current task.';
    const out = get('opened-file-in-ide').apply(mock, body, false)!;
    expect(out).toBe(mock); // Kae wrap preserved → exact reproduction
    expect(get('opened-file-in-ide').apply(mock, '', true)).toContain(
      'opened_file_in_ide:(e)=>[]'
    );
  });

  it('output-style: matches the 2.1.238 guard shape, preserves guards', () => {
    const mock =
      'output_style:(e)=>{if(typeof e.style!=="string"||e.style==="")return[];if(e.style.length>gFn)return T(`too long`,{level:"error"}),[];return Zy([kn({content:`${pze(e.style)} output style is active. ${e.turnReminder??"Remember to follow the specific guidelines for this style."}`,isMeta:!0})])}';
    const out = get('output-style-banner').apply(
      mock,
      '${_.name} active ${H.turnReminder??"x"}',
      false
    )!;
    expect(out).not.toBeNull();
    // guards preserved
    expect(out).toContain('typeof e.style!=="string"');
    expect(out).toContain('e.style.length>gFn');
    // style-name expression preserved
    expect(out).toContain('pze(e.style)');
  });

  it('output-style: still matches the <=2.1.237 map-lookup shape', () => {
    const mock =
      'output_style:(e)=>{let s=W[e.style];if(!s)return[];return Zy([kn({content:`${s.name} output style is active. ${e.turnReminder??"Remember to follow the specific guidelines for this style."}`,isMeta:!0})])}';
    const out = get('output-style-banner').apply(
      mock,
      '${_.name} active ${H.turnReminder??"x"}',
      false
    )!;
    expect(out).not.toBeNull();
    expect(out).toContain('let s=W[e.style];if(!s)return[]');
    expect(out).toContain('s.name');
  });

  it('edited-text-file: matches the 2.1.238 block+ternary body', () => {
    const mock =
      'edited_text_file:(e)=>{let t=`Note: ${Kae(e.filename)} changed on disk.`;return Zy([kn({content:e.snippet===""?`${t} omitted; use ${mC.name}`:`${t} changes:\n${e.snippet}`,isMeta:!0})])}';
    const out = get('edited-text-file').apply(
      mock,
      'Note ${H.filename} ${H.snippet}',
      false
    )!;
    expect(out).not.toBeNull();
    expect(out).toContain('edited_text_file:(e)=>Zy([kn({content:');
    expect(get('edited-text-file').apply(mock, '', true)).toContain(
      'edited_text_file:(e)=>[]'
    );
  });

  it('mcp-per-server-router: preserves the appended second map write', () => {
    const mock =
      'for(let f of s)if(f.instructions)l.set(f.name,`## ${f.name}\n${f.instructions}`),c.set(f.name,f.instructions);';
    const out = get('mcp-per-server-router').apply(mock, '', false)!;
    expect(out).not.toBeNull();
    expect(out).toContain('__tweakccMcpOverride');
    // the second map (c.set) must still run
    expect(out).toContain('c.set(f.name,f.instructions)');
  });
});
