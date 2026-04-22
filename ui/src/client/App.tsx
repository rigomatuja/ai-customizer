import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { CatalogBrowser } from './pages/CatalogBrowser'
import { CustomDetail } from './pages/CustomDetail'
import { Home } from './pages/Home'

export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/catalog" element={<CatalogBrowser />} />
        <Route path="/catalog/:type/:id" element={<CustomDetail />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  )
}

function NotFound() {
  return (
    <main className="page">
      <h1>Not found</h1>
      <p className="muted">That route does not exist.</p>
    </main>
  )
}
