/**
 * Reference handler for Void fork — S2.0.4 webview embed.
 * Adapt imports to match your Void/VS Code extension API surface.
 *
 * NOT compiled in projectos/workbench; copy into Void fork contribution.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VsCodeApi = any

export function registerProjectOSOpenWorkbench(vscode: VsCodeApi): void {
  const disposable = vscode.commands.registerCommand('projectos.openWorkbench', async () => {
    const devMode = process.env.PROJECTOS_DEV === '1'
    const url = devMode
      ? 'http://localhost:5173'
      : vscode.Uri.file(
          // Replace with packaged workbench dist path inside Void resources
          '/path/to/projectos/workbench/dist/index.html',
        ).toString()

    const panel = vscode.window.createWebviewPanel(
      'projectosWorkbench',
      'Project OS',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    )

    if (devMode) {
      panel.webview.html = wrapDevWebview(url)
    } else {
      panel.webview.html = wrapFileWebview(panel.webview, url)
    }
  })

  // vscode.subscriptions.push(disposable) — register in extension activate()
  void disposable
}

function wrapDevWebview(url: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${url} http://localhost:5173; style-src 'unsafe-inline';" />
  <style>html,body{margin:0;height:100%;}iframe{border:0;width:100%;height:100%;}</style>
</head>
<body>
  <iframe src="${url}" title="Project OS Workbench"></iframe>
</body>
</html>`
}

function wrapFileWebview(webview: { asWebviewUri: (uri: unknown) => unknown }, fileUrl: string): string {
  const src = String(webview.asWebviewUri({ toString: () => fileUrl }))
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>html,body{margin:0;height:100%;}iframe{border:0;width:100%;height:100%;}</style>
</head>
<body>
  <iframe src="${src}" title="Project OS Workbench"></iframe>
</body>
</html>`
}
