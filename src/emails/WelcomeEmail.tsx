interface WelcomeEmailProps {
  name: string;
  role: string;
}

export function WelcomeEmail({ name, role }: WelcomeEmailProps) {
  const roleMessage = role === 'artist'
    ? 'Start by completing your profile and uploading your first piece.'
    : role === 'gallery'
    ? 'Your gallery application is under review. We\'ll notify you once verified.'
    : 'Discover one-of-a-kind pieces from Houston\'s most talented emerging artists.';

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', maxWidth: 600, margin: '0 auto' }}>
      <h2 style={{ color: '#111' }}>Welcome to Custom Canvas, {name}!</h2>
      <p style={{ color: '#666', fontSize: 16, lineHeight: 1.5 }}>
        Thank you for joining our community of artists and collectors.
      </p>
      <p style={{ color: '#666', fontSize: 16, lineHeight: 1.5 }}>{roleMessage}</p>
      <a
        href={`${process.env.NEXT_PUBLIC_APP_URL}`}
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
        Get Started
      </a>
    </div>
  );
}
