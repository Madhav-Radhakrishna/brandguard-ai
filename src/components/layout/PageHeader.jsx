// components/layout/PageHeader.jsx
// Page title on the left, optional primary action on the right.
// Followed by a 1px full-width divider line.
export default function PageHeader({ title, action }) {
  return (
    <div>
      <div className="flex items-center justify-between px-8 pt-8 pb-5">
        <h1 className="text-[30px] font-semibold tracking-tight leading-none text-fg">
          {title}
        </h1>
        {action && <div>{action}</div>}
      </div>
      <div className="h-px bg-border" />
    </div>
  )
}
