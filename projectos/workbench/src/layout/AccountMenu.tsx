import { useEffect, useRef, useState } from 'react'
import {
  ChevronRight,
  CircleHelp,
  GitBranch,
  LogOut,
  Monitor,
  Moon,
  Sun,
  User,
  Users,
} from 'lucide-react'
import type { ThemePreference } from '../styles/theme'
import { useI18n } from '../i18n'
import { useWorkbenchStore } from '../state/workbenchStore'
import AccountAvatar from './AccountAvatar'
import styles from './AccountMenu.module.css'

const ACCOUNT_HELP_URL =
  'https://github.com/Maxit0116/Project_OS_pure/blob/main/docs/features/User-Account-Menu-and-Google-Auth-Dev-Plan.md'

type MenuView = 'root' | 'appearance' | 'profile'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  compact?: boolean
}

function GoogleGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M21.6 12.23c0-.74-.07-1.45-.19-2.13H12v4.03h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.89-1.74 2.98-4.3 2.98-7.42Z"
        opacity="0.9"
      />
      <path
        fill="currentColor"
        d="M12 22c2.7 0 4.96-.9 6.62-2.43l-3.24-2.5c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.58-4.12H3.07v2.58A9.99 9.99 0 0 0 12 22Z"
        opacity="0.75"
      />
      <path
        fill="currentColor"
        d="M6.42 13.91A6 6 0 0 1 6.1 12c0-.66.11-1.31.3-1.91V7.51H3.07A10 10 0 0 0 2 12c0 1.61.39 3.14 1.07 4.49l3.35-2.58Z"
        opacity="0.85"
      />
      <path
        fill="currentColor"
        d="M12 5.98c1.47 0 2.79.5 3.83 1.5l2.87-2.87C16.95 2.99 14.7 2 12 2A9.99 9.99 0 0 0 3.07 7.51l3.35 2.58C7.2 7.74 9.4 5.98 12 5.98Z"
        opacity="0.7"
      />
    </svg>
  )
}

