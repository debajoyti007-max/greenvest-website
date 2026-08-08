export default function SkeletonCard() {
  return (
    <article className="product-tile skeleton-tile" aria-hidden="true">
      <div className="product-media skeleton-media">
        <div className="skeleton-img shimmer" />
      </div>
      <div className="product-body">
        <div className="skeleton-line shimmer" style={{ width: '70%', height: '1.1rem', marginBottom: '0.5rem' }} />
        <div className="skeleton-line shimmer" style={{ width: '45%', height: '0.85rem', marginBottom: '0.75rem' }} />
        <div className="skeleton-line shimmer" style={{ width: '55%', height: '1rem', marginBottom: '0.75rem' }} />
        <div className="skeleton-line shimmer" style={{ width: '100%', height: '2.4rem', borderRadius: '999px' }} />
      </div>
    </article>
  )
}
