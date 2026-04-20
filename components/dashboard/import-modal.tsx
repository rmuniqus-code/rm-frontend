'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import styled, { keyframes, css } from 'styled-components'
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, X, Loader2 } from 'lucide-react'

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

const FileInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  margin-top: 16px;

  .file-icon {
    color: var(--color-success);
  }

  .file-detail {
    flex: 1;

    strong {
      display: block;
      font-size: 13px;
      color: var(--color-text);
    }

    span {
      font-size: 11px;
      color: var(--color-text-secondary);
    }
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

const progressShimmer = keyframes`
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(300%); }
`

const ProgressBar = styled.div`
  width: 100%;
  height: 8px;
  background: var(--color-border-light);
  border-radius: 4px;
  margin-top: 16px;
  overflow: hidden;
  position: relative;
`

const indeterminateStyles = css`
  width: 40%;
  transition: none;
  animation: ${progressShimmer} 1.4s ease-in-out infinite;
  background: linear-gradient(
    90deg,
    var(--color-primary) 0%,
    #818cf8 50%,
    var(--color-primary) 100%
  );
`

const ProgressFill = styled.div<{ $pct: number; $indeterminate?: boolean }>`
  height: 100%;
  width: ${p => p.$indeterminate ? '40%' : `${p.$pct}%`};
  background: var(--color-primary);
  border-radius: 4px;
  transition: width 0.4s ease;
  position: relative;
  ${p => p.$indeterminate && indeterminateStyles}
`

const ProgressLabel = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
`

const ProgressPct = styled.span`
  font-size: 12px;
  font-weight: 700;
  color: var(--color-primary);
`

const ProgressPhase = styled.span`
  font-size: 12px;
  color: var(--color-text-secondary);
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

const ErrorList = styled.div`
  max-height: 160px;
  overflow-y: auto;
  font-size: 12px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);

  .error-row {
    display: flex;
    gap: 8px;
    padding: 6px 12px;
    border-bottom: 1px solid var(--color-border-light);
    color: var(--color-danger);

    .row-num {
      font-weight: 600;
      min-width: 50px;
    }
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

/* ── Component ─────────────────────────────────────────────── */

export default function ImportModal({ open, onClose, onComplete }: ImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [period, setPeriod] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'processing' | 'done'>('idle')
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Elapsed time counter — starts when upload begins, stops when done or errored
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
    setFile(null)
    setPeriod('')
    setProgress(0)
    setPhase('idle')
    setResult(null)
    setError(null)
    setElapsed(0)
  }, [])

  const handleClose = () => {
    if (uploading) return            // don't close during upload
    reset()
    onClose()
  }

  const validateFile = (f: File): string | null => {
    const ext = '.' + f.name.split('.').pop()?.toLowerCase()
    if (!ALLOWED.includes(ext)) return `Invalid file type "${ext}". Allowed: ${ALLOWED.join(', ')}`
    if (f.size > MAX_SIZE) return `File too large (${formatBytes(f.size)}). Max: 10 MB`
    return null
  }

  const handleFileSelect = (f: File) => {
    const err = validateFile(f)
    if (err) { setError(err); return }
    setError(null)
    setResult(null)
    setFile(f)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleFileSelect(f)
  }

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setProgress(0)
    setPhase('uploading')
    setError(null)
    setResult(null)

    const formData = new FormData()
    formData.append('file', file)
    if (period) formData.append('period', period)

    try {
      const data = await new Promise<UploadResult>((resolve, reject) => {
        const xhr = new XMLHttpRequest()

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            // Upload portion = 0–70% of progress bar
            const uploadPct = Math.round((e.loaded / e.total) * 70)
            setProgress(uploadPct)
          }
        })

        xhr.upload.addEventListener('load', () => {
          // Upload complete, now server is processing
          setProgress(75)
          setPhase('processing')
        })

        xhr.addEventListener('load', () => {
          try {
            const json = JSON.parse(xhr.responseText)
            if (xhr.status >= 400) {
              reject(new Error(json.error || `Upload failed (${xhr.status})`))
            } else {
              setProgress(100)
              setPhase('done')
              resolve(json as UploadResult)
            }
          } catch {
            reject(new Error('Invalid response from server'))
          }
        })

        xhr.addEventListener('error', () => {
          reject(new Error('Upload failed — check your connection'))
        })

        xhr.addEventListener('abort', () => {
          reject(new Error('Upload was cancelled'))
        })

        xhr.open('POST', '/api/upload')
        xhr.send(formData)
      })

      setResult(data)
      onComplete?.(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed — check your connection')
      setProgress(0)
      setPhase('idle')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Overlay $open={open} onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}>
      <Dialog onClick={e => e.stopPropagation()}>
        <Header>
          <div>
            <h2>Import Data</h2>
            <p>Upload an Excel file to ingest resource data</p>
          </div>
          <CloseBtn onClick={handleClose}><X size={18} /></CloseBtn>
        </Header>

        <Body>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            hidden
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) handleFileSelect(f)
              e.target.value = ''           // allow re-select same file
            }}
          />

          <DropZone
            $active={dragActive}
            $hasFile={!!file}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragActive(true) }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
          >
            <DropIcon $hasFile={!!file}>
              {file ? <FileSpreadsheet size={24} /> : <Upload size={24} />}
            </DropIcon>
            <DropText>
              <strong>{file ? 'File selected — click to change' : 'Drop your Excel file here'}</strong>
              <span>Supports .xlsx, .xls, .csv (max 10 MB)</span>
            </DropText>
          </DropZone>

          {file && (
            <FileInfo>
              <FileSpreadsheet size={20} className="file-icon" />
              <div className="file-detail">
                <strong>{file.name}</strong>
                <span>{formatBytes(file.size)}</span>
              </div>
              {!uploading && !result && (
                <RemoveBtn onClick={() => { setFile(null); setResult(null); setError(null) }}>
                  <X size={16} />
                </RemoveBtn>
              )}
            </FileInfo>
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
              {/* Step indicator */}
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
                    {phase === 'uploading' && `Step 1/3 — Uploading "${file?.name}"`}
                    {phase === 'processing' && `Step 2/3 — Validating & ingesting data`}
                    {phase === 'done' && `Step 3/3 — Finalizing import`}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                    {phase === 'uploading' && `Sending ${file ? formatBytes(file.size) : ''} to server…`}
                    {phase === 'processing' && 'Parsing rows, validating fields, writing to database…'}
                    {phase === 'done' && 'Wrapping up — almost there…'}
                  </div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                  {formatElapsed(elapsed)}
                </div>
              </div>

              <ProgressBar>
                <ProgressFill
                  $pct={progress}
                  $indeterminate={phase === 'processing' || phase === 'done'}
                />
              </ProgressBar>
              <ProgressLabel>
                <ProgressPhase>
                  {phase === 'uploading' && `Uploading… ${progress}%`}
                  {phase === 'processing' && 'Processing on server…'}
                  {phase === 'done' && 'Complete'}
                </ProgressPhase>
                {phase === 'uploading' && (
                  <ProgressPct>{progress}%</ProgressPct>
                )}
              </ProgressLabel>
            </>
          )}

          {error && (
            <StatusText $type="error">
              <AlertCircle size={14} /> {error}
            </StatusText>
          )}

          {result && (
            <ResultCard>
              <ResultGrid>
                <ResultStat>
                  <span>{result.totalRows}</span>
                  <label>Total Rows</label>
                </ResultStat>
                <ResultStat>
                  <span style={{ color: 'var(--color-success)' }}>{result.successCount}</span>
                  <label>Succeeded</label>
                </ResultStat>
                <ResultStat>
                  <span style={{ color: result.errorCount > 0 ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
                    {result.errorCount}
                  </span>
                  <label>Errors</label>
                </ResultStat>
              </ResultGrid>

              <StatusText $type={result.errorCount === result.totalRows ? 'error' : 'success'}>
                {result.errorCount === result.totalRows ? (
                  <><AlertCircle size={14} /> All rows failed — check errors below</>
                ) : (
                  <><CheckCircle size={14} /> Imported {result.successCount} rows in {result.duration}</>
                )}
              </StatusText>

              {result.fileType && (
                <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 8 }}>
                  Detected file type: <strong>{result.fileType.replace(/_/g, ' ')}</strong>
                  {result.weekRange && ` • Weeks: ${result.weekRange.from} → ${result.weekRange.to}`}
                </p>
              )}

              {result.errors.length > 0 && (
                <ErrorList style={{ marginTop: 12 }}>
                  {result.errors.slice(0, 50).map((err, i) => (
                    <div className="error-row" key={i}>
                      <span className="row-num">Row {err.row}</span>
                      <span>{err.field}: {err.message}</span>
                    </div>
                  ))}
                  {result.errors.length > 50 && (
                    <div className="error-row" style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                      … and {result.errors.length - 50} more errors
                    </div>
                  )}
                </ErrorList>
              )}
            </ResultCard>
          )}
        </Body>

        <Footer>
          <Btn $variant="ghost" onClick={handleClose} disabled={uploading}>
            {result ? 'Close' : 'Cancel'}
          </Btn>
          {!result && (
            <Btn $variant="primary" onClick={handleUpload} disabled={!file || uploading}>
              {uploading
                ? <><Spinner size={14} /> {phase === 'uploading' ? `Uploading ${progress}%` : 'Processing…'}</>
                : <><Upload size={14} /> Upload &amp; Import</>
              }
            </Btn>
          )}
          {result && result.errorCount < result.totalRows && (
            <Btn $variant="primary" onClick={handleClose}>
              Done
            </Btn>
          )}
          {result && result.errorCount === result.totalRows && (
            <Btn $variant="ghost" onClick={reset}>
              Try Again
            </Btn>
          )}
        </Footer>
      </Dialog>
    </Overlay>
  )
}
