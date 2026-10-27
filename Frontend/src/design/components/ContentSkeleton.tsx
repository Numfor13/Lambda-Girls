export function ContentSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading content" className="grid gap-4">
      <span className="sr-only">Loading content</span>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex animate-pulse flex-col gap-4 rounded-xl bg-white p-6 motion-reduce:animate-none"
        >
          <div className="h-5 w-2/3 rounded-full bg-mint" />
          <div className="h-4 w-full rounded-full bg-cream" />
          <div className="h-4 w-4/5 rounded-full bg-cream" />
          <div className="h-12 w-32 rounded-full bg-mint" />
        </div>
      ))}
    </div>
  )
}
