import SkeletonCard from './SkeletonCard'

export default function PageSkeleton() {
  return (
    <div className="page" aria-busy="true" aria-label="Loading page content" style={{ opacity: 0.85 }}>
      {/* Top Banner Shimmer */}
      <div
        className="shimmer"
        style={{
          width: '100%',
          height: '140px',
          borderRadius: '16px',
          marginBottom: '1.5rem',
        }}
      />

      {/* Category Pills Shimmer */}
      <div style={{ display: 'flex', gap: '8px', overflowX: 'hidden', marginBottom: '1.75rem' }}>
        <div className="shimmer" style={{ width: '80px', height: '36px', borderRadius: '999px', flexShrink: 0 }} />
        <div className="shimmer" style={{ width: '100px', height: '36px', borderRadius: '999px', flexShrink: 0 }} />
        <div className="shimmer" style={{ width: '90px', height: '36px', borderRadius: '999px', flexShrink: 0 }} />
        <div className="shimmer" style={{ width: '110px', height: '36px', borderRadius: '999px', flexShrink: 0 }} />
      </div>

      {/* Section Title Shimmer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div className="shimmer" style={{ width: '160px', height: '24px', borderRadius: '6px' }} />
        <div className="shimmer" style={{ width: '60px', height: '18px', borderRadius: '6px' }} />
      </div>

      {/* Product Cards Shimmer Grid */}
      <div className="product-grid premium-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  )
}
