export function Home() {
  return (
    <main className="home">
      <h1>AI Customizer</h1>
      <p className="subtitle">Customization manager for Claude Code and Opencode.</p>

      <section className="status">
        <h2>Status</h2>
        <p>
          <strong>Milestone M2</strong> — UI scaffold. Stack booteando en vacío.
        </p>
        <p className="muted">
          Real functionality arrives in M3 (read-only catalog browser).
        </p>
      </section>

      <section className="links">
        <a href="https://github.com/rigomatuja/ai-customizer/blob/main/docs/DESIGN.md" target="_blank" rel="noreferrer">
          Read the design spec →
        </a>
      </section>
    </main>
  )
}
