interface ReviewReceivedEmailProps {
  artistName: string;
  rating: number;
  comment: string | null;
  reviewerName: string;
}

export function ReviewReceivedEmail({ artistName, rating, comment, reviewerName }: ReviewReceivedEmailProps) {
  const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', maxWidth: 600, margin: '0 auto' }}>
      <h2 style={{ color: '#111' }}>You received a review!</h2>
      <p style={{ color: '#666', fontSize: 16, lineHeight: 1.5 }}>
        Hi {artistName}, {reviewerName} left you a review.
      </p>
      <div style={{ backgroundColor: '#FFF7ED', padding: 16, borderRadius: 8, margin: '16px 0', border: '1px solid #E8704A33' }}>
        <p style={{ margin: 0, fontSize: 20, color: '#F59E0B' }}>{stars}</p>
        {comment && (
          <p style={{ margin: '8px 0 0', color: '#666', fontStyle: 'italic' }}>&ldquo;{comment}&rdquo;</p>
        )}
        <p style={{ margin: '4px 0 0', color: '#999', fontSize: 13 }}>— {reviewerName}</p>
      </div>
      <a
        href={`${process.env.NEXT_PUBLIC_APP_URL}/dashboard`}
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
        View Dashboard
      </a>
    </div>
  );
}
