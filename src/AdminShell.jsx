import { useEffect, useRef, useState } from 'react'

const MENU_ITEMS = [
  {
    key: 'home',
    label: 'Home',
    icon: '🏠',
    description: 'Ringkasan dashboard',
  },
  {
    key: 'network',
    label: 'Jaringan',
    icon: '🌐',
    description: 'Master, agent, client',
  },
  {
    key: 'invoice',
    label: 'Invoice',
    icon: '🧾',
    description: 'Tagihan & pembayaran',
  },
  {
    key: 'timeline',
    label: 'Timeline',
    icon: '🕒',
    description: 'Activity log sistem',
  },
  {
    key: 'settings',
    label: 'Setting',
    icon: '⚙️',
    description: 'PS, fee, rules',
  },
]

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export default function AdminShell({
  activeMenu,
  onMenuChange,
  children,
  adminName = 'TERNAKSUKSES Admin',
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('ts_admin_sidebar_width')
    const parsed = saved ? Number(saved) : 280
    return Number.isFinite(parsed) ? clamp(parsed, 72, 420) : 280
  })

  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('ts_admin_sidebar_collapsed') === 'true'
  })

  const draggingRef = useRef(false)

  useEffect(() => {
    localStorage.setItem('ts_admin_sidebar_width', String(sidebarWidth))
  }, [sidebarWidth])

  useEffect(() => {
    localStorage.setItem('ts_admin_sidebar_collapsed', String(collapsed))
  }, [collapsed])

  useEffect(() => {
    function onMouseMove(event) {
      if (!draggingRef.current || collapsed) return

      const nextWidth = clamp(event.clientX, 220, 420)
      setSidebarWidth(nextWidth)
    }

    function onMouseUp() {
      draggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [collapsed])

  const actualSidebarWidth = collapsed ? 76 : sidebarWidth

  const activeItem =
    MENU_ITEMS.find((item) => item.key === activeMenu) || MENU_ITEMS[0]

  const styles = {
    shell: {
      minHeight: '100vh',
      display: 'grid',
      gridTemplateColumns: `${actualSidebarWidth}px minmax(0, 1fr)`,
      background:
        'radial-gradient(circle at top left, rgba(20, 184, 166, 0.16), transparent 34%), #020617',
      color: '#e5e7eb',
    },
    sidebar: {
      position: 'sticky',
      top: 0,
      height: '100vh',
      background: 'rgba(2, 6, 23, 0.96)',
      borderRight: '1px solid rgba(148, 163, 184, 0.16)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      zIndex: 20,
    },
    sidebarTop: {
      padding: collapsed ? '18px 12px' : '20px 18px',
      borderBottom: '1px solid rgba(148, 163, 184, 0.14)',
    },
    brandRow: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    },
    brandMark: {
      width: 46,
      height: 46,
      borderRadius: 14,
      background: 'rgba(15, 23, 42, 0.9)',
      border: '1px solid rgba(251, 191, 36, 0.35)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      flexShrink: 0,
    },
    brandLogo: {
      width: '100%',
      height: '100%',
      objectFit: 'contain',
      padding: 5,
      boxSizing: 'border-box',
    },
    brandText: {
      minWidth: 0,
      display: collapsed ? 'none' : 'block',
    },
    brandTitle: {
      margin: 0,
      fontSize: 15,
      fontWeight: 900,
      letterSpacing: '-0.02em',
      color: '#f8fafc',
      whiteSpace: 'nowrap',
    },
    brandSub: {
      margin: '4px 0 0',
      fontSize: 12,
      color: '#94a3b8',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    collapseButton: {
      marginTop: 14,
      width: '100%',
      border: '1px solid rgba(148, 163, 184, 0.18)',
      background: 'rgba(15, 23, 42, 0.86)',
      color: '#cbd5e1',
      padding: collapsed ? '10px 0' : '10px 12px',
      borderRadius: 12,
      cursor: 'pointer',
      fontWeight: 800,
    },
    nav: {
      padding: collapsed ? '12px 8px' : '14px 12px',
      display: 'grid',
      gap: 8,
      overflowY: 'auto',
      flex: 1,
    },
    navButton: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      border: '1px solid transparent',
      background: 'transparent',
      color: '#cbd5e1',
      padding: collapsed ? '12px 0' : '12px 12px',
      borderRadius: 14,
      cursor: 'pointer',
      textAlign: 'left',
      justifyContent: collapsed ? 'center' : 'flex-start',
    },
    navButtonActive: {
      background:
        'linear-gradient(135deg, rgba(20, 184, 166, 0.22), rgba(251, 191, 36, 0.13))',
      border: '1px solid rgba(45, 212, 191, 0.24)',
      color: '#f8fafc',
      boxShadow: '0 12px 26px rgba(0,0,0,0.24)',
    },
    navIcon: {
      width: 28,
      height: 28,
      borderRadius: 10,
      background: 'rgba(148, 163, 184, 0.10)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    navText: {
      display: collapsed ? 'none' : 'block',
      minWidth: 0,
    },
    navLabel: {
      fontSize: 14,
      fontWeight: 850,
      whiteSpace: 'nowrap',
    },
    navDesc: {
      marginTop: 2,
      fontSize: 11,
      color: '#94a3b8',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    resizeHandle: {
      position: 'absolute',
      top: 0,
      right: -4,
      width: 8,
      height: '100%',
      cursor: collapsed ? 'default' : 'col-resize',
      background: 'transparent',
    },
    sidebarFooter: {
      padding: collapsed ? '12px 8px' : '14px 14px',
      borderTop: '1px solid rgba(148, 163, 184, 0.14)',
      color: '#94a3b8',
      fontSize: 12,
      display: collapsed ? 'none' : 'block',
    },
    main: {
      minWidth: 0,
      height: '100vh',
      overflowY: 'auto',
    },
    topbar: {
      position: 'sticky',
      top: 0,
      zIndex: 10,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 16,
      padding: '18px 24px',
      background: 'rgba(2, 6, 23, 0.82)',
      borderBottom: '1px solid rgba(148, 163, 184, 0.14)',
      backdropFilter: 'blur(14px)',
    },
    pageTitle: {
      margin: 0,
      fontSize: 24,
      fontWeight: 900,
      letterSpacing: '-0.03em',
      color: '#f8fafc',
    },
    pageSub: {
      margin: '4px 0 0',
      color: '#94a3b8',
      fontSize: 13,
    },
    adminBadge: {
      padding: '10px 12px',
      borderRadius: 999,
      background: 'rgba(15, 23, 42, 0.92)',
      border: '1px solid rgba(148, 163, 184, 0.18)',
      color: '#cbd5e1',
      fontSize: 13,
      whiteSpace: 'nowrap',
    },
    content: {
      padding: '22px 24px 40px',
      maxWidth: 'none',
      width: '100%',
      boxSizing: 'border-box',
    },
  }

  return (
    <div style={styles.shell}>
      <aside style={styles.sidebar}>
        <div style={styles.sidebarTop}>
          <div style={styles.brandRow}>
            <div style={styles.brandMark}>
              <img
                src="/logo-ternaksukses.png"
                alt="TERNAKSUKSES"
                style={styles.brandLogo}
              />
            </div>

            <div style={styles.brandText}>
              <h1 style={styles.brandTitle}>TERNAKSUKSES</h1>
              <p style={styles.brandSub}>Ecosystem Admin</p>
            </div>
          </div>

          <button
            type="button"
            style={styles.collapseButton}
            onClick={() => setCollapsed((prev) => !prev)}
            title={collapsed ? 'Lebarkan sidebar' : 'Kecilkan sidebar'}
          >
            {collapsed ? '»' : '« Kecilkan Menu'}
          </button>
        </div>

        <nav style={styles.nav}>
          {MENU_ITEMS.map((item) => {
            const isActive = item.key === activeMenu

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onMenuChange(item.key)}
                style={{
                  ...styles.navButton,
                  ...(isActive ? styles.navButtonActive : null),
                }}
                title={collapsed ? item.label : undefined}
              >
                <span style={styles.navIcon}>{item.icon}</span>

                <span style={styles.navText}>
                  <div style={styles.navLabel}>{item.label}</div>
                  <div style={styles.navDesc}>{item.description}</div>
                </span>
              </button>
            )
          })}
        </nav>

        <div style={styles.sidebarFooter}>
          Drag garis kanan menu untuk lebar/sempitkan.
        </div>

        <div
          style={styles.resizeHandle}
          onMouseDown={() => {
            if (collapsed) return
            draggingRef.current = true
            document.body.style.cursor = 'col-resize'
            document.body.style.userSelect = 'none'
          }}
        />
      </aside>

      <main style={styles.main}>
        <header style={styles.topbar}>
          <div>
            <h2 style={styles.pageTitle}>{activeItem.label}</h2>
            <p style={styles.pageSub}>{activeItem.description}</p>
          </div>

          <div style={styles.adminBadge}>{adminName}</div>
        </header>

        <div style={styles.content}>{children}</div>
      </main>
    </div>
  )
}
