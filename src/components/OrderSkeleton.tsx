export default function OrderSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }} aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <article
          key={i}
          className="order-card"
          style={{
            pointerEvents: 'none',
            opacity: 0.8,
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            border: '1px solid #e2e8f0',
          }}
        >
          {/* Header shimmer: Order ID + Date + Status Badge */}
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div className="shimmer" style={{ width: '90px', height: '18px', borderRadius: '4px' }} />
              <div className="shimmer" style={{ width: '70px', height: '14px', borderRadius: '4px' }} />
            </div>
            <div className="shimmer" style={{ width: '80px', height: '22px', borderRadius: '12px' }} />
          </header>

          {/* Timeline / Progress Shimmer */}
          <div style={{ margin: '0.85rem 0' }}>
            <div className="shimmer" style={{ width: '100%', height: '8px', borderRadius: '999px', marginBottom: '0.5rem' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div className="shimmer" style={{ width: '50px', height: '12px', borderRadius: '4px' }} />
              <div className="shimmer" style={{ width: '60px', height: '12px', borderRadius: '4px' }} />
              <div className="shimmer" style={{ width: '50px', height: '12px', borderRadius: '4px' }} />
            </div>
          </div>

          {/* Items shimmer */}
          <div style={{ padding: '0.5rem 0', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <div className="shimmer" style={{ width: '140px', height: '14px', borderRadius: '4px' }} />
              <div className="shimmer" style={{ width: '40px', height: '14px', borderRadius: '4px' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div className="shimmer" style={{ width: '110px', height: '14px', borderRadius: '4px' }} />
              <div className="shimmer" style={{ width: '40px', height: '14px', borderRadius: '4px' }} />
            </div>
          </div>

          {/* Footer Shimmer: Total + Action buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.85rem' }}>
            <div className="shimmer" style={{ width: '100px', height: '22px', borderRadius: '6px' }} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <div className="shimmer" style={{ width: '85px', height: '32px', borderRadius: '8px' }} />
              <div className="shimmer" style={{ width: '85px', height: '32px', borderRadius: '8px' }} />
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}
