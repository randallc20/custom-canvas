interface NewSaleEmailProps {
  artistName: string;
  listingTitle: string;
  amount: string;
  payoutAmount: string;
}

export function NewSaleEmail({ artistName, listingTitle, amount, payoutAmount }: NewSaleEmailProps) {
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', maxWidth: 600, margin: '0 auto' }}>
      <h2 style={{ color: '#111' }}>You made a sale!</h2>
      <p style={{ color: '#666', fontSize: 16, lineHeight: 1.5 }}>
        Congratulations {artistName}, someone just purchased your work!
      </p>
      <div style={{ backgroundColor: '#FFF7ED', padding: 16, borderRadius: 8, margin: '16px 0', border: '1px solid #E8704A33' }}>
        <p style={{ margin: 0, fontWeight: 'bold', color: '#111' }}>{listingTitle}</p>
        <p style={{ margin: '4px 0 0', color: '#666' }}>Sale price: {amount}</p>
        <p style={{ margin: '4px 0 0', color: '#E8704A', fontWeight: 'bold' }}>Your payout: {payoutAmount}</p>
      </div>
      <p style={{ color: '#666', fontSize: 14 }}>
        Please ship the piece promptly and update the order status.
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
