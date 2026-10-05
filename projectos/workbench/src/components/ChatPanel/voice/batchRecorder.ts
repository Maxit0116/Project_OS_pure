export function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  for (const type of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return undefined
}

export interface BatchRecorderSession {
  stream: MediaStream
  stop: () => Promise<Blob>
  cancel: () => void
}

export async function startBatchRecorder(): Promise<BatchRecorderSession> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  })

  const mimeType = pickRecorderMimeType()
  const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
  const chunks: Blob[] = []

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }

  return await new Promise((resolve, reject) => {
    recorder.onerror = () => reject(new Error('recorder_error'))
    recorder.start()

    const stopTracks = () => {
      stream.getTracks().forEach((track) => track.stop())
    }

    resolve({
      stream,
      stop: () =>
        new Promise((res, rej) => {
          recorder.onstop = () => {
            stopTracks()
            const type = mimeType || chunks[0]?.type || 'audio/webm'
            res(new Blob(chunks, { type }))
          }
          recorder.onerror = () => rej(new Error('recorder_error'))
          if (recorder.state === 'inactive') {
            const type = mimeType || chunks[0]?.type || 'audio/webm'
            res(new Blob(chunks, { type }))
            return
          }
          recorder.stop()
        }),
      cancel: () => {
        recorder.onstop = stopTracks
        if (recorder.state !== 'inactive') recorder.stop()
        else stopTracks()
      },
    })
  })
}
