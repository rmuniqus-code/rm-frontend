'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import styled from 'styled-components'
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, X, Loader2 } from 'lucide-react'
import { apiUrl, apiAuthHeader } from '@/lib/api'

/* ── Types ─────────────────────────────────────────────────── */

export interface UploadResult {
  uploadId: string
  fileType: string
  totalRows: number
  successCount: number
  errorCount: number
  errors: { row: number; field: string; message: string }[]
  duration: string
  weekRange?: { from: string; to: string }
}

interface ImportModalProps {
  open: boolean
  onClose: () => void
  onComplete?: (result: UploadResult) => void
}

/* ── Styled ────────────────────────────────────────────────── */

const Overlay = styled.div<{ $open: boolean }>`
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: ${p => (p.$open ? 'flex' : 'none')};
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  animation: fadeIn 0.15s ease-out;

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
`

const Dialog = styled.div`
  background: var(--color-bg-card);
  border-radius: var(--border-radius-lg);
  box-shadow: var(--shadow-lg);
  width: 560px;
  max-width: 95vw;
  max-height: 85vh;
  overflow-y: auto;
  animation: slideUp 0.2s ease-out;

  @keyframes slideUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }
`

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);

  h2 {
    font-size: 18px;
    font-weight: 700;
    color: var(--color-text);
  }

  p {
    font-size: 13px;
    color: var(--color-text-secondary);
    margin-top: 2px;
  }
`

const CloseBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--border-radius);
  color: var(--color-text-secondary);
  &:hover {
    background: var(--color-bg);
    color: var(--color-text);
  }
`

const Body = styled.div`
  padding: 24px;
`

const DropZone = styled.div<{ $active: boolean; $hasFile: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px 24px;
  border: 2px dashed ${p =>
    p.$active ? 'var(--color-primary)' :
    p.$hasFile ? 'var(--color-success)' :
    'var(--color-border)'
  };
  border-radius: var(--border-radius-lg);
  background: ${p =>
    p.$active ? 'var(--color-primary-light)' :
    p.$hasFile ? 'rgba(34,197,94,0.04)' :
    'var(--color-bg)'
  };
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover {
    border-color: var(--color-primary);
    background: var(--color-primary-light);
  }
`

const DropIcon = styled.div<{ $hasFile: boolean }>`
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${p => p.$hasFile ? 'rgba(34,197,94,0.1)' : 'var(--color-primary-light)'};
  color: ${p => p.$hasFile ? 'var(--color-success)' : 'var(--color-primary)'};
`

const DropText = styled.div`
  text-align: center;

  strong {
    display: block;
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text);
    margin-bottom: 4px;
  }

  span {
    font-size: 12px;
    color: var(--color-text-secondary);
  }
`

const RemoveBtn = styled.button`
  color: var(--color-text-secondary);
  &:hover { color: var(--color-danger); }
`

const OptionRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;

  label {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text);
  }
`

const Select = styled.select`
  padding: 6px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  background: var(--color-bg-card);
  color: var(--color-text);
  font-size: 13px;

  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }
`

const Footer = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 24px;
  border-top: 1px solid var(--color-border);
`

const Btn = styled.button<{ $variant?: 'primary' | 'ghost' }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  border-radius: var(--border-radius);
  font-size: 13px;
  font-weight: 500;
  transition: all var(--transition-fast);

  ${p =>
    p.$variant === 'primary'
      ? `
    background: var(--color-primary);
    color: #fff;
    &:hover:not(:disabled) { background: var(--color-primary-hover); }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
  `
      : `
    border: 1px solid var(--color-border);
    background: var(--color-bg-card);
    color: var(--color-text-secondary);
    &:hover { border-color: var(--color-primary); color: var(--color-primary); }
  `}
`

const StatusText = styled.p<{ $type: 'uploading' | 'success' | 'error' }>`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  font-size: 13px;
  font-weight: 500;
  color: ${p =>
    p.$type === 'success' ? 'var(--color-success)' :
    p.$type === 'error' ? 'var(--color-danger)' :
    'var(--color-primary)'};
`

const ResultCard = styled.div`
  margin-top: 16px;
  padding: 16px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
`

const ResultGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
`

const ResultStat = styled.div`
  text-align: center;

  span {
    display: block;
    font-size: 20px;
    font-weight: 700;
  }

  label {
    font-size: 11px;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
`

const Spinner = styled(Loader2)`
  animation: spin 1s linear infinite;
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`

/* ── Helpers ───────────────────────────────────────────────── */

const ALLOWED = ['.xlsx', '.xls', '.csv']
const MAX_SIZE = 10 * 1024 * 1024

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface FileEntry {
  id: string
  file: File
  status: 'queued' | 'uploading' | 'done' | 'error'
  progress: number
  result?: UploadResult
  error?: string
}

/* ── Component ─────────────────────────────────────────────── */

export default function ImportModal({ open, onClose, onComplete }: ImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const xhrRef = useRef<XMLHttpRequest | null>(null)
  const [files, setFiles] = useState<FileEntry[]>([])
  const [period, setPeriod] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'processing' | 'done'>('idle')
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const allDone = files.length > 0 && files.every(f => f.status === 'done' || f.status === 'error')

  // Elapsed time counter
  useEffect(() => {
    if (uploading) {
      const start = Date.now()
      timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    } else if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [uploading])

  const formatElapsed = (s: number) => {
    if (s < 60) return `${s}s`
    return `${Math.floor(s / 60)}m ${s % 60}s`
  }

  const reset = useCallback(() => {
    setFiles([])
    setPeriod('')
    setPhase('idle')
    setGlobalError(null)
    setElapsed(0)
    setCurrentIdx(0)
  }, [])

  const handleCancelUpload = () => {
    if (xhrRef.current) {
      xhrRef.current.abort()
      xhrRef.current = null
    }
  }

  const handleClose = () => {
    if (uploading) return
    reset()
    onClose()
  }

  const validateFile = (f: File): string | null => {
    const ext = '.' + f.name.split('.').pop()?.toLowerCase()
    if (!ALLOWED.includes(ext)) return `Invalid file type "${ext}". Allowed: ${ALLOWED.join(', ')}`
    if (f.size > MAX_SIZE) return `File too large (${formatBytes(f.size)}). Max: 10 MB`
    return null
  }

  const addFiles = (incoming: File[]) => {
    const toAdd: FileEntry[] = []
    const errs: string[] = []
    for (const f of incoming) {
      const err = validateFile(f)
      if (err) { errs.push(err); continue }
      // Skip duplicates (same name + size)
      const isDup = files.some(e => e.file.name === f.name && e.file.size === f.size)
      if (isDup) continue
      toAdd.push({ id: `${f.name}-${Date.now()}-${Math.random()}`, file: f, status: 'queued', progress: 0 })
    }
    if (errs.length) setGlobalError(errs.join(' | '))
    else setGlobalError(null)
    setFiles(prev => [...prev, ...toAdd])
  }

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(e => e.id !== id))
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    addFiles(Array.from(e.dataTransfer.files))
  }

  const uploadSingle = (entry: FileEntry, authHeader: Record<string, string>): Promise<UploadResult> => {
    return new Promise((resolve, reject) => {
      const formData = new FormData()
      formData.append('file', entry.file)
      if (period) formData.append('period', period)

      const xhr = new XMLHttpRequest()
      xhrRef.current = xhr

      xhr.upload.addEventListener('progress', (ev) => {
        if (ev.lengthComputable) {
          const pct = Math.round((ev.loaded / ev.total) * 70)
          setFiles(prev => prev.map(f => f.id === entry.id ? { ...f, progress: pct } : f))
        }
      })

      xhr.upload.addEventListener('load', () => {
        setPhase('processing')
        setFiles(prev => prev.map(f => f.id === entry.id ? { ...f, progress: 75 } : f))
      })

      xhr.addEventListener('load', () => {
        try {
          const json = JSON.parse(xhr.responseText)
          if (xhr.status >= 400) reject(new Error(json.error || `Upload failed (${xhr.status})`))
          else {
            setFiles(prev => prev.map(f => f.id === entry.id ? { ...f, progress: 100 } : f))
            resolve(json as UploadResult)
          }
        } catch { reject(new Error('Invalid response from server')) }
      })

      xhr.addEventListener('error', () => reject(new Error('Upload failed — check your connection')))
      xhr.addEventListener('abort', () => reject(new Error('Upload was cancelled')))

      xhr.open('POST', apiUrl('/api/upload'))
      for (const [key, value] of Object.entries(authHeader)) xhr.setRequestHeader(key, value)
      xhr.send(formData)
    })
  }

  const handleUpload = async () => {
    if (files.length === 0) return
    setUploading(true)
    setGlobalError(null)
    setElapsed(0)

    const authHeader = await apiAuthHeader()

    for (let i = 0; i < files.length; i++) {
      const entry = files[i]
      if (entry.status !== 'queued') continue
      setCurrentIdx(i)
      setPhase('uploading')
      setFiles(prev => prev.map(f => f.id === entry.id ? { ...f, status: 'uploading', progress: 0 } : f))

      try {
        const result = await uploadSingle(entry, authHeader)
        setFiles(prev => prev.map(f => f.id === entry.id ? { ...f, status: 'done', result } : f))
        onComplete?.(result)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed'
        if (msg === 'Upload was cancelled') {
          setFiles(prev => prev.map(f => f.id === entry.id ? { ...f, status: 'queued', progress: 0 } : f))
          break
        }
        setFiles(prev => prev.map(f => f.id === entry.id ? { ...f, status: 'error', error: msg } : f))
      }
    }

    xhrRef.current = null
    setUploading(false)
    setPhase('idle')
  }

  const currentFile = files[currentIdx]

  return (
    <Overlay $open={open} onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}>
      <Dialog onClick={e => e.stopPropagation()}>
        <Header>
          <div>
            <h2>Import Data</h2>
            <p>Upload one or more Excel files to ingest resource data</p>
          </div>
          <CloseBtn onClick={handleClose}><X size={18} /></CloseBtn>
        </Header>

        <Body>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            multiple
            hidden
            onChange={e => {
              addFiles(Array.from(e.target.files ?? []))
              e.target.value = ''
            }}
          />

          <DropZone
            $active={dragActive}
            $hasFile={files.length > 0}
            onClick={() => !uploading && fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragActive(true) }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
          >
            <DropIcon $hasFile={files.length > 0}>
              {files.length > 0 ? <FileSpreadsheet size={24} /> : <Upload size={24} />}
            </DropIcon>
            <DropText>
              <strong>{files.length > 0 ? 'Drop more files or click to add' : 'Drop your Excel files here'}</strong>
              <span>Supports .xlsx, .xls, .csv (max 10 MB each) — multiple files allowed</span>
            </DropText>
          </DropZone>

          {/* File queue */}
          {files.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {files.map((entry, idx) => (
                <div
                  key={entry.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    background: 'var(--color-bg)',
                    border: `1px solid ${entry.status === 'error' ? 'var(--color-danger)' : entry.status === 'done' ? 'var(--color-success)' : 'var(--color-border)'}`,
                    borderRadius: 'var(--border-radius)',
                  }}
                >
                  <FileSpreadsheet size={16} style={{ flexShrink: 0, color: entry.status === 'done' ? 'var(--color-success)' : entry.status === 'error' ? 'var(--color-danger)' : 'var(--color-text-secondary)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.file.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{formatBytes(entry.file.size)}</span>
                      {entry.status === 'uploading' && (
                        <>
                          <span>·</span>
                          <span style={{ color: 'var(--color-primary)' }}>{entry.progress}%</span>
                        </>
                      )}
                      {entry.status === 'done' && entry.result && (
                        <>
                          <span>·</span>
                          <span style={{ color: 'var(--color-success)' }}>
                            {entry.result.successCount}/{entry.result.totalRows} rows · {entry.result.fileType?.replace(/_/g, ' ')}
                          </span>
                        </>
                      )}
                      {entry.status === 'error' && (
                        <>
                          <span>·</span>
                          <span style={{ color: 'var(--color-danger)' }}>{entry.error}</span>
                        </>
                      )}
                      {entry.status === 'queued' && (
                        <>
                          <span>·</span>
                          <span>#{idx + 1} in queue</span>
                        </>
                      )}
                    </div>
                    {entry.status === 'uploading' && (
                      <div style={{ marginTop: 4, height: 3, background: 'var(--color-border-light)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${entry.progress}%`, background: 'var(--color-primary)', borderRadius: 2, transition: 'width 0.3s' }} />
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    {entry.status === 'uploading' && <Spinner size={14} style={{ color: 'var(--color-primary)' }} />}
                    {entry.status === 'done' && <CheckCircle size={14} style={{ color: 'var(--color-success)' }} />}
                    {entry.status === 'error' && <AlertCircle size={14} style={{ color: 'var(--color-danger)' }} />}
                    {!uploading && (entry.status === 'queued' || entry.status === 'error') && (
                      <RemoveBtn onClick={() => removeFile(entry.id)}><X size={14} /></RemoveBtn>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <OptionRow>
            <label>Period override (optional):</label>
            <Select value={period} onChange={e => setPeriod(e.target.value)} disabled={uploading}>
              <option value="">Auto-detect from file</option>
              <option value="Jan'2026">Jan 2026</option>
              <option value="Feb'2026">Feb 2026</option>
              <option value="Mar'2026">Mar 2026</option>
              <option value="Apr'2026">Apr 2026</option>
              <option value="May'2026">May 2026</option>
              <option value="Jun'2026">Jun 2026</option>
              <option value="Jul'2026">Jul 2026</option>
              <option value="Aug'2026">Aug 2026</option>
              <option value="Sep'2026">Sep 2026</option>
              <option value="Oct'2026">Oct 2026</option>
              <option value="Nov'2026">Nov 2026</option>
              <option value="Dec'2026">Dec 2026</option>
            </Select>
          </OptionRow>

          {uploading && (
            <>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 16,
                padding: '10px 14px',
                background: 'var(--color-bg)',
                borderRadius: 'var(--border-radius)',
                border: '1px solid var(--color-border)',
              }}>
                <Spinner size={16} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>
                    {phase === 'uploading' && `Uploading file ${currentIdx + 1} of ${files.length}: "${currentFile?.file.name}"`}
                    {phase === 'processing' && `Processing file ${currentIdx + 1} of ${files.length}…`}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                    {phase === 'uploading' && `Sending ${currentFile ? formatBytes(currentFile.file.size) : ''} to server…`}
                    {phase === 'processing' && 'Parsing rows, validating fields, writing to database…'}
                  </div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                  {formatElapsed(elapsed)}
                </div>
              </div>
            </>
          )}

          {globalError && (
            <StatusText $type="error">
              <AlertCircle size={14} /> {globalError}
            </StatusText>
          )}

          {allDone && (
            <ResultCard>
              <ResultGrid>
                <ResultStat>
                  <span>{files.length}</span>
                  <label>Files</label>
                </ResultStat>
                <ResultStat>
                  <span style={{ color: 'var(--color-success)' }}>
                    {files.filter(f => f.status === 'done').length}
                  </span>
                  <label>Succeeded</label>
                </ResultStat>
                <ResultStat>
                  <span style={{ color: files.some(f => f.status === 'error') ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
                    {files.filter(f => f.status === 'error').length}
                  </span>
                  <label>Failed</label>
                </ResultStat>
              </ResultGrid>
              <StatusText $type={files.every(f => f.status === 'done') ? 'success' : 'error'}>
                {files.every(f => f.status === 'done')
                  ? <><CheckCircle size={14} /> All files imported successfully</>
                  : <><AlertCircle size={14} /> {files.filter(f => f.status === 'error').length} file(s) failed — see details above</>
                }
              </StatusText>
            </ResultCard>
          )}
        </Body>

        <Footer>
          <Btn $variant="ghost" onClick={uploading ? handleCancelUpload : handleClose}>
            {allDone ? 'Close' : uploading ? 'Cancel Upload' : 'Cancel'}
          </Btn>
          {!allDone && (
            <Btn $variant="primary" onClick={handleUpload} disabled={files.length === 0 || uploading}>
              {uploading
                ? <><Spinner size={14} /> Processing…</>
                : <><Upload size={14} /> Upload {files.length > 1 ? `${files.length} Files` : 'File'}</>
              }
            </Btn>
          )}
          {allDone && (
            <Btn $variant="primary" onClick={handleClose}>Done</Btn>
          )}
        </Footer>
      </Dialog>
    </Overlay>
  )
}
