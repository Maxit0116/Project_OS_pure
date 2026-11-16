/**
 * Optional bridges from Loop runtime hooks → Workbench UI (Notification Center, Lab).
 * LocalApi sets these when the workbench process boots; unit tests leave them unset.
 */

export type LoopNotifyBridge = (input: {
  title: string;
  body: string;
  loopId?: string;
  instanceId?: string;
  nodeId?: string;
}) => void;

export type LoopLabVerifyBridge = (input: {
  loopId: string;
  instanceId: string;
  nodeId: string;
  acceptance: Array<{
    id: string;
    text: string;
    required: boolean;
    sourceNodeId?: string;
  }>;
}) => { ok: boolean; sessionId?: string; message?: string };

let notifyBridge: LoopNotifyBridge | null = null;
let labVerifyBridge: LoopLabVerifyBridge | null = null;

export function setLoopNotifyBridge(bridge: LoopNotifyBridge | null): void {
  notifyBridge = bridge;
}

export function setLoopLabVerifyBridge(bridge: LoopLabVerifyBridge | null): void {
  labVerifyBridge = bridge;
}

export function getLoopNotifyBridge(): LoopNotifyBridge | null {
  return notifyBridge;
}

export function getLoopLabVerifyBridge(): LoopLabVerifyBridge | null {
  return labVerifyBridge;
}
