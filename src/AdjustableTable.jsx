import { useEffect, useMemo, useRef, useState } from 'react'

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function getDefaultWidths(columns) {
  const result = {}

  for (const column of columns || []) {
    result[column.key] = column.width || 160
  }

  return result
}

function loadSavedWidths(storageKey, defaultWidths) {
  try {
    const saved = localStorage.getItem(`${storageKey}_widths`)
    if (!saved) return defaultWidths

    return {
      ...defaultWidths,
      ...JSON.parse(saved),
    }
  } catch {
    return defaultWidths
  }
}

export default function AdjustableTable({
  title,
  subtitle,
  storageKey,
  columns = [],
  rows = [],
  getRowKey,
  loading = false,
  emptyText = 'Tidak ada data.',
}) {
  const defaultWidths = useMemo(
    () => getDefaultWidths(columns),
    [columns]
  )

  const [columnWidths, setColumnWidths] = useState(() =>
    loadSavedWidths(storageKey, getDefaultWidths(columns))
  )

  const [fontSize, setFontSize] = useState(() => {
    const saved = Number(
      localStorage.getItem(`${storageKey}_font_size`) || 13
    )

    return Number.isFinite(saved)
      ? clamp(saved, 11, 17)
      : 13
  })

  const resizingRef = useRef(null)

  const totalTableWidth = useMemo(() => {
    return Object.values(columnWidths).reduce(
      (sum, width) => sum + Number(width || 0),
      0
    )
  }, [columnWidths])

  useEffect(() => {
    setColumnWidths((current) => ({
      ...defaultWidths,
      ...current,
    }))
  }, [defaultWidths])

  useEffect(() => {
    localStorage.setItem(
      `${storageKey}_widths`,
      JSON.stringify(columnWidths)
    )
  }, [storageKey, columnWidths])

  useEffect(() => {
    localStorage.setItem(
      `${storageKey}_font_size`,
      String(fontSize)
    )
  }, [storageKey, fontSize])

  useEffect(() => {
    function handleMouseMove(event) {
      if (!resizingRef.current) return

      const {
        key,
        startX,
        startWidth,
        minWidth,
        maxWidth,
      } = resizingRef.current

      const diff = event.clientX - startX
      const nextWidth = clamp(
        startWidth + diff,
        minWidth || 70,
        maxWidth || 700
      )

      setColumnWidths((current) => ({
        ...current,
        [key]: nextWidth,
      }))
    }

    function handleMouseUp() {
      resizingRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  function startResize(column, event) {
    event.preventDefault()
    event.stopPropagation()

    resizingRef.current = {
      key: column.key,
      startX: event.clientX,
      startWidth: columnWidths[column.key] || column.width || 160,
      minWidth: column.minWidth || 70,
      maxWidth: column.maxWidth || 700,
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  function resetTable() {
    setColumnWidths(defaultWidths)
    setFontSize(13)
  }

  const styles = {
    section: {
      padding: 18,
      borderRadius: 18,
      background: 'rgba(15, 23, 42, 0.92)',
      border: '1px solid rgba(148, 163, 184, 0.18)',
      color: '#e5e7eb',
    },
    head: {
      display: 'flex',
      justifyContent: 'space-between',
      gap: 14,
      alignItems: 'flex-start',
      marginBottom: 14,
      flexWrap: 'wrap',
    },
    title: {
      margin: '0 0 6px',
      fontSize: 18,
      fontWeight: 900,
    },
    subtitle: {
      margin: 0,
      color: '#94a3b8',
      fontSize: 13,
      lineHeight: 1.5,
    },
    controls: {
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap',
    },
    smallButton: {
      border: '1px solid rgba(148, 163, 184, 0.22)',
      background: 'rgba(2, 6, 23, 0.55)',
      color: '#cbd5e1',
      padding: '8px 10px',
      borderRadius: 10,
      cursor: 'pointer',
      fontWeight: 800,
      fontSize: 12,
    },
    tableWrap: {
      overflowX: 'auto',
      borderRadius: 14,
      border: '1px solid rgba(148, 163, 184, 0.16)',
      maxWidth: '100%',
    },
    table: {
      width: totalTableWidth,
      minWidth: totalTableWidth,
      tableLayout: 'fixed',
      borderCollapse: 'collapse',
      fontSize,
    },
    th: {
      position: 'relative',
      textAlign: 'left',
      padding: '12px 12px',
      paddingRight: 18,
      background: 'rgba(2, 6, 23, 0.72)',
      color: '#cbd5e1',
      borderBottom: '1px solid rgba(148, 163, 184, 0.16)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    resizeHandle: {
      position: 'absolute',
      top: 0,
      right: 0,
      width: 8,
      height: '100%',
      cursor: 'col-resize',
      userSelect: 'none',
      touchAction: 'none',
      borderRight: '1px solid rgba(251, 191, 36, 0.18)',
    },
    td: {
      padding: '12px 12px',
      borderBottom: '1px solid rgba(148, 163, 184, 0.10)',
      color: '#e5e7eb',
      verticalAlign: 'top',
      whiteSpace: 'normal',
      wordBreak: 'break-word',
      overflowWrap: 'anywhere',
      lineHeight: 1.45,
    },
    empty: {
      padding: 18,
      color: '#94a3b8',
      textAlign: 'center',
    },
    hint: {
      marginTop: 10,
      color: '#94a3b8',
      fontSize: 12,
      lineHeight: 1.5,
    },
  }

  return (
    <section style={styles.section}>
      <div style={styles.head}>
        <div>
          {title && (
            <h3 style={styles.title}>{title}</h3>
          )}

          {subtitle && (
            <p style={styles.subtitle}>{subtitle}</p>
          )}
        </div>

        <div style={styles.controls}>
          <button
            type="button"
            style={styles.smallButton}
            onClick={() =>
              setFontSize((prev) => clamp(prev - 1, 11, 17))
            }
          >
            A-
          </button>

          <button
            type="button"
            style={styles.smallButton}
            onClick={() =>
              setFontSize((prev) => clamp(prev + 1, 11, 17))
            }
          >
            A+
          </button>

          <button
            type="button"
            style={styles.smallButton}
            onClick={resetTable}
          >
            Reset Table
          </button>
        </div>
      </div>

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              {columns.map((column) => {
                const width =
                  columnWidths[column.key] ||
                  column.width ||
                  160

                return (
                  <th
                    key={column.key}
                    style={{
                      ...styles.th,
                      width,
                      minWidth: width,
                      maxWidth: width,
                    }}
                  >
                    {column.label}

                    <span
                      style={styles.resizeHandle}
                      onMouseDown={(event) =>
                        startResize(column, event)
                      }
                      title="Drag untuk ubah lebar kolom"
                    />
                  </th>
                )
              })}
            </tr>
          </thead>

          <tbody>
            {!loading &&
              rows.map((row, index) => (
                <tr
                  key={
                    getRowKey
                      ? getRowKey(row, index)
                      : row.id || index
                  }
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      style={{
                        ...styles.td,
                        ...(column.cellStyle || null),
                      }}
                    >
                      {column.render
                        ? column.render(row, index)
                        : row[column.key] ?? '-'}
                    </td>
                  ))}
                </tr>
              ))}

            {!loading && rows.length === 0 && (
              <tr>
                <td
                  style={styles.empty}
                  colSpan={columns.length}
                >
                  {emptyText}
                </td>
              </tr>
            )}

            {loading && (
              <tr>
                <td
                  style={styles.empty}
                  colSpan={columns.length}
                >
                  Loading...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={styles.hint}>
        Tips: drag garis kanan header kolom untuk ubah lebar.
        Tombol A-/A+ untuk ubah ukuran tulisan.
      </div>
    </section>
  )
}
