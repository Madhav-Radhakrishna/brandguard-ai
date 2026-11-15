// pages/SubmitPage.jsx – Stage 8: Text + DOCX + PDF upload
// Employee can type content OR upload a .docx / .pdf file.
// File text is extracted client-side (mammoth for DOCX, pdfjs-dist for PDF).
// Extracted text is sent to /api/audit with correct source tag.
import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AppLayout from '../components/layout/AppLayout'
import PageHeader from '../components/layout/PageHeader'
import Button from '../components/ui/Button'
import LoadingBar from '../components/ui/LoadingBar'

const MAX_CHARS = 5000

// ── DOCX extraction via mammoth ───────────────────────────────────────────────
async function extractDocx(file) {
  const mammoth = await import('mammoth')
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return result.value.trim()
}

// ── PDF extraction via pdfjs-dist ─────────────────────────────────────────────
async function extractPdf(file) {
  const pdfjsLib = await import('pdfjs-dist')
  // Use the CDN worker to avoid complex bundler setup
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const textParts = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items.map(item => item.str).join(' ')
    textParts.push(pageText)
  }

  return textParts.join('\n\n').trim()
}

// ── Tab pill ──────────────────────────────────────────────────────────────────
function TabPill({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-xs font-mono uppercase tracking-widest border transition-colors ${
        active
          ? 'border-accent bg-accent/10 text-fg'
          : 'border-border text-muted hover:border-fg hover:text-fg'
      }`}
    >
      {children}
    </button>
  )
}

export default function SubmitPage() {
  const navigate  = useNavigate()
  const fileRef   = useRef(null)

  const [mode,     setMode]     = useState('text')   // 'text' | 'file'
  const [text,     setText]     = useState('')
  const [file,     setFile]     = useState(null)      // File object
  const [fileName, setFileName] = useState('')
  const [preview,  setPreview]  = useState('')        // extracted text preview
  const [extracting, setExtracting] = useState(false)
  const [extractErr, setExtractErr] = useState('')
  const [error,    setError]    = useState('')
  const [auditing, setAuditing] = useState(false)

  const activeText   = mode === 'text' ? text : preview
  const remaining    = MAX_CHARS - activeText.length
  const overLimit    = remaining < 0

  // ── File picker handler ───────────────────────────────────────────────────
  async function handleFileChange(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setFileName(f.name)
    setExtractErr('')
    setPreview('')
    setExtracting(true)

    try {
      let extracted = ''
      const ext = f.name.split('.').pop().toLowerCase()

      if (ext === 'docx') {
        extracted = await extractDocx(f)
      } else if (ext === 'pdf') {
        extracted = await extractPdf(f)
      } else {
        throw new Error('Only .docx and .pdf files are supported.')
      }

      if (!extracted) throw new Error('Could not extract text from this file. It may be image-based (scanned).')
      if (extracted.length > MAX_CHARS) {
        setExtractErr(`File contains ${extracted.length.toLocaleString()} characters — truncated to ${MAX_CHARS.toLocaleString()}.`)
        setPreview(extracted.slice(0, MAX_CHARS))
      } else {
        setPreview(extracted)
      }
    } catch (err) {
      setExtractErr(err.message)
      setFile(null)
      setFileName('')
    } finally {
      setExtracting(false)
    }
  }

  // ── Audit handler ─────────────────────────────────────────────────────────
  async function handleAudit() {
    setError('')
    const content = mode === 'text' ? text.trim() : preview.trim()
    if (!content) { setError('Please enter or upload some content to audit.'); return }
    if (overLimit) { setError(`Text must be under ${MAX_CHARS} characters.`); return }

    const source = mode === 'file'
      ? (fileName.endsWith('.pdf') ? 'pdf' : 'docx')
      : 'typed'

    setAuditing(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 35000)

      let res
      try {
        res = await fetch('/api/audit', {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            text:     content,
            source,
            filename: fileName || undefined,
          }),
        })
      } finally {
        clearTimeout(timer)
      }

      const json = await res.json()
      if (!res.ok) { setError(json.error || `Audit failed (${res.status}). Please try again.`); return }
      navigate(`/submissions/${json.submissionId}`)
    } catch (e) {
      if (e.name === 'AbortError') {
        setError('Audit timed out (>35s). The Gemini API may be slow — please try again.')
      } else {
        setError(`Error: ${e.message}`)
      }
    } finally {
      setAuditing(false)
    }
  }

  return (
    <AppLayout>
      {(auditing || extracting) && <LoadingBar />}
      <PageHeader title="Submit Content" />

      <div className="px-8 py-8 max-w-3xl">
        {/* Instructions */}
        <p className="text-muted text-sm mb-6">
          Type your content directly, or upload a <strong className="text-fg">.docx</strong> or{' '}
          <strong className="text-fg">.pdf</strong> file. The audit flags brand violations before publication.
        </p>

        {/* Mode tabs */}
        <div className="flex gap-2 mb-6">
          <TabPill active={mode === 'text'} onClick={() => { setMode('text'); setError('') }}>
            ✏ Type Content
          </TabPill>
          <TabPill active={mode === 'file'} onClick={() => { setMode('file'); setError('') }}>
            📄 Upload File
          </TabPill>
        </div>

        {/* ── TEXT MODE ── */}
        {mode === 'text' && (
          <div className="flex flex-col gap-1.5 mb-2">
            <label htmlFor="content" className="text-xs font-mono uppercase tracking-widest text-muted">
              Content
            </label>
            <textarea
              id="content"
              value={text}
              onChange={e => { setText(e.target.value); setError('') }}
              rows={14}
              placeholder="Type or paste your content here…"
              disabled={auditing}
              className={`
                w-full bg-surface border text-fg text-sm px-4 py-3
                focus:outline-none focus:border-accent placeholder:text-muted
                resize-y leading-relaxed
                ${overLimit ? 'border-accent' : 'border-border'}
                ${auditing  ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            />
          </div>
        )}

        {/* ── FILE MODE ── */}
        {mode === 'file' && (
          <div className="mb-2">
            {/* Drop zone */}
            <div
              onClick={() => !extracting && fileRef.current?.click()}
              className={`
                border-2 border-dashed rounded px-6 py-10 text-center cursor-pointer transition-colors
                ${extracting ? 'border-border opacity-50 cursor-not-allowed' : 'border-border hover:border-accent hover:bg-accent/5'}
              `}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".docx,.pdf"
                className="hidden"
                onChange={handleFileChange}
                disabled={extracting}
              />
              {extracting ? (
                <p className="text-muted text-sm font-mono">Extracting text…</p>
              ) : fileName ? (
                <div>
                  <p className="text-fg text-sm font-medium mb-1">📄 {fileName}</p>
                  <p className="text-muted text-xs">Click to replace</p>
                </div>
              ) : (
                <div>
                  <p className="text-fg text-sm mb-2">Click to upload a <strong>.docx</strong> or <strong>.pdf</strong> file</p>
                  <p className="text-muted text-xs">Max {MAX_CHARS.toLocaleString()} characters of extracted text</p>
                </div>
              )}
            </div>

            {/* Extraction error */}
            {extractErr && (
              <p className="text-accent text-xs mt-2">⚠ {extractErr}</p>
            )}

            {/* Text preview */}
            {preview && (
              <div className="mt-4">
                <p className="text-xs font-mono uppercase tracking-widest text-muted mb-2">
                  Extracted Text Preview
                </p>
                <div className="bg-surface border border-border p-4 max-h-64 overflow-y-auto text-sm text-fg leading-relaxed whitespace-pre-wrap">
                  {preview}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Character counter */}
        {activeText.length > 0 && (
          <div className="flex justify-between items-center mb-6 mt-2">
            <span className={`text-xs font-mono ${overLimit ? 'text-accent' : 'text-muted'}`}>
              {remaining < 0
                ? `${Math.abs(remaining)} characters over limit`
                : `${remaining.toLocaleString()} characters remaining`}
            </span>
            <span className="text-xs text-muted font-mono">{activeText.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}</span>
          </div>
        )}

        {/* Error */}
        {error && <p className="text-sm text-accent mb-4">⚠ {error}</p>}

        {/* Auditing indicator */}
        {auditing && (
          <p className="text-sm text-muted mb-4 font-mono uppercase tracking-widest animate-pulse">
            Auditing…
          </p>
        )}

        {/* Submit */}
        <Button
          onClick={handleAudit}
          disabled={auditing || overLimit || !activeText.trim() || extracting}
          size="lg"
        >
          {auditing ? 'Auditing…' : 'Run Audit'}
        </Button>
      </div>
    </AppLayout>
  )
}
