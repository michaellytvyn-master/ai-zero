import Link from 'next/link'

export default function ConversationList(props: {
  conversations: { id: string; title: string }[]
  activeId: string | null
}) {
  return (
    <aside style={{ borderRight: '1px solid var(--border)', padding: 14, overflowY: 'auto' }}>
      <Link href="/chat">
        <button type="button" style={{ width: '100%', marginBottom: 12 }}>
          New chat
        </button>
      </Link>
      {props.conversations.map((item) => (
        <Link
          key={item.id}
          href={`/chat?c=${item.id}`}
          style={{
            display: 'block',
            padding: '7px 9px',
            borderRadius: 7,
            fontSize: 13,
            textDecoration: 'none',
            color: item.id === props.activeId ? 'var(--text)' : 'var(--muted)',
            background: item.id === props.activeId ? 'var(--surface)' : 'transparent',
          }}
        >
          {item.title}
        </Link>
      ))}
    </aside>
  )
}