export default function AccountMenu({ open, onOpenChange, compact = false }: Props) {
  const { ts } = useI18n()
  const rootRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<MenuView>('root')
  const userAccountStatus = useWorkbenchStore((s) => s.userAccountStatus)
  const googlePending = useWorkbenchStore((s) => s.userAccountGooglePending)
  const githubPending = useWorkbenchStore((s) => s.githubDeviceAuthPending)
  const githubSignInIntent = useWorkbenchStore((s) => s.userAccountGitHubSignInIntent)
  const themePreference = useWorkbenchStore((s) => s.themePreference)
  const setThemePreference = useWorkbenchStore((s) => s.setThemePreference)
  const refreshUserAccountStatus = useWorkbenchStore((s) => s.refreshUserAccountStatus)
  const connectGoogleAccount = useWorkbenchStore((s) => s.connectGoogleAccount)
  const cancelGoogleOAuth = useWorkbenchStore((s) => s.cancelGoogleOAuth)
  const cancelGitHubOAuth = useWorkbenchStore((s) => s.cancelGitHubOAuth)
  const signInUserAccountWithGitHub = useWorkbenchStore((s) => s.signInUserAccountWithGitHub)
  const signOutUserAccount = useWorkbenchStore((s) => s.signOutUserAccount)
  const pushToast = useWorkbenchStore((s) => s.pushToast)

  const signedIn = Boolean(userAccountStatus?.connected)
  const authBusy = googlePending || Boolean(githubPending) || githubSignInIntent

  useEffect(() => {
    void refreshUserAccountStatus()
  }, [refreshUserAccountStatus])

  useEffect(() => {
    if (!open) setView('root')
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false)
    }
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        onOpenChange(false)
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onPointer)
    }
  }, [open, onOpenChange])

  const displayName =
    userAccountStatus?.displayName ||
    userAccountStatus?.login ||
    ts('accountMenu.signedInFallback')
  const providerLabel =
    userAccountStatus?.provider === 'google'
      ? ts('accountMenu.providerGoogle')
      : userAccountStatus?.provider === 'github'
        ? ts('accountMenu.providerGithub')
        : ''

  const openHelp = () => {
    void window.projectOS?.shell.openExternal(ACCOUNT_HELP_URL).catch(() => {
      pushToast({ type: 'info', message: ts('accountMenu.helpFallback') })
    })
    onOpenChange(false)
  }

  const handleSignOut = async () => {
    await signOutUserAccount()
    onOpenChange(false)
  }

  const handleSwitchAccount = async () => {
    await signOutUserAccount()
    setView('root')
    onOpenChange(true)
  }

  const themeOptions: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
    { value: 'system', label: ts('settings.themeOptions.system'), icon: Monitor },
    { value: 'light', label: ts('settings.themeOptions.light'), icon: Sun },
    { value: 'dark', label: ts('settings.themeOptions.dark'), icon: Moon },
  ]

  return (
    <div className={`${styles.root} ${compact ? styles.compact : ''}`} ref={rootRef}>
      <button
        type="button"
        className={`${styles.trigger} ${signedIn ? styles.triggerSignedIn : ''} ${open ? styles.triggerOpen : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={
          signedIn ? ts('accountMenu.accountMenu') : ts('accountMenu.signInMenu')
        }
        title={
          signedIn
            ? ts('accountMenu.signedInAs', { name: displayName })
            : ts('accountMenu.signInMenu')
        }
        onClick={() => onOpenChange(!open)}
      >
        <AccountAvatar
          src={signedIn ? userAccountStatus?.avatarUrl : null}
          size={compact ? 16 : 18}
          variant="chrome"
        />
      </button>

      {open ? (
        <div className={styles.menu} role="menu" aria-label={ts('accountMenu.accountMenu')}>
          {view === 'appearance' ? (
            <>
              <button
                type="button"
                className={styles.backRow}
                onClick={() => setView('root')}
              >
                ← {ts('accountMenu.appearance')}
              </button>
              <div className={styles.divider} />
              {themeOptions.map((option) => {
                const Icon = option.icon
                const active = themePreference === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    className={`${styles.item} ${active ? styles.itemActive : ''}`}
                    onClick={() => {
                      setThemePreference(option.value)
                      setView('root')
                    }}
                  >
                    <Icon size={15} strokeWidth={1.75} aria-hidden />
                    <span>{option.label}</span>
                  </button>
                )
              })}
            </>
          ) : null}

          {view === 'profile' ? (
            <>
              <button
                type="button"
                className={styles.backRow}
                onClick={() => setView('root')}
              >
                ← {ts('accountMenu.profile')}
              </button>
              <div className={styles.divider} />
              {signedIn ? (
                <div className={styles.profileBody}>
                  <div className={styles.profileRow}>
                    <span className={styles.profileKey}>{ts('accountMenu.profileName')}</span>
                    <span className={styles.profileValue}>{displayName}</span>
                  </div>
                  <div className={styles.profileRow}>
                    <span className={styles.profileKey}>{ts('accountMenu.profileEmail')}</span>
                    <span className={styles.profileValue}>
                      {userAccountStatus?.email || '—'}
                    </span>
                  </div>
                  <div className={styles.profileRow}>
                    <span className={styles.profileKey}>{ts('accountMenu.profileProvider')}</span>
                    <span className={styles.profileValue}>{providerLabel}</span>
                  </div>
                  <div className={styles.profileRow}>
                    <span className={styles.profileKey}>{ts('accountMenu.profileConnected')}</span>
                    <span className={styles.profileValue}>
                      {userAccountStatus?.connectedAt
                        ? new Date(userAccountStatus.connectedAt).toLocaleString()
                        : '—'}
                    </span>
                  </div>
                </div>
              ) : (
                <p className={styles.hint}>{ts('accountMenu.profileSignedOut')}</p>
              )}
            </>
          ) : null}

          {view === 'root' ? (
            <>
              {signedIn ? (
                <div className={styles.identity}>
                  <AccountAvatar
                    src={userAccountStatus?.avatarUrl}
                    size={36}
                    variant="menu"
                  />
                  <div className={styles.identityText}>
                    <div className={styles.identityName}>{displayName}</div>
                    {userAccountStatus?.email ? (
                      <div className={styles.identityEmail}>{userAccountStatus.email}</div>
                    ) : null}
                    <div className={styles.identityProvider}>{providerLabel}</div>
                  </div>
                </div>
              ) : (
                <div className={styles.signedOutHeader}>
                  <div className={styles.signedOutTitle}>{ts('accountMenu.signInTitle')}</div>
                  <div className={styles.signedOutHint}>{ts('accountMenu.signInHint')}</div>
                </div>
              )}

              <div className={styles.divider} />

              {authBusy ? (
                <div className={styles.pendingBlock}>
                  <p className={styles.hint}>
                    {googlePending
                      ? ts('accountMenu.waitingGoogle')
                      : ts('accountMenu.waitingGithub')}
                  </p>
                  {githubPending?.userCode ? (
                    <p className={styles.deviceCode}>{githubPending.userCode}</p>
                  ) : null}
                  <button
                    type="button"
                    className={styles.item}
                    onClick={() => {
                      if (googlePending) void cancelGoogleOAuth()
                      else void cancelGitHubOAuth()
                    }}
                  >
                    {ts('accountMenu.cancelSignIn')}
                  </button>
                  <div className={styles.divider} />
                </div>
              ) : null}

              {!signedIn && !authBusy ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.item}
                    onClick={() => void connectGoogleAccount()}
                  >
                    <GoogleGlyph size={15} />
                    <span>{ts('accountMenu.continueGoogle')}</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.item}
                    onClick={() => void signInUserAccountWithGitHub()}
                  >
                    <GitBranch size={15} strokeWidth={1.75} aria-hidden />
                    <span>{ts('accountMenu.continueGithub')}</span>
                  </button>
                  <div className={styles.divider} />
                </>
              ) : null}

              <button
                type="button"
                role="menuitem"
                className={styles.item}
                disabled={!signedIn}
                onClick={() => setView('profile')}
              >
                <User size={15} strokeWidth={1.75} aria-hidden />
                <span>{ts('accountMenu.profile')}</span>
                <ChevronRight size={14} className={styles.chevron} aria-hidden />
              </button>
              <button
                type="button"
                role="menuitem"
                className={styles.item}
                onClick={() => setView('appearance')}
              >
                <Monitor size={15} strokeWidth={1.75} aria-hidden />
                <span>{ts('accountMenu.appearance')}</span>
                <span className={styles.meta}>
                  {ts(`settings.themeOptions.${themePreference}`)}
                </span>
                <ChevronRight size={14} className={styles.chevron} aria-hidden />
              </button>
              <button
                type="button"
                role="menuitem"
                className={styles.item}
                onClick={openHelp}
              >
                <CircleHelp size={15} strokeWidth={1.75} aria-hidden />
                <span>{ts('accountMenu.help')}</span>
              </button>

              {signedIn ? (
                <>
                  <div className={styles.divider} />
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.item}
                    onClick={() => void handleSwitchAccount()}
                  >
                    <Users size={15} strokeWidth={1.75} aria-hidden />
                    <span>{ts('accountMenu.switchAccount')}</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.item}
                    onClick={() => void handleSignOut()}
                  >
                    <LogOut size={15} strokeWidth={1.75} aria-hidden />
                    <span>{ts('accountMenu.signOut')}</span>
                  </button>
                </>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
