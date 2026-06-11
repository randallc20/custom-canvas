interface ShippingUpdateEmailProps {
  buyerName: string;
  listingTitle: string;
  trackingNumber: string | null;
}

export function ShippingUpdateEmail({ buyerName, listingTitle, trackingNumber }: ShippingUpdateEmailProps) {
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', maxWidth: 600, margin: '0 auto' }}>
      <h2 style={{ color: '#111' }}>Your order has shipped!</h2>
      <p style={{ color: '#666', fontSize: 16, lineHeight: 1.5 }}>
        Hi {buyerName}, great news — <strong>{listingTitle}</strong> is on its way to you!
      </p>
      {trackingNumber && (
        <div style={{ backgroundColor: '#f9f9f9', padding: 16, borderRadius: 8, margin: '16px 0' }}>
          <p style={{ margin: 0, color: '#666', fontSize: 13 }}>Tracking number:</p>
          <p style={{ margin: '4px 0 0', fontFamily: 'monospace', fontWeight: 'bold', color: '#111' }}>{trackingNumber}</p>
        </div>
      )}
      <a
        href={`${process.env.NEXT_PUBLIC_APP_URL}/orders`}
        style={{
          display: 'inline-block',
          padding: '12px 24px',
          backgroundColor: '#E8704A',
          color: '#fff',
          textDecoration: 'none',
          borderRadius: 6,
          fontWeight: 'bold',
          marginTop: 16,
        }}
      >
        View Order
      </a>
    </div>
  );
}
