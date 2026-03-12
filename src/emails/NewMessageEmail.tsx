interface NewMessageEmailProps {
  senderName: string;
  preview: string;
  conversationUrl: string;
}

export function NewMessageEmail({ senderName, preview, conversationUrl }: NewMessageEmailProps) {
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', maxWidth: 600, margin: '0 auto' }}>
      <h2 style={{ color: '#111' }}>New message from {senderName}</h2>
      <p style={{ color: '#666', fontSize: 16, lineHeight: 1.5 }}>&ldquo;{preview}&rdquo;</p>
      <a
        href={conversationUrl}
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
        View Conversation
      </a>
    </div>
  );
}
