interface OrderConfirmationEmailProps {
  buyerName: string;
  listingTitle: string;
  amount: string;
  orderId: string;
}

export function OrderConfirmationEmail({ buyerName, listingTitle, amount, orderId }: OrderConfirmationEmailProps) {
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', maxWidth: 600, margin: '0 auto' }}>
      <h2 style={{ color: '#111' }}>Order Confirmed</h2>
      <p style={{ color: '#666', fontSize: 16, lineHeight: 1.5 }}>
        Hi {buyerName}, your purchase has been confirmed!
      </p>
      <div style={{ backgroundColor: '#f9f9f9', padding: 16, borderRadius: 8, margin: '16px 0' }}>
        <p style={{ margin: 0, fontWeight: 'bold', color: '#111' }}>{listingTitle}</p>
        <p style={{ margin: '4px 0 0', color: '#666' }}>Total: {amount}</p>
        <p style={{ margin: '4px 0 0', color: '#999', fontSize: 13 }}>Order #{orderId.slice(0, 8)}</p>
      </div>
      <p style={{ color: '#666', fontSize: 14 }}>
        The artist will be notified and will ship your piece soon.
      </p>
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
