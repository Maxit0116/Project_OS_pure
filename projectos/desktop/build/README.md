# App icon (stock Electron for now)

`icon.icns` / `icon.png` mirror the **stock Electron** mark so:

- `npm run dev` keeps the unmodified Electron.app identity (`com.github.Electron`)
- macOS Keychain ACL stays stable (no password prompt after every rebrand/resign)
- Packaged builds use the same interim mark until a post-MVP Project OS logo ships

Do **not** run `brand-dev-electron-app.cjs` during daily development — changing Bundle ID / adhoc re-signing is what re-triggers Keychain prompts.

To refresh these files from the installed Electron host:

```bash
cd projectos/desktop
cp node_modules/electron/dist/Electron.app/Contents/Resources/electron.icns build/icon.icns
# optional PNG masters via iconutil extract
```
