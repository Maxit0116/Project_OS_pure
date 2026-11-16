import {
  setLoopLabVerifyBridge,
  setLoopNotifyBridge,
} from '../../../services/loop-workbench-bridges'
import { useNotificationCenterStore } from '../state/notificationCenterStore'
import { useProductLabStore } from '../state/productLabStore'

/** Wire Loop runtime hooks to Notification Center + Product Lab (once per app). */
export function installLoopWorkbenchBridges(): void {
  setLoopNotifyBridge((input) => {
    useNotificationCenterStore.getState().pushNotification({
      kind: 'toast_info',
      title: input.title,
      body: input.body,
      destination: 'none',
      ephemeral: false,
    })
  })
  setLoopLabVerifyBridge((input) => {
    // Sync bridge API — kick async Lab open without blocking the stepper await shape.
    // Runtime awaits the returned object; we start Lab immediately.
    void useProductLabStore.getState().startLabFromLoop(input)
    return { ok: true, message: 'Lab verification opened' }
  })
}
