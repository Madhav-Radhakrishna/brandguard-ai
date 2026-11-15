// components/rules/RuleModal.jsx
// Add a new rule (mode='add') or create a new version of an existing one (mode='edit').
// INSERT-ONLY: editing creates a new row with the same rule_key, status='draft'.
// Never updates an approved rule's value in place.
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import Button from '../ui/Button'
import Input from '../ui/Input'

const RULE_TYPES = ['banned_term','preferred_term','fact','slogan','approved_claim','guideline']

// Fields shown per rule type
const TYPE_FIELDS = {
  banned_term:    ['keywords', 'replacement'],
  preferred_term: ['keywords', 'replacement'],
  fact:           ['keywords', 'value'],
  slogan:         ['value'],
  approved_claim: ['keywords', 'value'],
  guideline:      [],
}

export default function RuleModal({ mode, existingRule, profile, onClose, onSaved }) {
  const isEdit = mode === 'edit'

  const [form, setForm] = useState({
    rule_key:       existingRule?.rule_key    || '',
    type:           existingRule?.type        || 'banned_term',
    title:          existingRule?.title       || '',
    content:        existingRule?.content     || '',
    value:          existingRule?.value       || '',
    keywords:       existingRule?.keywords?.join(', ') || '',
    replacement:    existingRule?.replacement || '',
    effective_from: new Date().toISOString().slice(0, 10), // today
  })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  function set(field, val) {
    setForm(f => ({ ...f, [field]: val }))
    setErrors(e => ({ ...e, [field]: '' }))
  }

  function validate() {
    const e = {}
    if (!form.title.trim())   e.title   = 'Title is required'
    if (!form.content.trim()) e.content = 'Content / explanation is required'
    if (!form.rule_key.trim()) e.rule_key = 'Rule key is required (e.g. banned_cheapest)'
    if (!/^[a-z0-9_]+$/.test(form.rule_key.trim()))
      e.rule_key = 'Rule key: lowercase letters, numbers and underscores only'
    return e
  }

  async function handleSave() {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setSaving(true)

    // Parse keywords: split by comma, trim, filter empty
    const keywordsArray = form.keywords
      .split(',')
      .map(k => k.trim())
      .filter(Boolean)

    const payload = {
      rule_key:       form.rule_key.trim(),
      type:           form.type,
      title:          form.title.trim(),
      content:        form.content.trim(),
      value:          form.value.trim() || null,
      keywords:       keywordsArray,
      replacement:    form.replacement.trim() || null,
      effective_from: new Date(form.effective_from).toISOString(),
      status:         'draft',   // new rows always start as draft
      created_by:     profile.id,
    }

    const { error } = await supabase.from('brand_rules').insert(payload)
    setSaving(false)
    if (error) { setErrors({ _global: error.message }); return }
    onSaved()
  }

  const extraFields = TYPE_FIELDS[form.type] || []

  return (
    // Full-screen overlay
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-border w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-fg">
            {isEdit ? 'Create New Version' : 'Add Rule'}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-fg text-xl leading-none">×</button>
        </div>

        {/* Body — scrollable */}
        <div className="overflow-y-auto px-6 py-5 flex flex-col gap-5">
          {isEdit && (
            <p className="text-xs text-muted border border-border px-3 py-2">
              This creates a new <span className="text-fg">draft</span> version under the same rule key.
              The existing approved rule stays active until a manager approves the new version.
            </p>
          )}

          {errors._global && (
            <p className="text-xs text-accent">{errors._global}</p>
          )}

          <Input
            label="Rule Key"
            id="rule_key"
            value={form.rule_key}
            onChange={e => set('rule_key', e.target.value)}
            placeholder="e.g. banned_cheapest"
            error={errors.rule_key}
            disabled={isEdit} // key is locked when editing
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-mono uppercase tracking-widest text-muted">Type</label>
            <select
              value={form.type}
              onChange={e => set('type', e.target.value)}
              disabled={isEdit}
              className="bg-surface border border-border text-fg text-sm px-3 py-2 focus:outline-none focus:border-accent disabled:opacity-50"
            >
              {RULE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <Input
            label="Title"
            id="title"
            value={form.title}
            onChange={e => set('title', e.target.value)}
            placeholder="Short human-readable name"
            error={errors.title}
          />

          <Input
            label="Content (explanation)"
            id="content"
            textarea
            rows={3}
            value={form.content}
            onChange={e => set('content', e.target.value)}
            placeholder="Explain what the rule means and why it exists"
            error={errors.content}
          />

          {/* Conditional fields by type */}
          {extraFields.includes('keywords') && (
            <Input
              label="Keywords (comma-separated)"
              id="keywords"
              value={form.keywords}
              onChange={e => set('keywords', e.target.value)}
              placeholder="e.g. cheapest, cheap price"
            />
          )}
          {extraFields.includes('replacement') && (
            <Input
              label="Replacement suggestion"
              id="replacement"
              value={form.replacement}
              onChange={e => set('replacement', e.target.value)}
              placeholder="e.g. affordable learning"
            />
          )}
          {extraFields.includes('value') && (
            <Input
              label="Value (e.g. price, exact slogan)"
              id="value"
              value={form.value}
              onChange={e => set('value', e.target.value)}
              placeholder="e.g. ₹1,199"
            />
          )}

          <Input
            label="Effective from"
            id="effective_from"
            type="date"
            value={form.effective_from}
            onChange={e => set('effective_from', e.target.value)}
          />
        </div>

        {/* Footer */}
        <div className="flex gap-3 justify-end px-6 py-4 border-t border-border">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save as Draft'}
          </Button>
        </div>
      </div>
    </div>
  )
}
