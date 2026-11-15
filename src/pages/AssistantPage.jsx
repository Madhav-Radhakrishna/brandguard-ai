// pages/AssistantPage.jsx – Stage 6: Brand Assistant chat
// Answers brand-rule questions using Gemini + approved Knowledge Hub rules as context.
import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import AppLayout from '../components/layout/AppLayout'
import PageHeader from '../components/layout/PageHeader'
import Button from '../components/ui/Button'

// ── Suggested starter questions ───────────────────────────────────────────────
const STARTERS = [
  'Can I use the word "cheapest" in a campaign?',
  'What price should I mention for the monthly plan?',
  'Is it okay to use ALL CAPS for emphasis?',
  'What tone should LearnBridge content use?',
  'Give me an example of a compliant call-to-action.',
]

// ── Renders a single chat bubble ──────────────────────────────────────────────
function Bubble({ role, text, isLoading }) {
  const isUser = role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-accent flex-shrink-0 mr-3 mt-0.5 flex items-center justify-center">
          <span className="text-white text-xs font-bold select-none">B</span>
        </div>
      )}
      <div
        className={`max-w-[75%] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words ${
          isUser
            ? 'bg-accent text-white rounded-tl-2xl rounded-bl-2xl rounded-br-2xl'
            : 'bg-surface border border-border text-fg rounded-tr-2xl rounded-bl-2xl rounded-br-2xl'
        }`}
      >
        {isLoading ? (
          <span className="flex items-center gap-1.5 text-muted">
            <Dot delay="0s" /><Dot delay="0.15s" /><Dot delay="0.3s" />
          </span>
        ) : text}
      </div>
      {isUser && (
        <div className="w-7 h-7 rounded-full bg-[#2a2a2a] border border-border flex-shrink-0 ml-3 mt-0.5 flex items-center justify-center">
          <span className="text-muted text-xs font-bold select-none">U</span>
        </div>
      )}
    </div>
  )
}

function Dot({ delay }) {
  return (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full bg-muted animate-bounce"
      style={{ animationDelay: delay, animationDuration: '0.9s' }}
    />
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AssistantPage() {
  const [messages,  setMessages]  = useState([])   // [{role:'user'|'model', text}]
  const [input,     setInput]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const bottomRef  = useRef(null)
  const textareaRef = useRef(null)

  // Auto-scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function sendQuestion(questionText) {
    const q = (questionText || input).trim()
    if (!q || loading) return
    setInput('')
    setError(null)

    // Append user bubble
    const nextMessages = [...messages, { role: 'user', text: q }]
    setMessages(nextMessages)
    setLoading(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/assistant', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          question: q,
          history:  messages.slice(-16), // send up to 16 previous turns
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Unknown error')

      setMessages(prev => [...prev, { role: 'model', text: json.answer }])
    } catch (err) {
      setError(err.message)
      // Keep the user message visible – just show the error below it
    } finally {
      setLoading(false)
      textareaRef.current?.focus()
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendQuestion()
    }
  }

  function clearChat() {
    setMessages([])
    setError(null)
    setInput('')
  }

  const isEmpty = messages.length === 0 && !loading

  return (
    <AppLayout>
      <PageHeader
        title="Brand Assistant"
        action={messages.length > 0 && (
          <button
            onClick={clearChat}
            className="text-xs font-mono uppercase tracking-widest text-muted hover:text-fg transition-colors"
          >
            Clear chat
          </button>
        )}
      />

      {/* Chat area */}
      <div className="flex flex-col h-[calc(100vh-57px)]">

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {isEmpty ? (
            /* ── Empty state: starters ── */
            <div className="max-w-2xl mx-auto">
              <div className="mb-8 text-center">
                <div className="inline-flex w-14 h-14 rounded-full bg-accent/10 border border-accent/30 items-center justify-center mb-4">
                  <span className="text-accent text-2xl font-bold">B</span>
                </div>
                <h2 className="text-fg text-lg font-semibold mb-2">Brand Assistant</h2>
                <p className="text-muted text-sm leading-relaxed">
                  Ask anything about LearnBridge brand guidelines —&nbsp;
                  tone rules, pricing, banned terms, or request a compliant rewrite.
                </p>
              </div>

              <p className="text-xs font-mono uppercase tracking-widest text-muted mb-3">
                Try asking
              </p>
              <div className="flex flex-col gap-2">
                {STARTERS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => sendQuestion(s)}
                    className="text-left px-4 py-3 border border-border text-sm text-fg hover:border-accent hover:bg-accent/5 transition-colors rounded"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto">
              {messages.map((m, i) => (
                <Bubble key={i} role={m.role} text={m.text} />
              ))}
              {loading && <Bubble role="model" isLoading />}
              {error && (
                <div className="mb-4 px-4 py-3 border border-accent/40 bg-accent/5 text-accent text-sm rounded">
                  ⚠ {error}
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input bar */}
        <div className="border-t border-border bg-surface px-6 py-4">
          <div className="max-w-2xl mx-auto flex gap-3 items-end">
            <textarea
              ref={textareaRef}
              rows={2}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about brand guidelines… (Enter to send, Shift+Enter for new line)"
              className="flex-1 resize-none bg-[#141414] border border-border text-fg text-sm placeholder-muted px-3 py-2.5 outline-none focus:border-accent transition-colors rounded"
              disabled={loading}
            />
            <Button
              onClick={() => sendQuestion()}
              disabled={!input.trim() || loading}
              size="md"
            >
              {loading ? 'Sending…' : 'Send'}
            </Button>
          </div>
          <p className="max-w-2xl mx-auto mt-2 text-xs text-muted">
            Answers are grounded in approved brand rules only. Memory cases and pending rules are not included.
          </p>
        </div>

      </div>
    </AppLayout>
  )
}
