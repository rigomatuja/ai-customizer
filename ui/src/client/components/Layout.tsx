import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="app-shell">
      <nav className="app-nav">
        <div className="app-nav-brand">AI Customizer</div>
        <ul className="app-nav-links">
          <li>
            <NavLink to="/" end>
              Home
            </NavLink>
          </li>
          <li>
            <NavLink to="/catalog">Catalog</NavLink>
          </li>
        </ul>
      </nav>
      <div className="app-content">{children}</div>
    </div>
  )
}
