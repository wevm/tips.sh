/** OG image components — business card style. */

export function OgIndex() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
        width: '100%',
        height: '100%',
        background: '#fdfdfd',
        padding: '64px 72px',
        fontFamily: 'CMU Serif',
      }}
    >
      <div
        style={{
          fontSize: '56px',
          fontWeight: 700,
          color: '#111',
          lineHeight: 1.2,
        }}
      >
        Tempo Improvement Proposals
      </div>

      <div
        style={{
          display: 'flex',
          marginTop: '32px',
          fontSize: '24px',
          color: '#555',
          lineHeight: 1.5,
          maxWidth: '800px',
        }}
      >
        Specifications defining protocol changes and enhancements to the Tempo blockchain.
      </div>
    </div>
  )
}

export function OgCard({
  number,
  title,
  authors,
}: {
  number: string
  title: string
  authors: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
        width: '100%',
        height: '100%',
        background: '#fdfdfd',
        padding: '64px 72px',
        fontFamily: 'CMU Serif',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '48px',
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          color: '#555',
          fontSize: '26px',
          letterSpacing: '0.03em',
        }}
      >
        Tempo Improvement Proposals
      </div>

      <div
        style={{
          fontSize: '52px',
          fontWeight: 700,
          color: '#111',
          lineHeight: 1.2,
          textAlign: 'center',
          maxWidth: '100%',
        }}
      >
        TIP-{number}: {title}
      </div>

      {authors && (
        <div
          style={{
            display: 'flex',
            marginTop: '32px',
            fontSize: '22px',
            color: '#555',
            fontStyle: 'italic',
          }}
        >
          {authors}
        </div>
      )}
    </div>
  )
}
