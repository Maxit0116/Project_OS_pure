import type { FixtureValidationError } from "./validation/index.js";

export type ProjectOSErrorCode =
  | "invalid_workspace_path"
  | "invalid_workspace_fixtures"
  | "project_not_loaded"
  | "node_not_found"
  | "file_not_found"
  | "file_write_failed"
  | "refinement_not_found"
  | "run_not_found"
  | "diff_not_found"
  | "harness_record_not_found"
  | "map_artifact_not_found"
  | "map_stack_not_found"
  | "map_stack_type_mismatch"
  | "map_stack_reorder_invalid"
  | "map_asset_not_found"
  | "map_work_group_not_found"
  | "invalid_work_group_layout"
  | "invalid_image"
  | "image_too_large"
  | "not_implemented"
  | "transport_not_connected"
  | "persistence_write_failed"
  | "invalid_design_blocks"
  | "design_revision_conflict"
  | "settings_not_found"
  | "invalid_settings"
  | "invalid_project_description"
  | "model_connection_failed"
  | "external_agent_failed"
  | "agent_orchestration_failed"
  | "proposal_validation_failed"
  | "agent_answer_unavailable"
  | "ownership_ambiguous"
  | "file_owner_not_found"
  | "local_context_unavailable"
  | "diff_apply_unsupported"
  | "diff_scope_violation"
  | "diff_apply_failed"
  | "diff_stale"
  | "verification_unavailable"
  | "verification_approval_required"
  | "backup_not_found"
  | "undo_stale"
  | "restore_failed"
  | "speech_transcription_failed"
  | "plan_generation_failed"
  | "plan_not_found"
  | "plan_not_ready"
  | "debug_session_not_found"
  | "debug_instrumentation_failed"
  | "person_not_found"
  | "invalid_collab_transition"
  | "acceptance_not_found"
  | "handoff_not_found"
  | "handoff_overwrite_required"
  | "acceptance_blocked"
  | "decision_not_found"
  | "meeting_not_found"
  | "meeting_already_applied"
  | "anchor_required"
  | "github_auth_required"
  | "github_oauth_failed"
  | "github_oauth_not_configured"
  | "git_sync_failed"
  | "git_conflict"
  | "pr_not_found"
  | "daily_brief_not_found"
  | "annotation_not_found"
  | "spatial_pin_invalid"
  | "loop_graph_not_found"
  | "loop_graph_invalid";

export interface ProjectOSErrorOptions {
  cause?: unknown;
  validationErrors?: FixtureValidationError[];
  details?: Record<string, unknown>;
}

export class ProjectOSError extends Error {
  readonly code: ProjectOSErrorCode;
  readonly validationErrors: FixtureValidationError[] | undefined;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    code: ProjectOSErrorCode,
    message: string,
    options: ProjectOSErrorOptions = {},
  ) {
    super(message);
    this.name = "ProjectOSError";
    this.code = code;
    this.validationErrors = options.validationErrors;
    this.details = options.details;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export function notImplemented(method: string): ProjectOSError {
  return new ProjectOSError(
    "not_implemented",
    `ProjectOSApi.${method} is not implemented yet`,
  );
}
