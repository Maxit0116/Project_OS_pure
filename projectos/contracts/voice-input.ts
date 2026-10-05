export interface TranscribeAudioRequest {
  projectId: string;
  audioBase64: string;
  mimeType: string;
  language?: string;
  modelProfileId?: string;
}

export interface TranscribeAudioResult {
  text: string;
}
