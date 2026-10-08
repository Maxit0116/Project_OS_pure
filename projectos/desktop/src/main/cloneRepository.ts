import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

const HTTPS_URL = /^https:\/\/[A-Za-z0-9.-]+\/[A-Za-z0-9._~/-]+(?:\.git)?$/
const SSH_URL = /^git@[A-Za-z0-9.-]+:[A-Za-z0-9._/-]+\.git$/

export function parseCloneUrl(input: unknown): string {
  if (typeof input !== 'string') {
    throw new Error('Repository URL is required')
  }
  const url = input.trim()
  if (url.length === 0 || url.length > 300 || /[\s"'`$\\]/.test(url)) {
    throw new Error('Repository URL is invalid')
  }
  if (!HTTPS_URL.test(url) && !SSH_URL.test(url)) {
    throw new Error('Use an https:// or git@ repository URL')
  }
  return url
}

export function repositoryDirectoryName(url: string): string {
  const withoutGit = url.replace(/\.git$/, '')
  const sshName = withoutGit.match(/:([^/]+)$/)?.[1]
  const httpsName = withoutGit.split('/').pop()
  const name = sshName ?? httpsName ?? ''
  if (!/^[A-Za-z0-9._-]+$/.test(name)) {
    throw new Error('Could not determine a repository folder name')
  }
  return name
}

export function runGitClone(url: string, destination: string): Promise<void> {
  if (existsSync(destination)) {
    return Promise.reject(new Error('A folder with that name already exists'))
  }
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['clone', '--', url, destination], { shell: false })
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += String(chunk)
    })
    child.on('error', (error) => {
      reject(error)
    })
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(stderr.trim() || `git clone exited ${code ?? 'unknown'}`))
    })
  })
}
