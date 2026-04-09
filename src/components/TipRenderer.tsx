export function TipRenderer({ html }: { html: string }) {
  return (
    <div
      className="tip-body"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
