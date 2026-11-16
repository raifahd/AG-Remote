export interface LiveInteraction {
  cascadeId?: string | undefined;
  trajectoryId?: string | undefined;
  stepIndex: number;
  kind: string;
  stepType?: string | undefined;
  actionDescription?: string | undefined;
  commandLine?: string | undefined;
  cwd?: string | undefined;
  target?: string | undefined;
  absolutePathUri?: string | undefined;
}

export type Decision =
  | { allow: true; scope: 'once' | 'conversation'; response?: string | undefined }
  | { allow: false; instruction?: string | undefined };

const SCOPE_ONCE = 1;
const SCOPE_CONVERSATION = 2;

const CONFIRM_ONLY_KINDS = new Set([
  'openBrowserUrl',
  'captureBrowserScreenshot',
  'executeBrowserJavascript',
  'mcp',
  'readUrlContent'
]);

export function buildInteraction(p: LiveInteraction, d: Decision): Record<string, unknown> {
  const base: Record<string, unknown> = {
    trajectoryId: p.trajectoryId ?? '',
    stepIndex: p.stepIndex
  };

  if (p.kind === 'permission') {
    return {
      ...base,
      permission: d.allow
        ? { allow: true, scope: d.scope === 'conversation' ? SCOPE_CONVERSATION : SCOPE_ONCE }
        : { allow: false, scope: SCOPE_ONCE, ...(d.instruction ? { userDenyInstruction: d.instruction } : {}) }
    };
  }

  if (p.kind === 'runCommand' || p.kind === 'terminal') {
    const cmd = p.commandLine || '';
    return {
      ...base,
      runCommand: {
        confirm: d.allow,
        proposedCommandLine: cmd,
        submittedCommandLine: cmd
      }
    };
  }

  if (p.kind === 'filePermission' || p.kind === 'edit') {
    const uri = p.absolutePathUri || p.target;
    const scope = d.allow && d.scope === 'conversation' ? SCOPE_CONVERSATION : SCOPE_ONCE;
    return {
      ...base,
      filePermission: {
        allow: d.allow,
        scope,
        ...(uri ? { absolutePathUri: uri } : {})
      }
    };
  }

  if (CONFIRM_ONLY_KINDS.has(p.kind) || p.kind === 'tool') {
    const kindKey = CONFIRM_ONLY_KINDS.has(p.kind) ? p.kind : 'mcp';
    return {
      ...base,
      [kindKey]: {
        confirm: d.allow
      }
    };
  }

  if (p.kind === 'ask_question') {
    return {
      ...base,
      askQuestion: {
        confirm: d.allow,
        ...(d.allow && d.response ? { response: d.response } : {})
      }
    };
  }

  return {
    ...base,
    permission: {
      allow: d.allow,
      scope: SCOPE_ONCE
    }
  };
}
