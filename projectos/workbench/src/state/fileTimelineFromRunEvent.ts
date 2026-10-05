import type { GeneratedDiff, ProjectOSApi } from '@contracts/index'
import { useFileTimelineStore } from './fileTimelineStore'

export async function recordProposedTimelineFromDiff(
  client: ProjectOSApi,
  projectId: string,
  runId: string,
  diff: GeneratedDiff,
): Promise<void> {
  const files = diff.files
    .filter((file) => file.before !== undefined || file.after !== undefined)
    .map((file) => ({
      path: file.path,
      before: file.before,
      after: file.after,
    }))
  if (files.length === 0) return

  await client.recordProposedFileTimeline(projectId, runId, files)
  const timelineStore = useFileTimelineStore.getState()
  for (const file of files) {
    await timelineStore.refresh(file.path)
  }
}
